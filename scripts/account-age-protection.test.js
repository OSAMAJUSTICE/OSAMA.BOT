'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DAY_MS, accountAgeDays, shouldRejectNewAccount } = require('../src/account-age-protection');
const now = 2_000_000_000_000;
test('account age uses whole elapsed days', () => {
  assert.equal(accountAgeDays({ createdTimestamp: now - 7 * DAY_MS - 100 }, now), 7);
  assert.equal(accountAgeDays({ createdTimestamp: now - 6 * DAY_MS - 1 }, now), 6);
});
test('rejects only non-bot accounts younger than configured minimum', () => {
  assert.equal(shouldRejectNewAccount({ id: '1', createdTimestamp: now - 6 * DAY_MS }, 7, now), true);
  assert.equal(shouldRejectNewAccount({ id: '1', createdTimestamp: now - 7 * DAY_MS }, 7, now), false);
  assert.equal(shouldRejectNewAccount({ id: '1', bot: true, createdTimestamp: now - DAY_MS }, 7, now), false);
  assert.equal(shouldRejectNewAccount({ id: '1', createdTimestamp: now + DAY_MS }, 7, now), false);
});
