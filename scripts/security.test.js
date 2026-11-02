'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter, checkEnvironment, isPlaceholder, safeEqual } = require('../src/security');

test('placeholder detection rejects empty and known placeholder values', () => {
  assert.equal(isPlaceholder(''), true);
  assert.equal(isPlaceholder('PUT_BOT_TOKEN_HERE'), true);
  assert.equal(isPlaceholder('real-looking-secret-value'), false);
});

test('environment check requires a bot token and valid application ID', () => {
  const result = checkEnvironment({ DISCORD_TOKEN: 'PUT_BOT_TOKEN_HERE', CLIENT_ID: 'bad' });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some(x => x.level === 'error'));
});

test('command limiter returns retry information after threshold', () => {
  let time = 1000;
  const limiter = createLimiter({ max: 2, windowMs: 10000, penaltyMs: 30000, now: () => time });
  assert.equal(limiter.check('g:u').ok, true);
  assert.equal(limiter.check('g:u').ok, true);
  const limited = limiter.check('g:u');
  assert.equal(limited.ok, false);
  assert.equal(limited.retryAfterMs, 30000);
  time += 30001;
  assert.equal(limiter.check('g:u').ok, true);
});

test('timing-safe comparison rejects unequal or empty values', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
});
