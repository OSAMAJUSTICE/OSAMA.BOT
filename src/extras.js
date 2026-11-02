'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('./db');
const feeds = require('./image-feeds');
const voice = require('./voice-player');
const { assertPublicHttpsUrl } = require('./net-safe');

db.exec('CREATE TABLE IF NOT EXISTS extras_guild_settings(guild_id TEXT PRIMARY KEY, media_channel_id TEXT)');
db.exec('CREATE TABLE IF NOT EXISTS extras_voice_stay(guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, self_mute INTEGER NOT NULL DEFAULT 0, self_deaf INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const FEED_NAME = /^[\p{L}\p{N} _-]{1,40}$/u;

const commands = [
  new SlashCommandBuilder().setName('say').setDescription('Make the bot send a message in a chosen channel (staff only)')
    .addChannelOption(o => o.setName('channel').setDescription('Where to send the message').addChannelTypes(...TEXT_TYPES).setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message text').setMaxLength(2000).setRequired(true)),
  new SlashCommandBuilder().setName('feed-add').setDescription('Create an automatic image feed posting into a chosen channel (staff only)')
    .addStringOption(o => o.setName('name').setDescription('Feed name, e.g. Banners').setMaxLength(40).setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel that receives the images').addChannelTypes(...TEXT_TYPES).setRequired(true))
    .addStringOption(o => o.setName('source_url').setDescription('HTTPS link: direct image, JSON image API, or a page listing images').setMaxLength(1000).setRequired(true))
    .addIntegerOption(o => o.setName('interval_minutes').setDescription('Auto-post every N minutes (5-10080). Leave empty for manual posting').setMinValue(feeds.MIN_INTERVAL_MIN).setMaxValue(feeds.MAX_INTERVAL_MIN)),
  new SlashCommandBuilder().setName('feed-list').setDescription('List this server\'s image feeds'),
  new SlashCommandBuilder().setName('feed-post').setDescription('Post one image from a feed right now (staff only)')
    .addStringOption(o => o.setName('name').setDescription('Feed name').setMaxLength(40).setRequired(true)),
  new SlashCommandBuilder().setName('feed-toggle').setDescription('Enable or pause an image feed (staff only)')
    .addStringOption(o => o.setName('name').setDescription('Feed name').setMaxLength(40).setRequired(true))
    .addBooleanOption(o => o.setName('enabled').setDescription('True to enable, false to pause').setRequired(true)),
  new SlashCommandBuilder().setName('feed-remove').setDescription('Delete an image feed (staff only)')
    .addStringOption(o => o.setName('name').setDescription('Feed name').setMaxLength(40).setRequired(true)),
  new SlashCommandBuilder().setName('voice-join').setDescription('Make the bot join a voice channel (staff / DJ role)')
    .addChannelOption(o => o.setName('channel').setDescription('Voice channel (defaults to yours)').addChannelTypes(ChannelType.GuildVoice)),
  new SlashCommandBuilder().setName('voice-play').setDescription('Play audio from a direct media link or uploaded file in voice (staff / DJ role)')
    .addStringOption(o => o.setName('url').setDescription('Direct HTTPS link to an audio/video file or stream (.mp3, .mp4, .m3u8)').setMaxLength(1000))
    .addAttachmentOption(o => o.setName('file').setDescription('Audio or video file to play')),
  new SlashCommandBuilder().setName('voice-stop').setDescription('Stop the current voice playback (staff / DJ role)'),
  new SlashCommandBuilder().setName('voice-leave').setDescription('Make the bot leave its voice channel (staff / DJ role)'),
  new SlashCommandBuilder().setName('voice-stay').setDescription('Keep the bot connected to the current voice channel').addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable persistent voice connection').setRequired(true)),
  new SlashCommandBuilder().setName('voice-self-mute').setDescription('Mute or unmute the bot voice transmission').addBooleanOption(o => o.setName('enabled').setDescription('True to self-mute, false to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('voice-self-deafen').setDescription('Deafen or undeafen the bot voice connection').addBooleanOption(o => o.setName('enabled').setDescription('True to self-deafen, false to undeafen').setRequired(true)),
  new SlashCommandBuilder().setName('media-channel').setDescription('Set a channel where posting a direct media link makes the bot join your call (staff only)')
    .addChannelOption(o => o.setName('channel').setDescription('Text channel to watch; leave empty to turn this off').addChannelTypes(...TEXT_TYPES))
];
const names = new Set(commands.map(c => c.name));

const isStaff = (member, ctx) => Boolean(member && (ctx.admin(member) || member.permissions.has(PermissionFlagsBits.ManageGuild)));
function canControlVoice(member, ctx) {
  if (isStaff(member, ctx)) return true;
  return false;
}

function mediaChannelId(guildId) { return db.prepare('SELECT media_channel_id FROM extras_guild_settings WHERE guild_id=?').get(guildId)?.media_channel_id || null; }
function setMediaChannel(guildId, channelId) {
  db.prepare('INSERT INTO extras_guild_settings(guild_id,media_channel_id) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET media_channel_id=excluded.media_channel_id').run(guildId, channelId);
}
function saveVoiceStay(guildId, channelId, enabled, selfMute = false, selfDeaf = false) {
  if (!enabled || !channelId) { db.prepare('DELETE FROM extras_voice_stay WHERE guild_id=?').run(guildId); return; }
  db.prepare('INSERT INTO extras_voice_stay(guild_id,channel_id,enabled,self_mute,self_deaf,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,enabled=1,self_mute=excluded.self_mute,self_deaf=excluded.self_deaf,updated_at=excluded.updated_at').run(guildId, channelId, Number(selfMute), Number(selfDeaf), Date.now());
}
function getVoiceStay(guildId) { return db.prepare('SELECT * FROM extras_voice_stay WHERE guild_id=? AND enabled=1').get(guildId) || null; }

function botCanUse(channel, flags) {
  const me = channel.guild?.members?.me;
  const perms = me && channel.permissionsFor(me);
  return Boolean(perms && perms.has(flags));
}
const feedPerms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
const voicePerms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];

async function ensureVoice(interaction, ctx, targetChannel) {
  const problem = voice.dependencyProblem();
  if (problem) throw new Error(problem);
  const channel = targetChannel || interaction.member?.voice?.channel;
  if (!channel) throw new Error('Join a voice channel first, or choose one in the command.');
  if (!botCanUse(channel, voicePerms)) throw new Error(`The bot needs View Channel, Connect and Speak in <#${channel.id}>.`);
  return voice.join(channel);
}

const denied = i => i.reply({ content: 'You need Administrator or Manage Server permission for this command.', ...EPHEMERAL });

async function handle(i, ctx) {
  if (!i.guild) return i.reply({ content: 'Use this command inside a server.', ...EPHEMERAL });
  const n = i.commandName;
  const staffOnly = ['say', 'feed-add', 'feed-post', 'feed-toggle', 'feed-remove', 'media-channel'];
  if (staffOnly.includes(n) && !isStaff(i.member, ctx)) return denied(i);
  if (n.startsWith('voice-') && !canControlVoice(i.member, ctx)) return i.reply({ content: 'You need Administrator, Manage Server, or the configured DJ role for voice commands.', ...EPHEMERAL });

  if (n === 'say') {
    const channel = i.options.getChannel('channel', true);
    if (!botCanUse(channel, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return i.reply({ content: `The bot cannot send messages in <#${channel.id}>.`, ...EPHEMERAL });
    await channel.send({ content: i.options.getString('message', true), allowedMentions: { parse: [] } });
    ctx.audit(i.guild.id, i.user.id, 'say', channel.id, '');
    return i.reply({ content: `Message sent to <#${channel.id}>.`, ...EPHEMERAL });
  }

  if (n === 'feed-add') {
    const name = i.options.getString('name', true).trim();
    const channel = i.options.getChannel('channel', true);
    const source = i.options.getString('source_url', true).trim();
    const interval = i.options.getInteger('interval_minutes') || 0;
    if (!FEED_NAME.test(name)) return i.reply({ content: 'Feed names may contain letters, numbers, spaces, - and _ (max 40).', ...EPHEMERAL });
    if (!botCanUse(channel, feedPerms)) return i.reply({ content: `The bot needs View Channel, Send Messages, Attach Files and Embed Links in <#${channel.id}>.`, ...EPHEMERAL });
    await i.deferReply(EPHEMERAL);
    try {
      const probe = await feeds.probeSource(source);
      const feed = feeds.addFeed({ guildId: i.guild.id, name, channelId: channel.id, sourceUrl: source, intervalMin: interval, createdBy: i.user.id });
      ctx.audit(i.guild.id, i.user.id, 'feed_add', channel.id, name);
      return i.editReply(`Feed **${feed.name}** created → <#${channel.id}>. Source check: ${probe.kind}, ${probe.count} image(s) found. ${interval ? `It will post every ${interval} minutes.` : 'Auto-posting is off; use `/feed-post`.'}\nOnly use sources whose content you are allowed to post. The bot cannot judge image content for you.`);
    } catch (error) {
      return i.editReply(`Could not create the feed: ${error.message}`);
    }
  }

  if (n === 'feed-list') {
    const rows = feeds.listFeeds(i.guild.id);
    if (!rows.length) return i.reply('No image feeds yet. Staff can create one with `/feed-add`.');
    const lines = rows.map(f => {
      let host = 'unknown';
      try { host = new URL(f.source_url).hostname; } catch { /* keep default */ }
      const state = f.enabled ? '🟢' : '⏸️';
      const when = f.interval_min ? `every ${f.interval_min} min` : 'manual';
      return `${state} **${f.name}** → <#${f.channel_id}> • ${when} • ${host}${f.last_error ? `\n   ⚠️ ${f.last_error}` : ''}`;
    });
    return i.reply({ embeds: [new EmbedBuilder().setColor(0x3446A8).setTitle('Image feeds').setDescription(lines.join('\n').slice(0, 4000))], allowedMentions: { parse: [] } });
  }

  if (['feed-post', 'feed-toggle', 'feed-remove'].includes(n)) {
    const name = i.options.getString('name', true).trim();
    const feed = feeds.getFeed(i.guild.id, name);
    if (!feed) return i.reply({ content: 'No feed with that name. See `/feed-list`.', ...EPHEMERAL });
    if (n === 'feed-remove') { feeds.removeFeed(i.guild.id, name); ctx.audit(i.guild.id, i.user.id, 'feed_remove', feed.channel_id, feed.name); return i.reply({ content: `Feed **${feed.name}** deleted.`, ...EPHEMERAL }); }
    if (n === 'feed-toggle') { const on = i.options.getBoolean('enabled', true); feeds.setEnabled(i.guild.id, name, on); return i.reply({ content: `Feed **${feed.name}** is now ${on ? 'enabled' : 'paused'}.`, ...EPHEMERAL }); }
    await i.deferReply(EPHEMERAL);
    try { await feeds.runFeed(i.client, feed); return i.editReply(`Posted an image from **${feed.name}** in <#${feed.channel_id}>.`); }
    catch (error) { return i.editReply(`Could not post: ${error.message}`); }
  }

  if (n === 'voice-join') {
    await i.deferReply(EPHEMERAL);
    try {
      const session = await ensureVoice(i, ctx, i.options.getChannel('channel'));
      return i.editReply(`Joined <#${session.channelId}>.`);
    } catch (error) { return i.editReply(error.message); }
  }

  if (n === 'voice-play') {
    const attachment = i.options.getAttachment('file');
    const url = attachment?.url || i.options.getString('url');
    if (!url) return i.reply({ content: 'Provide a `url` or attach a `file`.', ...EPHEMERAL });
    await i.deferReply(EPHEMERAL);
    try {
      await ensureVoice(i, ctx, voice.status(i.guild.id) ? i.guild.channels.cache.get(voice.status(i.guild.id).channelId) : null);
      const result = await voice.play(i.guild.id, url);
      return i.editReply(`▶️ Playing audio from **${result.host}**. Note: Discord bots cannot screen-share, so video links play as audio only.`);
    } catch (error) { return i.editReply(error.message); }
  }

  if (n === 'voice-stop') return i.reply({ content: voice.stop(i.guild.id) ? '⏹️ Stopped.' : 'Nothing is playing.', ...EPHEMERAL });
  if (n === 'voice-stay') {
    const enabled = i.options.getBoolean('enabled', true);
    if (enabled) {
      const state = voice.status(i.guild.id);
      if (!state) return i.reply({ content: 'Run `/voice-join` first. The bot must already be connected before persistent mode can be enabled.', ...EPHEMERAL });
      const session = voice.getSession?.(i.guild.id);
      saveVoiceStay(i.guild.id, state.channelId, true, session?.selfMute, session?.selfDeaf);
      voice.setStay?.(i.guild.id, true);
      ctx.audit(i.guild.id, i.user.id, 'voice_stay_enabled', state.channelId);
      return i.reply({ content: `📌 Persistent voice connection enabled for <#${state.channelId}>. This setting is saved across restarts; reconnection depends on channel permissions and Discord availability.`, ...EPHEMERAL });
    }
    saveVoiceStay(i.guild.id, null, false); voice.setStay?.(i.guild.id, false);
    ctx.audit(i.guild.id, i.user.id, 'voice_stay_disabled');
    return i.reply({ content: 'Persistent voice connection disabled.', ...EPHEMERAL });
  }
  if (n === 'voice-self-mute' || n === 'voice-self-deafen') {
    const enabled = i.options.getBoolean('enabled', true);
    const state = voice.status(i.guild.id);
    if (!state) return i.reply({ content: 'Run `/voice-join` first.', ...EPHEMERAL });
    try {
      const flags = n === 'voice-self-mute' ? { selfMute: enabled } : { selfDeaf: enabled };
      const updated = await voice.setSelfState(i.guild.id, flags);
      const stay = getVoiceStay(i.guild.id);
      if (stay) saveVoiceStay(i.guild.id, stay.channel_id, true, updated.selfMute, updated.selfDeaf);
      ctx.audit(i.guild.id, i.user.id, n, state.channelId, String(enabled));
      return i.reply({ content: `${n === 'voice-self-mute' ? 'Bot self-mute' : 'Bot self-deafen'} ${enabled ? 'enabled' : 'disabled'}.`, ...EPHEMERAL });
    } catch (error) { return i.reply({ content: `Could not update the bot voice state: ${error.message}`, ...EPHEMERAL }); }
  }
  if (n === 'voice-leave') { saveVoiceStay(i.guild.id, null, false); voice.setStay?.(i.guild.id, false); return i.reply({ content: voice.leave(i.guild.id) ? '👋 Left the voice channel and disabled persistent mode.' : 'The bot is not in a voice channel.', ...EPHEMERAL }); }

  if (n === 'media-channel') {
    const channel = i.options.getChannel('channel');
    if (!channel) { setMediaChannel(i.guild.id, null); return i.reply({ content: 'Media-link auto-play is off.', ...EPHEMERAL }); }
    setMediaChannel(i.guild.id, channel.id);
    ctx.audit(i.guild.id, i.user.id, 'media_channel_set', channel.id, '');
    return i.reply({ content: `When staff or DJ-role members post a direct HTTPS media link in <#${channel.id}> while in a voice channel, the bot joins their call and plays its audio.`, ...EPHEMERAL });
  }
}

async function onMessage(message, ctx) {
  if (!message.guild || message.author.bot || !message.content) return;
  const watched = mediaChannelId(message.guild.id);
  if (!watched || watched !== message.channelId) return;
  const match = message.content.match(/https:\/\/[^\s<>]+/i);
  if (!match) return;
  const member = message.member;
  if (!member || !canControlVoice(member, ctx)) return;
  const reply = text => message.reply({ content: text, allowedMentions: { repliedUser: false } }).catch(() => {});
  const channel = member.voice?.channel;
  if (!channel) return void reply('Join a voice channel first, then send the link again.');
  const url = match[0].replace(/[),.;!?]+$/, '');
  try {
    await assertPublicHttpsUrl(url);
    const fake = { client: message.client, guild: message.guild, member };
    await ensureVoice(fake, ctx, channel);
    const result = await voice.play(message.guild.id, url);
    reply(`▶️ Joined <#${channel.id}> and playing audio from **${result.host}**. Discord bots cannot screen-share, so this is audio only.`);
  } catch (error) {
    reply(`Could not play that link: ${error.message}`);
  }
}

async function restoreVoiceStay(client) {
  const rows = db.prepare('SELECT guild_id,channel_id,self_mute,self_deaf FROM extras_voice_stay WHERE enabled=1').all();
  for (const row of rows) {
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;
      const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildVoice || !botCanUse(channel, voicePerms)) {
        console.warn(`[VoiceStay] Skipping restore for guild ${row.guild_id}: channel unavailable or permissions missing.`);
        continue;
      }
      await voice.join(channel, { selfMute: Boolean(row.self_mute), selfDeaf: Boolean(row.self_deaf), stay: true });
      console.log(`[VoiceStay] Restored persistent voice connection in guild ${row.guild_id}.`);
    } catch (error) { console.warn(`[VoiceStay] Could not restore guild ${row.guild_id}:`, error.message); }
  }
}
function start(client, ctx) {
  feeds.start(client);
  if (client.isReady()) restoreVoiceStay(client).catch(error => console.warn('[VoiceStay] Restore failed:', error.message));
  else client.once('clientReady', () => restoreVoiceStay(client).catch(error => console.warn('[VoiceStay] Restore failed:', error.message)));
  client.on('messageCreate', message => { onMessage(message, ctx).catch(error => console.warn('Media channel handler failed:', error.message)); });
}

module.exports = { commands, handles: name => names.has(name), handle, start, canControlVoice };
