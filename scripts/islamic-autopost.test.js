'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'islamic-autopost.js'), 'utf8');

test('Islamic auto-post supports independent categories and bilingual content', () => {
  for (const category of ['quran', 'hadith', 'benefits', 'videos', 'adhkar', 'dua', 'tasbeeh', 'salawat', 'names', 'seerah', 'prayer', 'ramadan', 'mushaf']) {
    assert.match(source, new RegExp(`value:'${category}'`));
  }
  assert.match(source, /\*\*العربية \| Arabic\*\*/);
  assert.match(source, /\*\*English meaning \/ المعنى بالإنجليزية\*\*/);
});

test('prayer times request includes a local date in AlAdhan endpoint path', () => {
  assert.match(source, /timingsByCity\/\$\{apiDate\}\?city=/);
  assert.match(source, /timeZone:row\.timezone\|\|'Africa\/Cairo'/);
});

test('Quran video category no longer asks the administrator to paste a manual video URL', () => {
  assert.match(source, /TRUSTED_QURAN_VIDEO_FEEDS/);
  assert.doesNotMatch(source, /setName\('video-url'\)/);
});

test('Islamic posts use a separate persistent settings table and avoid mass mentions', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS islamic_settings/);
  assert.match(source, /allowedMentions:\{parse:\[\]\}/);
});

test('Islamic auto-post embeds attach the bundled mosque artwork rather than relying on a fragile external image URL', () => {
  const artwork = path.join(__dirname, '..', 'assets', 'islamic-mosque-banner.png');
  assert.ok(fs.existsSync(artwork), 'bundled mosque artwork must exist');
  assert.match(source, /embed\.setImage\('attachment:\/\/islamic-mosque-banner\.png'\)/);
  assert.match(source, /files:\[\{attachment:MOSQUE_BANNER,name:'islamic-mosque-banner\.png'\}\]/);
});


test('Islamic source review notes are included and unsupported historical attribution is absent', () => {
  const notes = path.join(__dirname, '..', 'ISLAMIC-SOURCES-REVIEW-AR.md');
  assert.ok(fs.existsSync(notes), 'source review notes must ship with the project');
  assert.match(fs.readFileSync(notes, 'utf8'), /Sunnah\.com/);
  assert.doesNotMatch(source, /معروفًا بين قومه بالصادق الأمين قبل البعثة/);
});


test('Seerah Arabic items and English meanings stay aligned; removed unsupported duplicate claim', () => {
  assert.match(source, /seerah:\['The first revelation came to the Prophet/);
  assert.match(source, /The Quran refers to the Prophet ﷺ and his companion in the cave during the Hijrah \(Quran 9:40\)/);
  assert.doesNotMatch(source, /known among his people as “the truthful and trustworthy” even before his prophethood/);
  assert.match(source, /أشار القرآن إلى موقف الهجرة في الغار/);
  assert.match(source, /English meaning \/ المعنى بالإنجليزية/);
});


test('catalog setup enables every configured Islamic category without per-category manual approval', () => {
  assert.match(source, /AUTO_ENABLE_CATEGORIES = new Set\(CATEGORIES\.map/);
  assert.match(source, /const REVIEW_REQUIRED_CATEGORIES = new Set\(\)/);
  assert.match(source, /setName\('setup-islamic-catalog'\)/);
  assert.match(source, /enabled:1,content_approved:1/);
  assert.match(source, /خلاصات القنوات المحددة مسبقًا/);
});

test('regular Islamic categories are scheduled on an independent 30-minute interval', () => {
  assert.match(source, /const CONTENT_INTERVAL_MS = 30 \* 60 \* 1000/);
  assert.match(source, /last_post_at INTEGER NOT NULL DEFAULT 0/);
  assert.match(source, /now\.getTime\(\) - Math\.max\(last, lastCheck\) < CONTENT_INTERVAL_MS/);
  assert.match(source, /SCHEDULER_TICK_MS = 10 \* 1000/);
});

test('prayer timetable is daily and follows configured city, country, timezone and calculation method', () => {
  assert.match(source, /timingsByCity\/\$\{apiDate\}\?city=/);
  assert.match(source, /countryPrayerMethod/);
  assert.match(source, /timezone,method,last_check_at/);
  assert.match(source, /r\.category === 'prayer'/);
});

test('prayer-time embed contains calculated times only, not unreviewed religious quotations or ritual text', () => {
  const body = source.slice(source.indexOf('function prayerEmbed'), source.indexOf('function nextRamadan'));
  assert.doesNotMatch(body, /الله أكبر، الله أكبر/);
  assert.doesNotMatch(body, /التَّحِيَّاتُ لِلَّهِ/);
  assert.match(body, /Times are calculated/);
});


test('Quran video publishing uses preconfigured trusted public channel feeds without requiring an API key or manual URL', () => {
  assert.match(source, /TRUSTED_QURAN_VIDEO_FEEDS/);
  assert.match(source, /UCos52azQNBgW63_9uDJoPDA/);
  assert.match(source, /UCKg2dp4g9Y0VOmciYlwsR7g/);
  assert.match(source, /feeds\/videos\.xml\?channel_id=/);
  assert.match(source, /last_video_id/);
  assert.doesNotMatch(source, /cat==='videos'&&!row\?\.video_url/);
});

test('one-command Islamic catalog setup is registered and preserves existing server settings', () => {
  assert.match(source, /setName\('setup-islamic-catalog'\)/);
  assert.match(source, /type:ChannelType\.GuildCategory/);
  assert.match(source, /type:ChannelType\.GuildText,parent:parent\.id/);
  assert.match(source, /Preserve existing channel\/location\/approval settings/);
  assert.match(source, /enabled:1,content_approved:1/);
});

test('Quran and Mushaf posts fetch a random Arabic ayah and a named English meaning from AlQuran Cloud', () => {
  assert.match(source, /api\.alquran\.cloud\/v1\/ayah\/random\/editions\/quran-uthmani,en\.sahih/);
  assert.match(source, /category==='quran'\|\|category==='mushaf'/);
  assert.match(source, /AlQuran Cloud/);
});


test('Quran videos are sent as plain canonical YouTube links so Discord can render its native playable preview', () => {
  assert.match(source, /buildQuranVideoMessage\(video\)/);
  assert.match(source, /content: `\$\{canonicalUrl\}/);
  assert.match(source, /await ch\.send\(message\)/);
  assert.doesNotMatch(source, /\[مشاهدة الفيديو على YouTube\]\(\$\{video\.url\}\)/);
});
