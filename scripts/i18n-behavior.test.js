'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const fakeDb = {
  exec() {},
  prepare() { return { get() { return null; }, run() { return { changes: 0 }; }, all() { return []; } }; }
};
Module._load = function(request, parent, isMain) {
  if (request === './db' && parent && /[\\/]src[\\/]i18n\.js$/.test(parent.filename)) return fakeDb;
  return originalLoad.call(this, request, parent, isMain);
};
const i18n = require('../src/i18n');
Module._load = originalLoad;

test('all configured language codes normalize and have a corresponding autocomplete entry', () => {
  const codes = Object.keys(i18n.LANGUAGES);
  assert.ok(codes.length >= 100, `expected a broad language catalog, got ${codes.length}`);
  assert.equal(i18n.CHOICES.length, codes.length);
  assert.ok(i18n.languageAutocomplete('').length <= 25);
  assert.ok(i18n.languageAutocomplete('zulu').some(choice => choice.value === 'zu'));
  assert.ok(i18n.languageAutocomplete('zh').some(choice => choice.value === 'zh'));
  for (const code of codes) assert.equal(i18n.normalizeLanguage(code), code);
  assert.equal(i18n.normalizeLanguage('zh-CN'), 'zh');
  assert.equal(i18n.normalizeLanguage('unsupported-language'), null);
  assert.equal(i18n.normalizeLanguage('xx'), null);
  assert.ok(!i18n.languageAutocomplete('xx').some(choice => choice.value === 'xx'));
  assert.equal(i18n.languageName('xx'), 'English');
});

test('source-language detection identifies supported writing systems and common French text', () => {
  const examples = [
    ['مرحبا', 'ar'], ['こんにちは', 'ja'], ['안녕하세요', 'ko'], ['你好', 'zh'],
    ['Привет', 'ru'], ['Привіт', 'uk'], ['Γεια', 'el'], ['สวัสดี', 'th'],
    ['नमस्ते', 'hi'], ['Bonjour à tous, veuillez choisir la langue', 'fr']
  ];
  for (const [sample, expected] of examples) assert.equal(i18n.detectSourceLanguage(sample), expected, sample);
});

test('source-language detection recognizes additional Latin-script languages so English targets do not skip them', () => {
  const examples = [
    ['Acest server nu are limba configurată', 'ro'],
    ['Tämä palvelin käyttää kieltä ja asetuksia', 'fi'],
    ['Seva na lugha katika mipangilio', 'sw'],
    ['Poslužitelj je na hrvatskom jeziku i postavke nisu dostupne', 'hr'],
    ['Servilo kaj lingvo por agordoj', 'eo']
  ];
  for (const [sample, expected] of examples) assert.equal(i18n.detectSourceLanguage(sample), expected, sample);
});

test('runtime localization avoids sending plain URLs and numeric IDs to the translation provider', async () => {
  assert.equal(await i18n.translateRuntimeText('https://example.com/image.png', 'ar'), 'https://example.com/image.png');
  assert.equal(await i18n.translateRuntimeText('123456789012345678', 'ar'), '123456789012345678');
});


test('server language is a strict guild-wide default and Arabic bot text can translate to English', () => {
  assert.equal(i18n.shouldTranslateRuntimeText('تم نشر اللوحة بنجاح.', 'en'), true);
  assert.equal(i18n.shouldTranslateRuntimeText('تم نشر اللوحة بنجاح.', 'ar'), false);
  assert.equal(i18n.shouldTranslateRuntimeText('Roulette / الروليت', 'ar'), true);
  assert.equal(i18n.shouldTranslateRuntimeText('Roulette / الروليت', 'en'), true);
  assert.equal(i18n.shouldTranslateRuntimeText('Operation completed successfully.', 'en'), false);
});


test('runtime translator translates Arabic replies into English and localizes mixed bilingual messages', async () => {
  const originalFetch = global.fetch;
  global.fetch = async request => {
    const url = new URL(String(request));
    const pair = url.searchParams.get('langpair');
    const query = url.searchParams.get('q') || '';
    const markers = [...query.matchAll(/ZXQPROTECTED\d+QXZ/g)].map(match => match[0]);
    const translatedText = pair === 'ar|en'
      ? (markers.length >= 2 ? `${markers[0]}Panel posted successfully.${markers[1]}` : 'Panel posted successfully.')
      : pair === 'en|ar' ? 'تم نشر اللوحة بنجاح.'
      : query;
    return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText } }) };
  };
  try {
    assert.equal(await i18n.translateRuntimeText('تم نشر اللوحة بنجاح.', 'en'), 'Panel posted successfully.');
    assert.equal(await i18n.translateRuntimeText('**تم نشر اللوحة بنجاح.**', 'en'), '**Panel posted successfully.**');
    assert.equal(await i18n.translateRuntimeText('Roulette / الروليت', 'ar'), 'تم نشر اللوحة بنجاح. / الروليت');
  } finally {
    global.fetch = originalFetch;
  }
});


test('runtime localization preserves clean source text when translation fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('offline test'); };
  try {
    const translated = await i18n.translateRuntimeText('هذا نص فريد لاختبار فشل خدمة الترجمة.', 'en');
    assert.equal(translated, 'هذا نص فريد لاختبار فشل خدمة الترجمة.');
    assert.doesNotMatch(translated, /translation unavailable|⚠️/i);
  } finally {
    global.fetch = originalFetch;
  }
});


test('translation requests keep multibyte Arabic chunks below MyMemory UTF-8 byte limit', async () => {
  const originalFetch = global.fetch;
  const sent = [];
  global.fetch = async request => {
    const url = new URL(String(request));
    const q = url.searchParams.get('q') || '';
    sent.push(q);
    return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: q } }) };
  };
  try {
    await i18n.translateText(('اختبار الترجمة العربية مع كلمات متعددة. ').repeat(40), 'ar', 'en');
    assert.ok(sent.length > 1, 'long Arabic text should be split into multiple requests');
    for (const chunk of sent) assert.ok(Buffer.byteLength(chunk, 'utf8') <= 440, `query was ${Buffer.byteLength(chunk, 'utf8')} bytes`);
  } finally {
    global.fetch = originalFetch;
  }
});
