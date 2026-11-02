'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src', 'i18n.js'), 'utf8');

test('runtime localization no longer silently falls back after 250ms', () => {
  assert.doesNotMatch(index, /setTimeout\(\(\)=>resolve\(payload\),250\)/);
  assert.match(index, /await i18n\.localizePayload\(payload,i18n\.languageFor\(i\)\)/);
  assert.match(index, /Response localization failed for/);
});

test('runtime payload localization explicitly handles embed fields and component labels without changing IDs or URLs', () => {
  assert.match(i18n, /key === 'fields' && Array\.isArray\(value\)/);
  assert.match(i18n, /name: typeof field\.name === 'string' \? await translateRuntimeText/);
  assert.match(i18n, /key === 'custom_id'.*key === 'url'.*key === 'files'/);
  assert.match(i18n, /const shouldTranslate = TRANSLATABLE_KEYS\.has\(key\) && typeof value === 'string'/);
});


test('slow slash-command handlers are auto-acknowledged and late replies become edits', () => {
  assert.match(index, /interactionAckTimer = setTimeout\([\s\S]*?1750\)/);
  assert.match(index, /interactionAckPromise = i\.deferReply\(\)/);
  assert.match(index, /if \(interactionAckPromise\) \{ await interactionAckPromise; return i; \}/);
  assert.match(index, /method === 'reply' && i\.deferred[\s\S]*?i\.editReply\(localized\)/);
  assert.match(index, /finally \{ if \(interactionAckTimer\) clearTimeout\(interactionAckTimer\); \}/);
});

test('guild command sync uses an atomic bulk overwrite for fast slash registration', () => {
  assert.match(index, /if \(chatInputBody\.length > 100\)/);
  assert.match(index, /await rest\.put\(route, \{ body: bulkBody \}\)/);
  assert.match(index, /Bulk-registering \$\{chatInputBody\.length\} slash commands/);
});
