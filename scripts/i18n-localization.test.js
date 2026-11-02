'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const i18n = fs.readFileSync(path.join(root, 'src/i18n.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');

test('server and personal language selection remain persisted separately', () => {
  assert.match(i18n, /const serverLanguage = getServerLanguage\(interaction\.guildId\)/);
  assert.match(i18n, /if \(serverLanguage\) return serverLanguage/);
  assert.match(i18n, /return getUserLanguage\(interaction\.user\.id\) \|\| normalizeLanguage\(interaction\.locale\) \|\| 'en'/);
  assert.match(i18n, /INSERT INTO user_languages/);
  assert.match(i18n, /settings\.language\s*=\s*lang/);
});

test('Slash command registration applies Discord Arabic metadata localizations recursively', () => {
  assert.match(index, /commands\.map\(command\s*=>\s*i18n\.localizeCommandPayload\(command\.toJSON\(\)\)\)/);
  assert.match(i18n, /description_localizations/);
  assert.match(i18n, /copy\.options\.map\(localizeCommandPayload\)/);
  assert.match(i18n, /AR_COMMAND_DESCRIPTIONS/);
});

test('personal and server language commands include Arabic and English choices', () => {
  const commands = fs.readFileSync(path.join(root, 'src/commands.js'), 'utf8');
  assert.match(commands, /setName\('language'\)/);
  assert.match(commands, /setName\('serverlanguage'\)/);
  assert.match(commands, /name:'العربية',value:'ar'/);
  assert.match(commands, /name:'English',value:'en'/);
});
