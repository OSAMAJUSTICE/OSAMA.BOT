'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPinterestPinPage, categoryCandidates } = require('../src/image-categories');

test('Pinterest single-pin pages can be used with the user-selected image category', () => {
  const url = 'https://www.pinterest.com/pin/667447607288667162/';
  assert.equal(isPinterestPinPage(url), true);
  const opaque = ['https://i.pinimg.com/originals/aa/bb/cc/image.jpg', 'https://i.pinimg.com/736x/dd/ee/ff/related.webp'];
  assert.deepEqual(categoryCandidates(url, opaque, 'girls'), opaque);
});

test('non-Pinterest pages still use category URL filtering and invalid URLs are not treated as pins', () => {
  assert.equal(isPinterestPinPage('https://example.com/pin/123'), false);
  assert.equal(isPinterestPinPage('https://www.pinterest.com/search/pins/?q=girls'), false);
  assert.deepEqual(categoryCandidates('https://example.com/girls', ['https://cdn.example.com/girls/a.jpg', 'https://cdn.example.com/landscape.jpg'], 'girls', (url, category) => url.includes(category)), ['https://cdn.example.com/girls/a.jpg']);
});

test('Pinterest search results are accepted only when the search query matches the selected category', () => {
  const { isPinterestSearchPage, pinterestQueryMatchesCategory, categoryCandidates } = require('../src/image-categories');
  const girlsSearch = 'https://www.pinterest.com/search/pins/?q=beautiful%20girls';
  const boysSearch = 'https://www.pinterest.com/search/pins/?q=boys%20profile';
  const opaque = ['https://i.pinimg.com/736x/a/b/c/photo1.jpg', 'https://i.pinimg.com/736x/d/e/f/photo2.jpg'];
  assert.equal(isPinterestSearchPage(girlsSearch), true);
  assert.equal(pinterestQueryMatchesCategory(girlsSearch, 'girls'), true);
  assert.equal(pinterestQueryMatchesCategory(girlsSearch, 'boys'), false);
  assert.deepEqual(categoryCandidates(girlsSearch, opaque, 'girls'), opaque);
  assert.deepEqual(categoryCandidates(girlsSearch, opaque, 'boys'), []);
  assert.equal(pinterestQueryMatchesCategory(boysSearch, 'boys'), true);
});

test('Pinterest category query matching supports Arabic, GIF and banner searches', () => {
  const { pinterestQueryMatchesCategory } = require('../src/image-categories');
  assert.equal(pinterestQueryMatchesCategory('https://www.pinterest.com/search/pins/?q=%D8%A8%D9%86%D8%A7%D8%AA', 'girls'), true);
  assert.equal(pinterestQueryMatchesCategory('https://www.pinterest.com/search/pins/?q=boys%20gif', 'gif-boys'), true);
  assert.equal(pinterestQueryMatchesCategory('https://www.pinterest.com/search/pins/?q=anime%20banner', 'banner'), true);
});
