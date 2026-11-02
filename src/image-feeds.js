'use strict';
const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createHash } = require('node:crypto');
const db = require('./db');
const { safeFetch, parsePublicHttpsUrl } = require('./net-safe');
const { extractImageUrls, sniffImage, urlHash } = require('./image-extract');
const { isPinterestPinPage, isPinterestSearchPage, pinterestQueryMatchesCategory, categoryCandidates } = require('./image-categories');
const pinterestApi = require('./pinterest-api');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 6 * 1024;
const MAX_FEEDS_PER_GUILD = 40;
const CATEGORIES = Object.freeze({ girls: 'girls', boys: 'boys', 'girls-boys': 'mixed', couples: 'couples', banner: 'banner', gif: 'gif', 'gif-girls': 'gif-girls', 'gif-boys': 'gif-boys', anime: 'anime' });
const MAX_CANDIDATES = 80;
const AUTO_DISABLE_AFTER = 5;
const MIN_INTERVAL_MIN = 5;
const MAX_INTERVAL_MIN = 10080;

db.exec(`
CREATE TABLE IF NOT EXISTS image_feeds(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'any',
  channel_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  interval_min INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_post_at INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id,name)
);
CREATE INDEX IF NOT EXISTS idx_image_feeds_due ON image_feeds(enabled,interval_min,last_post_at);
CREATE TABLE IF NOT EXISTS image_feed_seen(
  feed_id INTEGER NOT NULL REFERENCES image_feeds(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY(feed_id,hash)
);
`);

const feedColumns = db.prepare("PRAGMA table_info('image_feeds')").all().map(c => c.name);
if (!feedColumns.includes('category')) db.exec("ALTER TABLE image_feeds ADD COLUMN category TEXT NOT NULL DEFAULT 'any'");
for (const [column, definition] of [
  ['last_check_at', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_scan_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_match_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_post_count', 'INTEGER NOT NULL DEFAULT 0']
]) if (!feedColumns.includes(column)) db.exec(`ALTER TABLE image_feeds ADD COLUMN ${column} ${definition}`);

const running = new Set();

function listFeeds(guildId) { return db.prepare('SELECT * FROM image_feeds WHERE guild_id=? ORDER BY name COLLATE NOCASE').all(guildId); }
function getFeed(guildId, name) { return db.prepare('SELECT * FROM image_feeds WHERE guild_id=? AND name=? COLLATE NOCASE').get(guildId, name); }

function addFeed({ guildId, name, category = 'any', channelId, sourceUrl, intervalMin, createdBy }) {
  if (listFeeds(guildId).length >= MAX_FEEDS_PER_GUILD) throw new Error(`A server can have at most ${MAX_FEEDS_PER_GUILD} image feeds.`);
  if (getFeed(guildId, name)) throw new Error('A feed with this name already exists.');
  const interval = Number(intervalMin) || 0;
  if (interval !== 0 && (interval < MIN_INTERVAL_MIN || interval > MAX_INTERVAL_MIN)) throw new Error(`Interval must be 0 (manual) or between ${MIN_INTERVAL_MIN} and ${MAX_INTERVAL_MIN} minutes.`);
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category) && category !== 'any') throw new Error('Unsupported image category.');
  const url = parsePublicHttpsUrl(sourceUrl).toString();
  const info = db.prepare('INSERT INTO image_feeds(guild_id,name,category,channel_id,source_url,interval_min,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(guildId, name, category, channelId, url, interval, createdBy, Date.now());
  return db.prepare('SELECT * FROM image_feeds WHERE id=?').get(info.lastInsertRowid);
}
function editFeed(guildId, name, patch = {}) {
  const current = getFeed(guildId, name);
  if (!current) return null;
  const nextName = patch.name == null ? current.name : String(patch.name).trim();
  const nextCategory = patch.category == null ? current.category : String(patch.category);
  const nextUrl = patch.sourceUrl == null ? current.source_url : parsePublicHttpsUrl(patch.sourceUrl).toString();
  const nextInterval = patch.intervalMin == null ? current.interval_min : Number(patch.intervalMin);
  const nextChannel = patch.channelId == null ? current.channel_id : String(patch.channelId);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,39}$/.test(nextName)) throw new Error('Source name must be 2–40 characters.');
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, nextCategory)) throw new Error('Unsupported image category.');
  if (!Number.isInteger(nextInterval) || nextInterval < MIN_INTERVAL_MIN || nextInterval > MAX_INTERVAL_MIN) throw new Error(`Interval must be between ${MIN_INTERVAL_MIN} and ${MAX_INTERVAL_MIN} minutes.`);
  db.prepare('UPDATE image_feeds SET name=?,category=?,source_url=?,interval_min=?,channel_id=? WHERE id=?')
    .run(nextName, nextCategory, nextUrl, nextInterval, nextChannel, current.id);
  return db.prepare('SELECT * FROM image_feeds WHERE id=?').get(current.id);
}
function feedStatus(guildId, name) {
  const feed = getFeed(guildId, name);
  if (!feed) return null;
  return {
    ...feed,
    seenCount: db.prepare('SELECT COUNT(*) AS n FROM image_feed_seen WHERE feed_id=?').get(feed.id).n,
    isRunning: running.has(feed.id)
  };
}
function removeFeed(guildId, name) { return db.prepare('DELETE FROM image_feeds WHERE guild_id=? AND name=? COLLATE NOCASE').run(guildId, name).changes > 0; }
function setEnabled(guildId, name, enabled) {
  return db.prepare('UPDATE image_feeds SET enabled=?,fail_count=0,last_error=NULL WHERE guild_id=? AND name=? COLLATE NOCASE').run(enabled ? 1 : 0, guildId, name).changes > 0;
}

async function loadSource(sourceUrl) {
  // Prefer the official API for a Pinterest Pin when a token is configured.
  // Public HTML extraction remains the fallback when no token is present.
  let apiPin = null;
  try {
    apiPin = await pinterestApi.loadPinterestSource(sourceUrl);
  } catch (error) {
    // A Pinterest token may be expired or lack pins:read. Do not let that
    // disable public-page extraction or feeds from unrelated image websites.
    console.warn(`[ImageFeeds] Pinterest API unavailable; trying public page extraction: ${String(error.message || error).slice(0, 180)}`);
  }
  if (apiPin?.candidates?.length) {
    return { direct: null, response: { url: sourceUrl, headers: { 'content-type': 'application/json' }, status: 200 }, candidates: apiPin.candidates, apiSource: apiPin.source };
  }
  const response = await safeFetch(sourceUrl, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15000 });
  if (response.status >= 400) throw new Error(`The source returned HTTP ${response.status}.`);
  const direct = sniffImage(response.body);
  if (direct) return { direct: { buffer: response.body, ...direct }, response, candidates: [] };
  const contentType = String(response.headers['content-type'] || '');
  const candidates = extractImageUrls({ contentType, text: response.body.toString('utf8'), baseUrl: response.url });
  return { direct: null, response, candidates };
}

// Used by /feed-add so a feed is only saved when its source really yields images.
async function probeSource(sourceUrl, category = 'any') {
  const loaded = await loadSource(sourceUrl);
  if (loaded.direct) return { kind: 'direct image (only one image; use a gallery for multiple images)', count: 1 };
  if (!loaded.candidates.length) throw new Error('No image links were found at that address. Use a direct image URL, a JSON API that returns image URLs, or a page that lists images.');
  const matching = categoryCandidates(loaded.response.url || sourceUrl, loaded.candidates, category, categoryMatches);
  if (isPinterestSearchPage(sourceUrl) && category !== 'any' && !pinterestQueryMatchesCategory(sourceUrl, category)) {
    throw new Error(`Pinterest search query does not match the selected category (${category}). Use a Pinterest search URL containing the category keyword, such as girls, boys, GIF, or banner.`);
  }
  // Non-Pinterest sources may use opaque CDN URLs. Keep them as a candidate pool,
  // but Pinterest searches must explicitly match the selected category above.
  const candidates = matching.length ? matching : (isPinterestSearchPage(sourceUrl) ? [] : loaded.candidates);
  return { kind: 'image list', count: candidates.length };
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}

function categoryMatches(url, category) {
  const value = String(url || '').toLowerCase();
  const has = re => re.test(value);
  if (category === 'gif' || category === 'gif-girls' || category === 'gif-boys') return /\.gif(?:$|[?#])|giphy|tenor/i.test(value) && (category === 'gif' || categoryMatches(value, category === 'gif-girls' ? 'girls' : 'boys'));
  if (category === 'girls') return has(/girls?|women|woman|female|ladies|females|\bgirl\b|بنات|نساء|بنت/);
  if (category === 'boys') return has(/boys?|men|man|male|guys|gentlemen|شباب|رجال|ولد/);
  if (category === 'girls-boys') return has(/girls?|women|woman|female|boys?|men|man|male|guys|بنات|نساء|بنت|شباب|رجال|ولد/);
  if (category === 'couples') return has(/couple|duo|pair|love|romance|relationship|girls?-and-boys|boys?-and-girls|كبلز|كابلز|ثنائي|حب|عشاق/);
  if (category === 'banner') return has(/banner|header|cover|wide|بانر|بنر/);
  if (category === 'anime') return has(/anime|manga|waifu|husbando|أنمي|انمي|مانجا/);
  return true;
}

async function fetchImages(feed, limit = 30) {
  const loaded = await loadSource(feed.source_url);
  const category = feed.category || 'any';
  const candidates = loaded.direct ? [] : loaded.candidates;
  const referer = `${new URL(loaded.response.url).origin}/`;
  const out = [];
  let scanned = 0, matched = 0;
  const localHashes = new Set();
  if (loaded.direct) {
    const contentHash = createHash('sha256').update(loaded.direct.buffer).digest('hex');
    const exists = db.prepare('SELECT 1 FROM image_feed_seen WHERE feed_id=? AND hash=?').get(feed.id, contentHash);
    if (!exists) out.push({ ...loaded.direct, origin: loaded.response.url, contentHash });
  } else {
    const matchingPool = categoryCandidates(loaded.response.url || feed.source_url, candidates, category, categoryMatches);
    if (isPinterestSearchPage(feed.source_url) && category !== 'any' && !pinterestQueryMatchesCategory(feed.source_url, category)) {
      throw new Error(`Pinterest search query does not match the selected category (${category}). Edit the source URL to use a matching Pinterest search.`);
    }
    const pool = shuffle(matchingPool.length ? matchingPool : (isPinterestSearchPage(feed.source_url) ? [] : candidates));
    let valid = 0;
    for (const candidate of pool.slice(0, Math.min(pool.length, MAX_CANDIDATES))) {
      if (out.length >= limit) break;
      scanned++;
      try {
        const image = await safeFetch(candidate, { maxBytes: MAX_IMAGE_BYTES, timeoutMs: 15000, headers: { referer, accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' } });
        if (image.status >= 400 || image.body.length < MIN_IMAGE_BYTES) continue;
        const kind = sniffImage(image.body);
        if (!kind) continue;
        if ((category === 'gif' || category === 'gif-girls' || category === 'gif-boys') && kind.ext !== 'gif') continue;
        valid++; matched++;
        const contentHash = createHash('sha256').update(image.body).digest('hex');
        if (localHashes.has(contentHash)) continue;
        localHashes.add(contentHash);
        if (db.prepare('SELECT 1 FROM image_feed_seen WHERE feed_id=? AND hash=?').get(feed.id, contentHash)) continue;
        out.push({ buffer: image.body, ...kind, origin: image.url, contentHash });
      } catch { /* blocked or broken candidates are skipped; continue with the rest */ }
    }
    if (!out.length && valid) throw new Error('All valid images from this source have already been posted. The bot skipped duplicates instead of reposting them.');
  }
  if (!out.length) throw new Error('No new downloadable images were found. The site may block automated access, require JavaScript/login, or all available images may already have been posted.');
  db.prepare('UPDATE image_feeds SET last_check_at=?,last_scan_count=?,last_match_count=? WHERE id=?')
    .run(Date.now(), scanned || (loaded.direct ? 1 : candidates.length), matched || out.length, feed.id);
  return out;
}

async function postFeed(client, feed) {
  const channel = await client.channels.fetch(feed.channel_id).catch(() => null);
  if (!channel || !channel.guild || channel.guild.id !== feed.guild_id || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('The feed channel no longer exists or is not a server text channel.');
  }
  const me = channel.guild.members.me;
  const perms = me && channel.permissionsFor(me);
  const need = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  if (!perms || !perms.has(need)) throw new Error('The bot needs View Channel, Send Messages, Attach Files and Embed Links in the feed channel.');
  const images = await fetchImages(feed, 30);
  // Send multiple images per message, respecting Discord's 10-file limit and a
  // conservative aggregate payload size. Seen hashes are committed only after send succeeds.
  const batches = [];
  let batch = [], bytes = 0;
  for (const image of images) {
    if (batch.length && (batch.length >= 10 || bytes + image.buffer.length > 20 * 1024 * 1024)) {
      batches.push(batch); batch = []; bytes = 0;
    }
    batch.push(image); bytes += image.buffer.length;
  }
  if (batch.length) batches.push(batch);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const items = batches[batchIndex];
    const files = items.map((image, index) => {
      const fileName = `feed-${feed.id}-${Date.now()}-${index}.${image.ext}`;
      image.fileName = fileName;
      return new AttachmentBuilder(image.buffer, { name: fileName, description: `${feed.name} image from ${new URL(image.origin).hostname}` });
    });
    const embed = new EmbedBuilder().setColor(0x5865F2)
      .setTitle(`${feed.name.slice(0, 220)} • ${images.length} new image${images.length === 1 ? '' : 's'}`)
      .setDescription(`Source: ${new URL(items[0].origin).hostname}${batches.length > 1 ? `\nBatch ${batchIndex + 1}/${batches.length}` : ''}`)
      .setFooter({ text: 'IM YOUR DADDY • Image catalog' }).setTimestamp();
    // Use a collage of attachment images where possible; Discord renders the attached files below.
    if (items.length === 1) embed.setImage(`attachment://${items[0].fileName}`);
    await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
    const mark = db.prepare('INSERT OR IGNORE INTO image_feed_seen(feed_id,hash,seen_at) VALUES(?,?,?)');
    const tx = db.transaction(rows => { for (const image of rows) mark.run(feed.id, image.contentHash, Date.now()); });
    tx(items);
  }
  db.prepare('DELETE FROM image_feed_seen WHERE feed_id=? AND hash NOT IN (SELECT hash FROM image_feed_seen WHERE feed_id=? ORDER BY seen_at DESC LIMIT 2000)').run(feed.id, feed.id);
  db.prepare('UPDATE image_feeds SET last_post_at=?,last_post_count=?,fail_count=0,last_error=NULL WHERE id=?').run(Date.now(), images.length, feed.id);
  return images.length;
}

async function runFeed(client, feed, { automatic = false } = {}) {
  if (running.has(feed.id)) throw new Error('This feed is already posting. Try again in a moment.');
  running.add(feed.id);
  try {
    await postFeed(client, feed);
  } catch (error) {
    const message = String(error.message || '');
    if (/No new downloadable images were found|All valid images from this source have already been posted/i.test(message)) {
      db.prepare('UPDATE image_feeds SET last_check_at=?,fail_count=0,last_error=NULL WHERE id=?').run(Date.now(), feed.id);
      throw error;
    }
    const failures = (feed.fail_count || 0) + 1;
    const disable = automatic && failures >= AUTO_DISABLE_AFTER;
    db.prepare('UPDATE image_feeds SET fail_count=?,last_error=?,enabled=CASE WHEN ? THEN 0 ELSE enabled END WHERE id=?').run(failures, String(error.message).slice(0, 300), disable ? 1 : 0, feed.id);
    if (disable) console.warn(`Image feed ${feed.id} (${feed.name}) disabled after ${failures} consecutive failures: ${error.message}`);
    throw error;
  } finally {
    running.delete(feed.id);
  }
}

async function tick(client) {
  const now = Date.now();
  const due = db.prepare('SELECT * FROM image_feeds WHERE enabled=1 AND interval_min>0 AND CASE WHEN last_check_at>0 THEN last_check_at ELSE last_post_at END + interval_min*60000 <= ?').all(now);
  for (const feed of due) {
    if (!client.guilds.cache.has(feed.guild_id)) continue;
    // Claim the slot first so a slow or failing source is not retried every minute.
    db.prepare('UPDATE image_feeds SET last_check_at=? WHERE id=?').run(now, feed.id);
    try { await runFeed(client, feed, { automatic: true }); }
    catch (error) { console.warn(`Image feed ${feed.id} (${feed.name}) failed:`, error.message); }
  }
}

let timer = null;
function start(client) {
  if (timer) return;
  timer = setInterval(() => { tick(client).catch(error => console.warn('Image feed scheduler error:', error.message)); }, 60_000);
}

module.exports = { CATEGORIES, MIN_INTERVAL_MIN, MAX_INTERVAL_MIN, categoryMatches, isPinterestPinPage, categoryCandidates, listFeeds, getFeed, feedStatus, addFeed, editFeed, removeFeed, setEnabled, probeSource, runFeed, start };
