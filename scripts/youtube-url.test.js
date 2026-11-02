'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validYouTubeUrl } = require('../src/youtube-url');

test('accepts supported canonical HTTPS YouTube URLs', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/live/dQw4w9WgXcQ',
    'https://youtube-nocookie.com/embed/dQw4w9WgXcQ'
  ]) assert.equal(validYouTubeUrl(url), true, url);
});

test('rejects non-HTTPS, lookalike hosts, credential URLs and invalid video paths', () => {
  for (const url of [
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evil-youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.example/watch?v=dQw4w9WgXcQ',
    'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch',
    'https://youtube.com.evil/watch?v=dQw4w9WgXcQ',
    'not a url',
    'https://youtu.be/short'
  ]) assert.equal(validYouTubeUrl(url), false, url);
});
