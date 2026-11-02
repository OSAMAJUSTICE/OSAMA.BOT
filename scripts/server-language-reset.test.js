const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('server language reset slash command is registered', () => {
  const commands = fs.readFileSync(path.join(root, 'src/commands.js'), 'utf8');
  assert.match(commands, /setName\('serverlanguagereset'\)/);
});

test('server language reset handler checks permissions and reports errors', () => {
  const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  assert.match(index, /if\(n==='serverlanguagereset'\)/);
  assert.match(index, /i18n\.clearServerLanguage\(g\.id\)/);
  assert.match(index, /Could not reset server language/);
});

test('clearing the server language removes only the language key', () => {
  const i18n = fs.readFileSync(path.join(root, 'src/i18n.js'), 'utf8');
  assert.match(i18n, /function clearServerLanguage\(guildId\)/);
  assert.match(i18n, /delete settings\.language/);
  assert.match(i18n, /UPDATE guild_settings SET settings_json=\? WHERE guild_id=\?/);
});
