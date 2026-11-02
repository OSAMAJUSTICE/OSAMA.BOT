'use strict';
// SSRF-safe HTTPS helpers. Every request (and every redirect hop) is validated and the TCP
// connection is pinned to the validated IP, so DNS rebinding cannot swap in a private address.
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc * 256) + Number(part), 0);
}
function inV4Range(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
}
const BLOCKED_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) return true; // hex-form mapped addresses: refuse
    if (/^f[cd]/.test(lower)) return true;      // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true;   // fe80::/10 link local
    if (/^ff/.test(lower)) return true;         // multicast
    if (lower.startsWith('64:ff9b:')) return true; // NAT64: could wrap a private v4
    if (lower.startsWith('2001:db8')) return true; // documentation range
    return false;
  }
  return true; // not an IP: treat as unsafe
}

function parsePublicHttpsUrl(raw) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { throw new Error('Invalid URL.'); }
  if (url.protocol !== 'https:') throw new Error('Only https:// links are allowed.');
  if (url.username || url.password) throw new Error('Links with embedded credentials are not allowed.');
  if (url.port && url.port !== '443') throw new Error('Only the default HTTPS port (443) is allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('This host is not allowed.');
  }
  return url;
}

async function resolvePublic(host) {
  const bare = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) {
    if (isPrivateIp(bare)) throw new Error('Private or reserved addresses are not allowed.');
    return { address: bare, family: net.isIP(bare) };
  }
  let records = [];
  let lookupError = null;
  try {
    records = await dns.lookup(bare, { all: true, verbatim: true });
  } catch (error) {
    lookupError = error;
  }
  // Some container DNS shims return malformed `lookup()` records (including an
  // undefined address). Try the DNS A-record resolver as a fallback before failing.
  let validRecords = Array.isArray(records)
    ? records.filter(r => r && typeof r.address === 'string' && net.isIP(r.address) !== 0 && net.isIP(r.address) === Number(r.family))
    : [];
  if (!validRecords.length) {
    try {
      const ipv4 = await dns.resolve4(bare);
      if (Array.isArray(ipv4)) validRecords = ipv4.filter(address => typeof address === 'string' && net.isIP(address) === 4).map(address => ({ address, family: 4 }));
    } catch (error) {
      const detail = String(error?.code || error?.message || lookupError?.code || lookupError?.message || 'unknown resolver error').slice(0,160);
      throw new Error(`DNS lookup failed for ${bare}: ${detail}`);
    }
  }
  if (!validRecords.length) {
    const detail = String(lookupError?.code || lookupError?.message || 'resolver returned no valid addresses').slice(0,160);
    throw new Error(`Host ${bare} did not resolve to a valid IP address (${detail}).`);
  }
  if (validRecords.some(r => isPrivateIp(r.address))) throw new Error('Host resolves to a private or reserved address.');
  // Prefer IPv4 because some container DNS shims return incomplete IPv6 metadata.
  return validRecords.find(r => r.family === 4) || validRecords[0];
}

// Validates a URL without fetching it (DNS check included). Returns the parsed URL.
async function assertPublicHttpsUrl(raw) {
  const url = parsePublicHttpsUrl(raw);
  await resolvePublic(url.hostname);
  return url;
}

function requestOnce(url, pinned, { timeoutMs, maxBytes, headers, headersOnly = false }) {
  return new Promise((resolve, reject) => {
    if (!pinned || typeof pinned.address !== 'string' || !net.isIP(pinned.address) || Number(pinned.family) !== net.isIP(pinned.address)) {
      reject(new Error('HTTPS request blocked: DNS resolver did not provide a valid pinned IP address.'));
      return;
    }
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      servername: net.isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      agent: false,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ImYourDaddyBot/3.11)', 'accept-encoding': 'identity', ...headers },
      // Node may invoke lookup with { all: true }, in which case its callback must
      // receive an array of address records rather than (address, family). Returning
      // a string in that mode can surface as ERR_INVALID_IP_ADDRESS: undefined.
      lookup: (_host, options, cb) => {
        if (options && typeof options === 'object' && options.all) {
          cb(null, [{ address: pinned.address, family: pinned.family }]);
          return;
        }
        cb(null, pinned.address, pinned.family);
      },
      timeout: timeoutMs
    }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url).toString(), status });
      }
      if (headersOnly) { res.destroy(); return resolve({ status, headers: res.headers, body: Buffer.alloc(0) }); }
      const declared = Number(res.headers['content-length'] || 0);
      if (declared && declared > maxBytes) { res.destroy(); return reject(new Error('Response is too large.')); }
      const chunks = []; let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) { res.destroy(); return reject(new Error('Response is too large.')); }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

async function safeFetch(rawUrl, { timeoutMs = 10000, maxBytes = 8 * 1024 * 1024, maxRedirects = 3, headers = {}, headersOnly = false } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = parsePublicHttpsUrl(current);
    const pinned = await resolvePublic(url.hostname);
    const result = await requestOnce(url, pinned, { timeoutMs, maxBytes, headers, headersOnly });
    if (result.redirect) { current = result.redirect; continue; }
    return { url: url.toString(), status: result.status, headers: result.headers, body: result.body };
  }
  throw new Error('Too many redirects.');
}

// Follows redirects with full validation and returns the final URL plus its content-type, without downloading the body.
async function resolveFinalUrl(rawUrl, options = {}) {
  const result = await safeFetch(rawUrl, { ...options, headersOnly: true });
  return { url: result.url, status: result.status, contentType: String(result.headers['content-type'] || '').toLowerCase() };
}

module.exports = { isPrivateIp, parsePublicHttpsUrl, assertPublicHttpsUrl, safeFetch, resolveFinalUrl };
