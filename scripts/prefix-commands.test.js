const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');

test('default ! prefix commands exist alongside slash commands', () => {
  assert.match(source, /GatewayIntentBits\.MessageContent/);
  assert.match(source, /startsWith\('!'\)/);
  for (const name of ['help', 'commands', 'ping', 'serverinfo', 'userinfo', 'avatar', 'botinfo']) {
    assert.ok(source.includes(`prefixCommand==='${name}'`), `missing !${name} prefix handler`);
  }
  assert.match(source, /client\.on\('interactionCreate'/, 'slash interaction handler must remain');
  assert.match(source, /startsWith\('\+'\)/, 'legacy + commands must remain');
  assert.match(source, /moderation triggers/, 'legacy moderation trigger section must remain');
});

test('server shortcut management is admin-only and persists per-guild settings', () => {
  assert.match(source, /rawPrefixCommand==='shortcut'\|\|rawPrefixCommand==='shortcuts'/);
  assert.match(source, /if\(!admin\(m\.member\)\)return m\.reply\('❌ إدارة الاختصارات متاحة لإدارة السيرفر فقط/);
  assert.match(source, /updateGuildSettings\(m\.guild\.id,\{prefixShortcuts:next\}\)/);
  assert.match(source, /prefixShortcuts/);
  assert.match(source, /prefix_shortcut_add/);
  assert.match(source, /prefix_shortcut_remove/);
});

test('shortcuts can only target commands implemented by the Prefix bridge', () => {
  assert.match(source, /const prefixTargets=new Set\(\['help','commands','ping','serverinfo','userinfo','avatar','botinfo'\]\)/);
  assert.match(source, /if\(!prefixTargets\.has\(target\)\)return m\.reply\('❌ حاليًا الاختصارات تقبل الأوامر المدعومة فعليًا بالـPrefix فقط/);
  assert.match(source, /const prefixCommand=Object\.prototype\.hasOwnProperty\.call\(shortcuts,rawPrefixCommand\)\?shortcuts\[rawPrefixCommand\]:rawPrefixCommand/);
});
