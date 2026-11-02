const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const commands = fs.readFileSync(path.join(root, 'src', 'commands.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');

test('panel image command supports built-in, server icon, and custom HTTPS sources', () => {
  assert.match(commands, /setName\('panel-image'\)/);
  assert.match(commands, /name:'Built-in panel artwork',value:'default'/);
  assert.match(commands, /name:'Server icon',value:'server'/);
  assert.match(commands, /name:'Custom HTTPS image URL',value:'custom'/);
  assert.match(commands, /setName\('panel-image'\)/);
  assert.doesNotMatch(commands, /setDefaultMemberPermissions\(/, 'commands should be discoverable in the slash picker; runtime handlers enforce permissions');
});

test('panel artwork preferences persist per server and panel and are reused when publishing', () => {
  assert.match(source, /imageMode:mode,imageUrl:mode==='custom'\?imageUrl:null/);
  assert.match(source, /function panelImageChoice\(guild,system,saved\)/);
  assert.match(source, /const art=panelImageChoice\(g,system,saved\)/);
  assert.match(source, /function saveDedicatedPanel\([\s\S]*?\.\.\.current,\[system\]/);
});

test('panel publishing and image changes enforce Discord Administrator permission', () => {
  assert.match(source, /if\(n==='publish-panel'\)\{\s*if\(!canManagePanels\(m\)\)/);
  assert.match(source, /if\(n==='panel-image'\)\{\s*if\(!canManagePanels\(m\)\)/);
  assert.match(source, /function canManagePanels\(member\)\{return Boolean\(member\?\.permissions\?\.has\(PermissionFlagsBits\.Administrator\)\);\}/);
});

test('interaction expiry is handled without a second reply', () => {
  assert.match(source, /e\?\.code===10062\|\|e\?\.rawError\?\.code===10062/);
  assert.match(source, /MessageFlags\.Ephemeral/);
});
