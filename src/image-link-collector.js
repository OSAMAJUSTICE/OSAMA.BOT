'use strict';
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { safeFetch, parsePublicHttpsUrl } = require('./net-safe');
const db = require('./db');
const { createHash } = require('node:crypto');
const { extractImageUrls, sniffImage, urlHash } = require('./image-extract');
const { inferKind, isImageIntent, isPinterestSearchPage, pinterestQueryMatchesCategory, categoryCandidates } = require('./image-categories');
const pinterestApi = require('./pinterest-api');

const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1024;
const MAX_RESULTS = 80;
const MAX_CANDIDATES = 80;
const posting = new Set();

db.exec(`CREATE TABLE IF NOT EXISTS collected_image_seen (guild_id TEXT NOT NULL, content_hash TEXT NOT NULL, source_url TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'any', seen_at INTEGER NOT NULL, PRIMARY KEY(guild_id, content_hash));`);
const IMAGE_LINK_RE = /https:\/\/[^\s<>]+/ig;
const SEARCH_HOST_RE = /(?:images?\.|google\.|bing\.|pinterest\.|pin\.it$|unsplash\.|pexels\.|pixabay\.|giphy\.|tenor\.|wallhaven\.|deviantart\.|flickr\.)/i;
const SKIP_URL_RE = /(?:favicon|sprite|placeholder|logo|avatar-default|tracking|analytics)/i;

function cleanUrl(raw) {
  return String(raw || '').replace(/[),.!?\]}>'"،؛]+$/g, '');
}

function queryFromUrl(raw) {
  try {
    const u = new URL(raw);
    const keys = ['q', 'query', 'search', 'text', 'term', 'keyword', 'k'];
    for (const key of keys) { const value = u.searchParams.get(key); if (value && value.trim()) return value.trim().slice(0, 120); }
    return '';
  } catch { return ''; }
}
function matchesKind(url, kind) {
  if (SKIP_URL_RE.test(url)) return false;
  if (kind === 'gif') return /\.gif(?:$|[?#])/i.test(url) || /giphy|tenor/i.test(url);
  if (kind === 'banner') return true;
  if (kind === 'girls') return !/\b(?:boys?|men|male)\b/i.test(url);
  if (kind === 'boys') return !/\b(?:girls?|women|female)\b/i.test(url);
  return true;
}
function imageName(ext, index) { return `collected-image-${index + 1}.${ext}`; }

async function collectImages(rawUrl, messageText = '', guildId = '') {
  const pageUrl = parsePublicHttpsUrl(cleanUrl(rawUrl)).toString();
  const kind = inferKind(`${messageText} ${queryFromUrl(pageUrl)}`, pageUrl);
  // Use the already-configured official Pinterest API for Pin/search URLs.
  // A Pin normally yields one underlying image; a Pinterest search URL can yield many.
  let pinterestSource = null;
  if (pinterestApi.getToken()) {
    try {
      pinterestSource = await pinterestApi.loadPinterestSource(pageUrl);
    } catch (error) {
      // Do not hide an API auth/scope/rate-limit failure behind a generic HTML scrape error.
      if (pinterestApi.extractPinId(pageUrl) || pinterestApi.extractSearchQuery(pageUrl)) throw error;
      console.warn(`[ImageCollector] Pinterest API source lookup skipped: ${String(error.message || error).slice(0, 180)}`);
    }
  }
  let response, direct, candidates;
  if (pinterestSource?.candidates?.length) {
    response = { status: 200, url: pageUrl, headers: { 'content-type': 'application/json' }, body: Buffer.alloc(0) };
    direct = null;
    candidates = pinterestSource.candidates;
  } else {
    response = await safeFetch(pageUrl, {
      maxBytes: MAX_PAGE_BYTES,
      timeoutMs: 15000,
      headers: { accept: 'text/html,application/json,image/avif,image/webp,image/apng,image/*,*/*;q=0.8' }
    });
    if (response.status >= 400) throw new Error(`الموقع رجّع خطأ HTTP ${response.status}.`);
    direct = sniffImage(response.body);
    candidates = direct ? [response.url] : extractImageUrls({
      contentType: String(response.headers['content-type'] || ''),
      text: response.body.toString('utf8'),
      baseUrl: response.url
    });
  }
  if (!candidates.length) throw new Error('لم أجد صورًا قابلة للاستخراج من الصفحة. قد يكون الموقع يحتاج JavaScript أو يمنع الوصول المباشر.');

  const filtered = categoryCandidates(response.url, candidates, kind, matchesKind);
  if (isPinterestSearchPage(pageUrl) && kind !== 'any' && !pinterestQueryMatchesCategory(pageUrl, kind)) {
    throw new Error(`بحث Pinterest لا يطابق التصنيف المطلوب (${kind}). استخدم رابط بحث يحتوي على كلمة التصنيف مثل girls أو boys أو GIF أو banner.`);
  }
  // Pinterest CDN filenames are opaque: accept results only when the search query
  // itself identifies the requested category, rather than silently mixing categories.
  const pool = filtered.length ? filtered : (isPinterestSearchPage(pageUrl) ? [] : candidates);
  const seen = new Set();
  const results = [];
  const candidatesToTry = [...pool];
  for (let i = candidatesToTry.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidatesToTry[i], candidatesToTry[j]] = [candidatesToTry[j], candidatesToTry[i]]; }
  candidatesToTry.splice(MAX_CANDIDATES);
  for (const candidate of candidatesToTry) {
    if (results.length >= MAX_RESULTS) break;
    const hash = urlHash(candidate);
    if (seen.has(hash)) continue;
    seen.add(hash);
    try {
      const image = candidate === response.url && direct
        ? { status: response.status, body: response.body, url: response.url }
        : await safeFetch(candidate, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 12000, headers: { referer: `${new URL(response.url).origin}/`, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' } });
      if (image.status >= 400 || image.body.length < MIN_IMAGE_BYTES) continue;
      const type = sniffImage(image.body);
      if (!type) continue;
      if (kind === 'gif' && type.ext !== 'gif') continue;
      const contentHash = createHash('sha256').update(image.body).digest('hex');
      const alreadyPosted = db.prepare('SELECT 1 FROM collected_image_seen WHERE guild_id=? AND content_hash=?').get(String(guildId), contentHash);
      if (alreadyPosted) continue;
      if (results.some(item => item.contentHash === contentHash)) continue;
      results.push({ buffer: image.body, ext: type.ext, mime: type.mime, origin: image.url, contentHash });
    } catch { /* try the next image from the page */ }
  }
  if (!results.length) {
    const old = db.prepare('SELECT COUNT(*) AS n FROM collected_image_seen WHERE guild_id=?').get(String(guildId)).n;
    if (old) throw new Error('الصور التي وجدتها اتنشرت قبل كده أو الموقع لا يسمح بتنزيل صور جديدة. جرّب رابط بحث/ألبوم مختلف.');
    throw new Error('وجدت روابط، لكن لم أستطع تنزيل صور فعلية منها.');
  }
  return { results, kind, query: queryFromUrl(pageUrl), sourceHost: new URL(response.url).hostname };
}

async function postCollectedToChannel(channel, results, { kind = 'any', query = '', sourceHost = 'website', guildId = '' } = {}) {
  if (!channel?.guild || !channel.isTextBased() || typeof channel.send !== 'function') throw new Error('اختار قناة نصية صالحة داخل السيرفر.');
  const me = channel.guild.members.me;
  const perms = me && channel.permissionsFor(me);
  const { PermissionFlagsBits } = require('discord.js');
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks])) {
    throw new Error('البوت محتاج صلاحيات View Channel وSend Messages وAttach Files وEmbed Links في القناة المحددة.');
  }
  const label = ({ gif: 'GIF', banner: 'بانرات', girls: 'صور بنات', boys: 'صور شباب', any: 'صور متنوعة' })[kind] || 'صور';
  const batches = [];
  let batch = [], bytes = 0;
  for (const image of results) {
    if (batch.length && (batch.length >= 10 || bytes + image.buffer.length > 20 * 1024 * 1024)) { batches.push(batch); batch = []; bytes = 0; }
    batch.push(image); bytes += image.buffer.length;
  }
  if (batch.length) batches.push(batch);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const items = batches[batchIndex];
    const files = items.map((image, index) => new AttachmentBuilder(image.buffer, { name: imageName(image.ext, index), description: `${label} من ${sourceHost}` }));
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ ${label} • ${results.length} صور`)
      .setDescription(`تم جمع ${results.length} صورة جديدة من الموقع${query ? ` (بحث: **${query.replace(/[\\`*_{}\\[\\]()<>#+\\-.!|]/g, '').slice(0, 100)}**)` : ''}.\nالمصدر: ${sourceHost}${batches.length > 1 ? `\nالدفعة ${batchIndex + 1} من ${batches.length}` : ''}`)
      .setFooter({ text: 'IM YOUR DADDY • Image collector' }).setTimestamp();
    await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
  }
  const mark = db.prepare('INSERT OR IGNORE INTO collected_image_seen(guild_id,content_hash,source_url,category,seen_at) VALUES(?,?,?,?,?)');
  const tx = db.transaction(items => { for (const item of items) mark.run(String(guildId || channel.guild.id), item.contentHash, item.origin, kind, Date.now()); });
  tx(results);
  db.prepare('DELETE FROM collected_image_seen WHERE guild_id=? AND content_hash NOT IN (SELECT content_hash FROM collected_image_seen WHERE guild_id=? ORDER BY seen_at DESC LIMIT 5000)').run(String(guildId || channel.guild.id), String(guildId || channel.guild.id));
  return results.length;
}

async function handleMessage(message) {
  if (!message?.guild || message.author?.bot || !message.content) return false;
  const urls = [...message.content.matchAll(IMAGE_LINK_RE)].map(match => cleanUrl(match[0])).filter(Boolean);
  if (!urls.length) return false;
  const trimmedMessage = message.content.trim();
  const isBareLinkMessage = urls.length === 1 && trimmedMessage.replace(urls[0], '').trim() === '';
  const chosen = urls.find(url => {
    try {
      const u = new URL(url);
      // A URL sent by itself is an explicit request to inspect that page. This lets
      // arbitrary image galleries work even when the domain/path has no image keywords.
      return u.protocol === 'https:' && (isImageIntent(message.content) || SEARCH_HOST_RE.test(u.hostname) || /(?:image|photo|gallery|search|wallpaper|gif|pins?)/i.test(u.pathname) || isBareLinkMessage);
    } catch { return false; }
  });
  if (!chosen) return false;
  const lockKey = `${message.guild.id}:${message.channelId}`;
  if (posting.has(lockKey)) {
    await message.reply({ content: '⏳ بجمع صور للرابط السابق في القناة دي؛ جرّب تاني بعد لحظات.', allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
    return true;
  }
  posting.add(lockKey);
  try {
    const { results, kind, query, sourceHost } = await collectImages(chosen, message.content, message.guild.id);
    const label = ({ gif: 'GIF', banner: 'بانرات', girls: 'صور بنات', boys: 'صور شباب', any: 'صور متنوعة' })[kind] || 'صور';
    // Discord accepts at most 10 attachments per message. Keep each batch below
    // ~20 MiB as well, so large pages do not fail because of aggregate upload size.
    const batches = [];
    let batch = [], bytes = 0;
    for (const image of results) {
      if (batch.length && (batch.length >= 10 || bytes + image.buffer.length > 20 * 1024 * 1024)) {
        batches.push(batch); batch = []; bytes = 0;
      }
      batch.push(image); bytes += image.buffer.length;
    }
    if (batch.length) batches.push(batch);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const items = batches[batchIndex];
      const files = items.map((image, index) => new AttachmentBuilder(image.buffer, { name: imageName(image.ext, index), description: `${label} من ${sourceHost}` }));
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ ${label} • ${results.length} صور`)
        .setDescription(`جمعت ${results.length} صورة جديدة من الرابط${query ? ` (بحث: **${query.replace(/[\`*_{}\[\]()<>#+\-.!|]/g, '').slice(0, 100)}**)` : ''}.\nالمصدر: ${sourceHost}${batches.length > 1 ? `\nالدفعة ${batchIndex + 1} من ${batches.length}` : ''}`)
        .setFooter({ text: 'IM YOUR DADDY • Image collector' }).setTimestamp();
      const payload = { embeds: [embed], files, allowedMentions: { repliedUser: false, parse: [] } };
      if (batchIndex === 0) await message.reply(payload);
      else await message.channel.send(payload);
    }
    const mark = db.prepare('INSERT OR IGNORE INTO collected_image_seen(guild_id,content_hash,source_url,category,seen_at) VALUES(?,?,?,?,?)');
    const tx = db.transaction(items => { for (const item of items) mark.run(message.guild.id, item.contentHash, item.origin, kind, Date.now()); });
    try {
      tx(results);
      db.prepare('DELETE FROM collected_image_seen WHERE guild_id=? AND content_hash NOT IN (SELECT content_hash FROM collected_image_seen WHERE guild_id=? ORDER BY seen_at DESC LIMIT 5000)').run(message.guild.id, message.guild.id);
    } catch (dbError) {
      console.error('Could not persist collected-image deduplication state:', dbError.message);
    }
  } catch (error) {
    const safeMessage = String(error?.message || 'تعذّر استخراج الصور.').slice(0, 350);
    await message.reply({ content: `⚠️ لم أستطع استخراج صور جديدة من الرابط: ${safeMessage}`, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
  } finally { posting.delete(lockKey); }
  return true;
}

module.exports = { collectImages, postCollectedToChannel, handleMessage, queryFromUrl, MAX_RESULTS };
