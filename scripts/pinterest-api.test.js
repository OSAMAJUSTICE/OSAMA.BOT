'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pinterest = require('../src/pinterest-api');

test('extracts numeric Pinterest Pin IDs only from Pinterest Pin URLs', () => {
  assert.equal(pinterest.extractPinId('https://www.pinterest.com/pin/123456789/'), '123456789');
  assert.equal(pinterest.extractPinId('https://pinterest.com/pin/123456789?x=1'), '123456789');
  assert.equal(pinterest.extractPinId('https://example.com/pin/123456789'), null);
  assert.equal(pinterest.extractPinId('https://pinterest.com/board/123456789'), null);
});

test('extracts query text from Pinterest search result URLs', () => {
  assert.equal(pinterest.extractSearchQuery('https://www.pinterest.com/search/pins/?q=anime%20girls'), 'anime girls');
  assert.equal(pinterest.extractSearchQuery('https://example.com/search/pins/?q=anime'), null);
  assert.equal(pinterest.extractSearchQuery('https://pinterest.com/search/boards/?q=anime'), null);
});

test('extracts unique image URLs from Pinterest media variants in largest-first order', () => {
  const result = pinterest.imageUrlsFromPin({
    media: { images: {
      small: { url: 'https://i.pinimg.com/150x150/a.jpg', width: 150, height: 150 },
      large: { url: 'https://i.pinimg.com/1200x/a.jpg', width: 1200, height: 1200 },
      duplicate: { url: 'https://i.pinimg.com/1200x/a.jpg', width: 1200, height: 1200 },
      unsafe: { url: 'http://example.com/a.jpg', width: 3000, height: 3000 }
    } }
  });
  assert.deepEqual(result, ['https://i.pinimg.com/1200x/a.jpg', 'https://i.pinimg.com/150x150/a.jpg']);
});

test('reports Pinterest API as not configured without exposing or requiring a token', async () => {
  const previous = process.env.PINTEREST_ACCESS_TOKEN;
  delete process.env.PINTEREST_ACCESS_TOKEN;
  const status = await pinterest.testConnection();
  assert.equal(status.configured, false);
  assert.equal(status.ok, false);
  if (previous === undefined) delete process.env.PINTEREST_ACCESS_TOKEN;
  else process.env.PINTEREST_ACCESS_TOKEN = previous;
});
