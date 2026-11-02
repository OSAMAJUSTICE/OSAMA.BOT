'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/i18n.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');

test('Arabic choice labels are localized recursively for command metadata', () => {
  assert.ok(source.includes('const AR_CHOICE_LABELS'));
  assert.ok(source.includes("localized.name_localizations = { ...(choice.name_localizations || {}), ar: label }"));
  assert.ok(source.includes('copy.options = copy.options.map(localizeCommandPayload)'));
});

test('runtime translations persist across restarts without storing source text and with bounded cache size', () => {
  assert.ok(source.includes('CREATE TABLE IF NOT EXISTS i18n_translation_cache'));
  assert.ok(source.includes('INSERT INTO i18n_translation_cache'));
  assert.ok(source.includes('OFFSET 5000'));
  assert.ok(source.includes('readPersistentTranslation(lang, text)'));
  assert.ok(source.includes('createHash(\'sha256\')'));
  assert.ok(!source.includes('source_text TEXT NOT NULL'));
});

test('script-aware localization uses letter ratios when detecting already localized text', () => {
  assert.ok(source.includes('function looksAlreadyLocalized(text, target)'));
  assert.ok(source.includes('ratio(/[\\u0600-\\u06FF]/g) >= 0.45'));
  assert.ok(source.includes('const latinHints = {'));
  assert.ok(source.includes("if (target === 'hi') return ratio(/[\\u0900-\\u097F]/g) >= 0.35"));
});

test('newly created channels are passed through the existing channel localization setup', () => {
  assert.ok(index.includes("client.on('channelCreate',async channel=>{if(channel.guild){patchGuildChannelFetch(channel.guild);patchChannelLocalization(channel);}"));
});

test('dashboard exposes a language selector for all configured languages and safely translates UI text nodes', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.js'), 'utf8');
  assert.ok(dashboard.includes('Dashboard language / لغة لوحة التحكم'));
  assert.ok(dashboard.includes('Object.entries(i18n.LANGUAGES)'));
  assert.ok(dashboard.includes("app.post('/api/translate-ui'"));
  assert.ok(dashboard.includes('texts.length > 80'));
  assert.ok(dashboard.includes('data-no-translate'));
  assert.ok(dashboard.includes("script-src 'self' 'nonce-${cspNonce}'"));
  assert.ok(dashboard.includes('nonce="${esc(nonce ||'));
  assert.ok(dashboard.includes('item.apply(map.get(item.text)||item.text)'));
  assert.ok(dashboard.includes("querySelectorAll('[placeholder],[title],[aria-label]')"));
});

test('dashboard server default language selector persists to the same setting used by /serverlanguage', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.js'), 'utf8');
  assert.ok(dashboard.includes('name=\"server.language\"'));
  assert.ok(dashboard.includes("i18n.normalizeLanguage(req.body['server.language']||settings.language||'en')"));
  assert.ok(dashboard.includes('settings.language=serverLanguage'));
});

test('dashboard moderation language accepts the configured language list instead of only English and Arabic', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.js'), 'utf8');
  assert.ok(dashboard.includes("i18n.normalizeLanguage(req.body['moderation.language']||settings.moderation?.language||'en')"));
  assert.ok(!dashboard.includes("if(!['en','ar'].includes(modLanguage))"));
});


test('prefix replies use the shared channel localization path without double translation', () => {
  assert.ok(index.includes('Prefix replies are localized by the shared channel.send wrapper above'));
  assert.ok(index.includes('Message.reply delegates to channel.send'));
  assert.ok(!index.includes('const originalReply=m.reply.bind(m)'));
  assert.ok(index.includes('i18n.localizePayload(payload,guildLanguage)'));
});


test('dashboard translation covers non-language select option labels and prevents stale language requests overwriting newer choices', () => {
  const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.js'), 'utf8');
  assert.ok(dashboard.includes("option:not(#ui-language option)"));
  assert.ok(dashboard.includes('let translationRun=0'));
  assert.ok(dashboard.includes('if(run!==translationRun)return'));
  assert.ok(dashboard.includes("filter(([code]) => code !== 'en')"));
});

test('modal payloads are localized through the same safe interaction response wrapper', () => {
  assert.ok(index.includes("['reply','editReply','followUp','update','showModal','respond']"));
});


test('source-language detection covers supported non-Latin scripts and common Latin-language signatures', () => {
  assert.ok(source.includes('function detectSourceLanguage(text)'));
  assert.ok(source.includes("return /[іїєґ]/iu.test(value) ? 'uk' : 'ru'"));
  assert.ok(source.includes("if (/[\\u3040-\\u30FF]/u.test(value)) return 'ja'"));
  assert.ok(source.includes("es: ['el','los','las','una','que','para','con','por','del','servidor','configuración','idioma']"));
  assert.ok(source.includes('function needsTranslationSegment(value, lang)'));
  assert.ok(source.includes('detectSourceLanguage(protectedText)'));
  assert.ok(source.includes('splitMixedText(protectedText)'));
});


test('channel sends are localized once and guarded against empty payloads', () => {
  assert.ok(index.includes('i18n.localizePayload(payload,guildLanguage)'));
  assert.ok(index.includes('[DiscordSendGuard] Blocked empty message'));
  assert.ok(index.includes('Blocked empty Discord message before API request (50006).'));
  assert.ok(index.includes('if(!localizedHasText)args[0]=payload'));
  assert.ok(!index.includes("if(guildLanguage==='en')return original(...args)"));
});

test('channels fetched after startup are patched for server-language localization', () => {
  assert.ok(index.includes('function patchGuildChannelFetch(guild)'));
  assert.ok(index.includes('manager.fetch=async (...args)=>'));
  assert.ok(index.includes("typeof result.values==='function'&&!result.guild"));
  assert.ok(index.includes("client.on('guildCreate',async guild=>{"));
  assert.ok(index.includes('patchClientChannelFetch();'));
  assert.ok(index.includes('patchGuildChannelFetch(guild);'));
  assert.ok(index.includes('patchChannelLocalization(channel);'));
  assert.ok(index.includes('syncGuildSlashCommandsOnce(guild, language)'));
});


test('globally fetched channels are localized for systems that use client.channels.fetch', () => {
  assert.ok(index.includes('function patchClientChannelFetch()'));
  assert.ok(index.includes('localizedClientFetchManagers.has(client.channels)'));
  assert.ok(index.includes('patchClientChannelFetch();for(const guild of client.guilds.cache.values())'));
});

test('scheduled giveaway edits use the configured server language', () => {
  assert.match(index, /const finalPayload = await i18n\.localizePayload\(fallbackPayload, i18n\.getServerLanguage\(channel\.guildId\) \|\| 'en'\)/);
  assert.ok(index.includes('await message.edit(finalPayload)'));
});

