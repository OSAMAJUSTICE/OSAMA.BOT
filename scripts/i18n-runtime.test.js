'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const i18n = fs.readFileSync(path.join(root, 'src', 'i18n.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');

test('configured server language takes priority for all guild commands; personal language is the fallback', () => {
  assert.match(i18n, /const serverLanguage = getServerLanguage\(interaction\.guildId\)/);
  assert.match(i18n, /if \(serverLanguage\) return serverLanguage/);
  assert.match(i18n, /return getUserLanguage\(interaction\.user\.id\) \|\| normalizeLanguage\(interaction\.locale\) \|\| 'en'/);
});

test('server language is persisted in guild_settings without replacing other settings', () => {
  assert.match(i18n, /settings\.language=lang/);
  assert.match(i18n, /INSERT INTO guild_settings\(guild_id,settings_json\) VALUES\(\?,\?\) ON CONFLICT\(guild_id\) DO UPDATE SET settings_json=excluded\.settings_json/);
});

test('all interaction response/edit methods pass through localization with safe fallback', () => {
  assert.match(index, /\['reply','editReply','followUp','update','showModal','respond'\]/);
  assert.match(index, /i18n\.localizePayload\(payload,i18n\.languageFor\(i\)\)/);
  assert.match(index, /Response localization failed for/);
});

test('event logs use the server default language before the optional legacy log setting', () => {
  assert.match(index, /i18n\.getServerLanguage\(channel\.guild\.id\)\|\|i18n\.normalizeLanguage\(settings\(channel\.guild\.id\)\.logs\?\.language\)\|\|'en'/);
  assert.match(index, /patchChannelLocalization\(channel\)/);
  assert.match(index, /i18n\.localizePayload/);
});

test('runtime localization preserves component values, IDs, URLs and file attachments', () => {
  assert.match(i18n, /key === 'custom_id'.*key === 'url'.*key === 'files'.*key === 'value'/);
  assert.match(i18n, /protectRuntimeTokens/);
  assert.match(i18n, /RUNTIME_CACHE_LIMIT/);
});


test('English is a real target language for Arabic hard-coded bot responses', () => {
  assert.match(i18n, /function shouldTranslateRuntimeText\(value, target\)/);
  assert.match(i18n, /function needsTranslationSegment\(value, lang\)/);
  assert.match(i18n, /if \(source === lang\) return false/);
});

test('language selection uses autocomplete instead of Discord’s 25-choice cap', () => {
  const commands = fs.readFileSync(path.join(root, 'src', 'commands.js'), 'utf8');
  assert.match(commands, /setName\('serverlanguage'\)[^\n]*setAutocomplete\(true\)/);
  assert.match(index, /i\.isAutocomplete\(\)/);
  assert.match(index, /i18n\.languageAutocomplete\(focused\.value\)/);
});


test('personal language command explains it is DM-only when a server default is configured', () => {
  assert.match(index, /Personal language preference saved for DMs\. This server uses/);
  assert.match(index, /if\(g&&i18n\.getServerLanguage\(g\.id\)\)/);
});

test('slash replies are acknowledged before runtime translation can wait on remote providers', () => {
  const replyWrapper = index.slice(index.indexOf("i[method]=async payload=>"), index.indexOf("if(i.isChatInputCommand?.()&&i.commandName==='automod')"));
  assert.ok(replyWrapper.indexOf('interactionAckPromise = i.deferReply(deferOptions)') < replyWrapper.indexOf('i18n.localizePayload(payload,i18n.languageFor(i))'));
  assert.match(replyWrapper, /return i\.editReply\(localized\)/);
  assert.match(replyWrapper, /const ephemeral = .*flags & 64/);
});

test('runtime translation coalesces identical requests and limits concurrent cold-cache translations', () => {
  assert.match(i18n, /const runtimeTranslationInFlight = new Map\(\)/);
  assert.match(i18n, /runtimeTranslationInFlight\.has\(key\)/);
  assert.match(i18n, /RUNTIME_TRANSLATION_CONCURRENCY = 3/);
  assert.match(i18n, /runtimeTranslationQueue/);
});
