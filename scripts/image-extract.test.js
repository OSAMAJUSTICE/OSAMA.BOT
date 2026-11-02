const test = require('node:test');
const assert = require('node:assert/strict');
const { extractImageUrls, sniffImage, urlHash } = require('../src/image-extract');
const { inferKind, isImageIntent } = require('../src/image-categories');

test('extracts image URLs from nested JSON, including extension-less image keys', () => {
  const json = JSON.stringify({ results: [{ url: 'https://cdn.example.com/a/b' }, { meta: { file: 'https://x.example.com/p.PNG?v=1' } }, { page: 'https://example.com/post/1' }] });
  const urls = extractImageUrls({ contentType: 'application/json', text: json, baseUrl: 'https://api.example.com/' });
  assert.deepEqual(urls.sort(), ['https://cdn.example.com/a/b', 'https://x.example.com/p.PNG?v=1'].sort());
});

test('extracts og:image and lazy-loaded images from HTML and skips logos, svg and http links', () => {
  const html = `<html><head><meta property="og:image" content="/banner.jpg"></head><body>
    <img src="/logo.png"><img data-src="https://img.example.com/big.webp" src="/placeholder.gif">
    <img srcset="/s1.jpg 1x, /s2.jpg 2x"><img src="http://insecure.example.com/x.jpg"><img src="/icon.svg"></body></html>`;
  const urls = extractImageUrls({ contentType: 'text/html', text: html, baseUrl: 'https://site.example.com/gallery' });
  assert.ok(urls.includes('https://site.example.com/banner.jpg'));
  assert.ok(urls.includes('https://img.example.com/big.webp'));
  assert.ok(urls.includes('https://site.example.com/s2.jpg'));
  assert.ok(!urls.some(u => /logo|icon|insecure|placeholder/.test(u)));
});

test('magic-byte sniffing accepts real images only', () => {
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(16)])).ext, 'jpg');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(16)])).ext, 'png');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)])).ext, 'gif');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])).ext, 'webp');
  assert.equal(sniffImage(Buffer.from('<html>not an image at all</html>')), null);
  assert.equal(urlHash('a'), urlHash('a'));
  assert.notEqual(urlHash('a'), urlHash('b'));
});


test('image intent recognizes Arabic words without relying on ASCII word boundaries', () => {
  assert.equal(inferKind('عايز صور بنات', ''), 'girls');
  assert.equal(inferKind('هات صور شباب', ''), 'boys');
  assert.equal(inferKind('عايز بانر للسيرفر', ''), 'banner');
  assert.equal(inferKind('صور متحركة', ''), 'gif');
  assert.equal(isImageIntent('ابعت صور من الرابط ده'), true);
  assert.equal(isImageIntent('عايز بنات من Pinterest'), true);
  assert.equal(inferKind('show me girls', ''), 'girls');
});

test('extracts extensionless image URLs, metadata with reversed attributes, and CSS backgrounds', () => {
  const html = `<html><head><meta content="https://cdn.example.com/og-image?id=42" property="og:image"></head><body>
    <picture><source srcset="https://cdn.example.com/small 1x, https://cdn.example.com/large 2x"></picture>
    <div style="background-image:url('https://cdn.example.com/background?id=7')"></div>
  </body></html>`;
  const urls = extractImageUrls({ contentType: 'text/html', text: html, baseUrl: 'https://site.example.com/gallery' });
  assert.ok(urls.includes('https://cdn.example.com/og-image?id=42'));
  assert.ok(urls.includes('https://cdn.example.com/large'));
  assert.ok(urls.includes('https://cdn.example.com/background?id=7'));
});


test('extracts extensionless CDN URLs from image arrays in JSON APIs', () => {
  const json = JSON.stringify({ data: { images: [
    'https://cdn.example.com/media/opaque-id-1',
    'https://cdn.example.com/media/opaque-id-2?token=abc'
  ] } });
  const urls = extractImageUrls({ contentType: 'application/json', text: json, baseUrl: 'https://api.example.com/search' });
  assert.ok(urls.includes('https://cdn.example.com/media/opaque-id-1'));
  assert.ok(urls.includes('https://cdn.example.com/media/opaque-id-2?token=abc'));
});
