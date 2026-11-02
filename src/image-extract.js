'use strict';
const crypto = require('node:crypto');

const IMAGE_EXT = /\.(?:jpe?g|png|gif|webp)(?:$|[?#])/i;
const SKIP_HINT = /(?:logo|sprite|favicon|\/icons?\/|placeholder|blank|pixel|spacer|emoji|badge|loading)/i;
const MAX_CANDIDATES = 300;

function absolutize(candidate, baseUrl) {
  try {
    const url = new URL(String(candidate).trim().replace(/&amp;/g, '&'), baseUrl);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function walkJson(value, out, depth = 0, imageContext = false) {
  if (depth > 10 || out.size >= MAX_CANDIDATES) return;
  if (typeof value === 'string') {
    const candidate = value.replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
    if (/^https:\/\//i.test(candidate) && (IMAGE_EXT.test(candidate) || imageContext)) out.add(candidate);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, out, depth + 1, imageContext);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const keyLooksImage = /^(?:images?|imageurl|image_url|img|src|srcset|thumbnail|thumbnailurl|thumbnail_url|contenturl|content_url|original|originalurl|original_url|photo|photos|picture|pictures|media|preview|large|full|url)$/i.test(key);
      if (typeof item === 'string' && /^https?:\/\//i.test(item) && keyLooksImage) {
        // Image-bearing API fields often use opaque CDN URLs without file extensions.
        if (/^https:\/\//i.test(item)) out.add(item.replace(/\\\//g, '/').replace(/\\u0026/gi, '&'));
      } else {
        walkJson(item, out, depth + 1, imageContext || /^(?:images?|photos|pictures|media)$/i.test(key));
      }
      if (out.size >= MAX_CANDIDATES) return;
    }
  }
}

function fromHtml(html, baseUrl, out) {
  const decoded = String(html || '').replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/gi, '&').replace(/&#x26;/gi, '&');
  // Metadata attributes are not required to appear in a particular order.
  for (const tag of decoded.match(/<meta\b[^>]*>/gi) || []) {
    const key = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!/^(?:og:image(?::secure_url)?|twitter:image(?::src)?|og:image:url|image)$/i.test(key)) continue;
    const value = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] || tag.match(/\bvalue\s*=\s*["']([^"']+)["']/i)?.[1];
    const abs = value && absolutize(value, baseUrl);
    if (abs) out.add(abs);
  }
  const addPick = value => {
    if (!value || out.size >= MAX_CANDIDATES) return;
    const clean = value.trim().replace(/^['"]|['"]$/g, '');
    const abs = absolutize(clean, baseUrl);
    if (abs && !/^data:/i.test(abs) && !/\.svg(?:$|[?#])/i.test(abs)) out.add(abs);
  };
  // <img>, <source>, picture, and common lazy-loading attributes. Extensionless CDN URLs are valid.
  for (const tag of decoded.match(/<(?:img|source)\b[^>]*>/gi) || []) {
    if (out.size >= MAX_CANDIDATES) break;
    for (const attr of ['data-srcset', 'srcset']) {
      const value = tag.match(new RegExp('\\b' + attr + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i'))?.[1];
      if (value) {
        const choices = value.split(',').map(part => part.trim()).filter(Boolean);
        // Select the largest declared candidate when descriptors are present.
        choices.sort((a, b) => {
          const score = x => { const m = x.match(/\s+(\d+(?:\.\d+)?)(w|x)\s*$/i); return m ? Number(m[1]) * (m[2].toLowerCase() === 'x' ? 10000 : 1) : 1; };
          return score(a) - score(b);
        });
        addPick(choices.at(-1)?.split(/\s+/)[0]);
      }
    }
    for (const attr of ['data-original', 'data-original-src', 'data-lazy-src', 'data-src', 'data-image', 'data-full', 'data-url', 'src', 'content']) {
      const value = tag.match(new RegExp('\\b' + attr + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i'))?.[1];
      if (value) addPick(value);
    }
  }
  // CSS background images are common on galleries that do not use img tags.
  for (const match of decoded.matchAll(/background(?:-image)?\s*:[^;}]*?url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) addPick(match[1]);
  // Some sites embed JSON-LD or serialized image URLs in scripts without image extensions.
  for (const match of decoded.matchAll(/(?:"(?:image|contentUrl|thumbnailUrl|originalUrl|image_url)"\s*:\s*"|https?:\\?\/\\?\/)[^"'\s<>]{8,1000}/gi)) {
    const raw = match[0].replace(/^"[^:]+"\s*:\s*"/, '').replace(/\\\//g, '/').replace(/["\\]+$/g, '');
    if (/^https?:\/\//i.test(raw)) addPick(raw);
  }
}
// Returns an array of unique https image URLs found in a response body.
function extractImageUrls({ contentType = '', text = '', baseUrl }) {
  const out = new Set();
  const type = String(contentType).toLowerCase();
  if (type.includes('json') || /^\s*[\[{]/.test(text)) {
    try { walkJson(JSON.parse(text), out); } catch { /* not JSON after all */ }
  }
  if (type.includes('html') || /<html|<img|<source|<meta/i.test(text)) fromHtml(text, baseUrl, out);
  return [...out]
    .map(u => absolutize(u, baseUrl))
    .filter(u => u && !SKIP_HINT.test(u) && !/\.svg(?:$|[?#])/i.test(u))
    .slice(0, MAX_CANDIDATES);
}

// Magic-byte check so we never upload something that merely claims to be an image.
function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.slice(0, 6).toString('latin1') === 'GIF87a' || buffer.slice(0, 6).toString('latin1') === 'GIF89a') return { ext: 'gif', mime: 'image/gif' };
  if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

const urlHash = url => crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 32);

module.exports = { extractImageUrls, sniffImage, urlHash };
