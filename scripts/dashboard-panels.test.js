'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const dashboard = fs.readFileSync('src/dashboard.js', 'utf8');
const index = fs.readFileSync('src/index.js', 'utf8');
test('dashboard exposes separate system panels and populated channel/role selectors', () => {
  for (const text of ['Verification & auto roles', 'Temporary voice rooms', 'Backups & server tools', 'channelSelect', 'roleSelect']) assert.ok(dashboard.includes(text), `missing dashboard feature: ${text}`);
});
test('dashboard backup route is permission checked and emits a server template', () => {
  assert.ok(dashboard.includes("app.get('/servers/:id/backup'"));
  assert.ok(dashboard.includes("format:'im-your-daddy-server-template'"));
});
test('verification button grants configured role only after server-side checks', () => {
  assert.ok(index.includes("i.customId==='member_verify'"));
  assert.ok(index.includes('PermissionFlagsBits.ManageRoles'));
  assert.ok(index.includes("audit(g.id,i.user.id,'member_verified'"));
});
test('Quest and Lavalink music panels and handlers are removed', () => {
  assert.doesNotMatch(index, /questDb|questService|quest_guild_settings|client\.lavalink|musicSettings\./);
  assert.doesNotMatch(index, /sp:music:/);
});

test('in-Discord control command and protected interactive panels are registered', () => {
  const commands = fs.readFileSync('src/commands.js', 'utf8');
  for (const text of ["setName('control')", "ctl:system", "ctl:channel:", "ctl:role:", "ctl:toggle:", "ctl:backup", "ctl:post-verification"]) assert.ok(commands.includes(text) || index.includes(text), `missing in-Discord control feature: ${text}`);
  assert.ok(index.includes("if(n==='control')") || index.includes("n==='control'"));
  assert.ok(index.includes("function canManagePanels(member)"));
  assert.ok(index.includes("config.moderation?.moderatorRoleIds"));
});

test('dedicated persistent panels are publishable per system and include separate artwork and controls', () => {
  const commands = fs.readFileSync('src/commands.js', 'utf8');
  for (const token of ["setName('publish-panel')", "setName('system')", "setName('channel')"]) assert.ok(commands.includes(token), `missing dedicated panel command field: ${token}`);
  for (const token of ['dedicatedPanelEmbed', 'dedicatedPanelComponents', 'message.pin', 'sp:channel:', 'sp:role:', 'sp:refresh:', 'sp:backup:backups']) assert.ok(index.includes(token), `missing persistent panel feature: ${token}`);
  for (const system of ['welcome','goodbye','logs','autorole','verification','tempVoice','tickets','suggestions','antiRaid','backups']) assert.ok(fs.existsSync(`assets/panels/${system}.png`), `missing artwork for ${system}`);
});

test('removed system artwork is absent while unrelated panel artwork remains', () => {
  assert.equal(fs.existsSync('assets/panels/music.png'), false);
  assert.equal(fs.existsSync('assets/panels/quests.png'), false);
  for (const system of ['welcome','goodbye','logs','autorole','verification','tempVoice','tickets','suggestions','antiRaid','backups']) assert.equal(fs.existsSync(`assets/panels/${system}.png`), true);
});
