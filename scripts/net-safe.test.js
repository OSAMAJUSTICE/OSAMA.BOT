const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIp, parsePublicHttpsUrl, assertPublicHttpsUrl } = require('../src/net-safe');

test('private, loopback, link-local and reserved IPs are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::7f00:1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('only plain public https URLs are accepted', () => {
  for (const bad of ['http://example.com/a.png', 'ftp://example.com', 'https://user:pw@example.com/', 'https://example.com:8443/', 'https://localhost/x', 'https://foo.internal/x', 'not a url', 'file:///etc/passwd']) {
    assert.throws(() => parsePublicHttpsUrl(bad), undefined, bad);
  }
  assert.equal(parsePublicHttpsUrl('https://example.com/a.png').hostname, 'example.com');
});

test('literal private addresses are rejected before any request', async () => {
  await assert.rejects(assertPublicHttpsUrl('https://127.0.0.1/a.png'));
  await assert.rejects(assertPublicHttpsUrl('https://[::1]/a.png'));
  await assert.rejects(assertPublicHttpsUrl('https://169.254.169.254/latest/meta-data'));
});

test('DNS resolution includes a fallback for container shims returning invalid lookup records', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'net-safe.js'), 'utf8');
  assert.match(source, /dns\.resolve4\(bare\)/);
  assert.match(source, /did not resolve to a valid IP address/);
  assert.match(source, /HTTPS request blocked: DNS resolver did not provide a valid pinned IP address/);
});

test('pinned HTTPS lookup supports Node lookup callbacks with options.all', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'net-safe.js'), 'utf8');
  assert.match(source, /options\s*&&\s*typeof options === 'object'\s*&&\s*options\.all/);
  assert.match(source, /cb\(null, \[\{ address: pinned\.address, family: pinned\.family \}\]\)/);
  assert.match(source, /cb\(null, pinned\.address, pinned\.family\)/);
});
