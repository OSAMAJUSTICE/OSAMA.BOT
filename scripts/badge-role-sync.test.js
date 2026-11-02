'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBadgeRoleSync } = require('../src/badge-role-sync');

function mockMember({ flags = {}, premiumSince = null, existingRoles = [] } = {}) {
  const role = { id: '12345678901234567', managed: false };
  const roleCache = new Map([[role.id, role]]);
  const memberRoleCache = new Map(existingRoles.map(id => [id, roleCache.get(id) || { id }]));
  const botMember = {
    permissions: { has: permission => permission === 'ManageRoles' },
    roles: { highest: { comparePositionTo: () => 1 } }
  };
  const guild = {
    id: '22345678901234567',
    roles: { cache: roleCache },
    members: { me: botMember }
  };
  const user = {
    id: '32345678901234567',
    bot: false,
    flags: flags === null ? null : { serialize: () => flags }
  };
  const member = {
    id: user.id,
    user,
    guild,
    premiumSince,
    client: { users: { fetch: async () => { throw new Error('fetch unavailable'); } } },
    roles: {
      cache: memberRoleCache,
      add: async r => { memberRoleCache.set(r.id, r); },
      remove: async r => { memberRoleCache.delete(r.id); }
    }
  };
  return { member, role, memberRoleCache };
}

test('assigns a mapped public badge role when the badge flag is present', async () => {
  const { member, role, memberRoleCache } = mockMember({ flags: { ActiveDeveloper: true } });
  const service = createBadgeRoleSync({ delayMs: 0, logger: { warn() {} } });
  const result = await service.syncMember(member, { ActiveDeveloper: role.id });
  assert.equal(result.added, 1);
  assert.equal(memberRoleCache.has(role.id), true);
});

test('does not remove roles when public flags are unavailable', async () => {
  const { member, role, memberRoleCache } = mockMember({ flags: null, existingRoles: ['12345678901234567'] });
  const service = createBadgeRoleSync({ delayMs: 0, logger: { warn() {} } });
  const result = await service.syncMember(member, { ActiveDeveloper: role.id });
  assert.equal(result.removed, 0);
  assert.equal(memberRoleCache.has(role.id), true);
  assert.equal(result.errors, 1);
});

test('assigns a booster role based on premiumSince without needing public flags', async () => {
  const { member, role, memberRoleCache } = mockMember({ flags: null, premiumSince: new Date() });
  const service = createBadgeRoleSync({ delayMs: 0, logger: { warn() {} } });
  const result = await service.syncMember(member, { Boost: role.id });
  assert.equal(result.added, 1);
  assert.equal(memberRoleCache.has(role.id), true);
});
