'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { activeRules } = require('../src/activity-role-sync');
test('detects named activities case-insensitively', () => {
  const result = activeRules({ activities: [{ name: 'Minecraft', type: 0 }, { name: 'Visual Studio Code', type: 0 }] });
  assert.equal(result.get('minecraftRoleId'), true);
  assert.equal(result.get('vscodeRoleId'), true);
  assert.equal(result.get('robloxRoleId'), false);
});
test('detects streaming activity by Discord activity type', () => {
  assert.equal(activeRules({ activities: [{ name: 'My stream', type: 1 }] }).get('streamingRoleId'), true);
  assert.equal(activeRules({ activities: [] }).get('streamingRoleId'), false);
});
