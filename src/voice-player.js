'use strict';
// Voice playback for the bot account itself (audio only).
// Discord's bot API does NOT allow bots to start Go Live / screen share, so video links are played as audio.
const { spawn } = require('node:child_process');
const { resolveFinalUrl } = require('./net-safe');

const sessions = new Map(); // guildId -> session
const staySettings = new Map(); // guildId -> { enabled, selfMute, selfDeaf }
let voiceLib = null;

function lib() {
  if (!voiceLib) voiceLib = require('@discordjs/voice');
  return voiceLib;
}

// Returns null when everything needed for voice is installed, otherwise a human-readable problem.
function dependencyProblem() {
  const missing = [];
  for (const name of ['@discordjs/voice', '@snazzah/davey']) {
    try { require.resolve(name); } catch { missing.push(name); }
  }
  let opus = false;
  for (const name of ['@discordjs/opus', 'opusscript']) {
    try { require.resolve(name); opus = true; break; } catch { /* try next */ }
  }
  if (!opus) missing.push('opusscript');
  if (!missing.length) return null;
  return `Voice dependencies are missing (${missing.join(', ')}). Run \`npm install\` on the host and restart the bot. Discord has required DAVE end-to-end encryption for voice since March 2026, so @snazzah/davey is mandatory.`;
}

function ffmpegBinary() {
  try { const bundled = require('ffmpeg-static'); if (bundled) return bundled; } catch { /* use system ffmpeg */ }
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function killProcess(session) {
  if (session.proc) {
    try { session.proc.kill('SIGKILL'); } catch { /* already gone */ }
    session.proc = null;
  }
  session.nowPlaying = null;
}

function cleanup(session) {
  if (sessions.get(session.guildId) !== session) return;
  sessions.delete(session.guildId);
  killProcess(session);
  try { session.player.stop(true); } catch { /* ignore */ }
  try { session.connection.destroy(); } catch { /* already destroyed */ }
}

async function join(voiceChannel, options = {}) {
  const v = lib();
  const guild = voiceChannel.guild;
  const existing = sessions.get(guild.id);
  if (existing && existing.channelId === voiceChannel.id && existing.connection.state.status !== v.VoiceConnectionStatus.Destroyed) return existing;
  if (existing) cleanup(existing);

  const connection = v.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: options.selfDeaf ?? staySettings.get(guild.id)?.selfDeaf ?? true,
    selfMute: options.selfMute ?? staySettings.get(guild.id)?.selfMute ?? false
  });
  try {
    await v.entersState(connection, v.VoiceConnectionStatus.Ready, 20_000);
  } catch {
    try { connection.destroy(); } catch { /* ignore */ }
    throw new Error('Could not connect to the voice channel in time. Check that the bot has View Channel, Connect and Speak there.');
  }

  const player = v.createAudioPlayer({ behaviors: { noSubscriber: v.NoSubscriberBehavior.Pause } });
  connection.subscribe(player);
  const saved = staySettings.get(guild.id);
  const session = { guildId: guild.id, channelId: voiceChannel.id, channel: voiceChannel, connection, player, proc: null, nowPlaying: null, lastError: '', stay: options.stay ?? Boolean(saved?.enabled), selfMute: options.selfMute ?? saved?.selfMute ?? false, selfDeaf: options.selfDeaf ?? saved?.selfDeaf ?? true, reconnecting: false };
  if (options.stay) staySettings.set(guild.id, { enabled: true, selfMute: session.selfMute, selfDeaf: session.selfDeaf });
  sessions.set(guild.id, session);

  connection.on(v.VoiceConnectionStatus.Disconnected, async () => {
    try {
      // Discord moved us to another channel or briefly dropped the socket: wait for a reconnect.
      await Promise.race([
        v.entersState(connection, v.VoiceConnectionStatus.Signalling, 5_000),
        v.entersState(connection, v.VoiceConnectionStatus.Connecting, 5_000)
      ]);
    } catch {
      if (session.stay && !session.reconnecting) {
        session.reconnecting = true;
        const retryChannel = session.channel;
        const retryOptions = { stay: true, selfMute: session.selfMute, selfDeaf: session.selfDeaf };
        cleanup(session);
        setTimeout(() => join(retryChannel, retryOptions).catch(error => {
          console.warn('[VoiceStay] Reconnect attempt failed:', error.message);
          const current = staySettings.get(session.guildId);
          if (current?.enabled) setTimeout(() => join(retryChannel, retryOptions).catch(e => console.warn('[VoiceStay] Retry failed:', e.message)), 15_000).unref?.();
        }), 5_000).unref?.();
      } else cleanup(session);
    }
  });
  connection.on(v.VoiceConnectionStatus.Destroyed, () => cleanup(session));
  player.on(v.AudioPlayerStatus.Idle, () => killProcess(session));
  player.on('error', error => { console.warn('Voice player error:', error?.message || error); killProcess(session); });
  return session;
}

async function play(guildId, rawUrl) {
  const v = lib();
  const session = sessions.get(guildId);
  if (!session) throw new Error('The bot is not connected to a voice channel in this server.');
  const final = await resolveFinalUrl(rawUrl); // validates every redirect hop against private/internal addresses
  if (final.status >= 400) throw new Error(`The link returned HTTP ${final.status}.`);
  if (final.contentType.startsWith('text/html')) throw new Error('That link is a web page, not a direct audio/video file or stream. Use a direct media URL (for example .mp3, .mp4, .m3u8).');

  killProcess(session);
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-protocol_whitelist', 'https,tls,tcp,crypto',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-user_agent', 'Mozilla/5.0 (compatible; ImYourDaddyBot/3.11)',
    '-i', final.url,
    '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'
  ];
  const proc = spawn(ffmpegBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { proc.once('spawn', resolve); proc.once('error', reject); });
  } catch (error) {
    throw new Error(error.code === 'ENOENT' ? 'ffmpeg was not found. Run `npm install` (ffmpeg-static) or install ffmpeg on the host.' : `ffmpeg failed to start: ${error.message}`);
  }
  proc.on('error', () => { /* handled through the player state */ });
  proc.stdout.on('error', () => { /* pipe closed on stop */ });
  session.lastError = '';
  proc.stderr.on('data', chunk => { session.lastError = String(chunk).trim().slice(0, 300); });
  proc.on('close', () => { if (session.proc === proc) session.proc = null; });

  session.proc = proc;
  session.nowPlaying = new URL(final.url).hostname;
  const resource = v.createAudioResource(proc.stdout, { inputType: v.StreamType.Raw });
  session.player.play(resource);
  try {
    await v.entersState(session.player, v.AudioPlayerStatus.Playing, 15_000);
  } catch {
    const reason = session.lastError;
    killProcess(session);
    try { session.player.stop(true); } catch { /* ignore */ }
    throw new Error(`Could not start playback${reason ? `: ${reason}` : '. The link may not be a playable media stream.'}`);
  }
  return { host: session.nowPlaying };
}

function stop(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  killProcess(session);
  try { session.player.stop(true); } catch { /* ignore */ }
  return true;
}

function leave(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  cleanup(session);
  return true;
}

function status(guildId) {
  const session = sessions.get(guildId);
  return session ? { channelId: session.channelId, nowPlaying: session.nowPlaying, selfMute: session.selfMute, selfDeaf: session.selfDeaf, stay: session.stay } : null;
}

function getSession(guildId) { return sessions.get(guildId) || null; }
function setStay(guildId, enabled) {
  const session = sessions.get(guildId);
  if (!enabled) staySettings.delete(guildId);
  else staySettings.set(guildId, { enabled: true, selfMute: session?.selfMute ?? false, selfDeaf: session?.selfDeaf ?? true });
  if (session) session.stay = Boolean(enabled);
}
async function setSelfState(guildId, flags) {
  const session = sessions.get(guildId);
  if (!session) throw new Error('The bot is not connected to a voice channel.');
  const next = { selfMute: flags.selfMute ?? session.selfMute, selfDeaf: flags.selfDeaf ?? session.selfDeaf };
  const ok = session.connection.rejoin({ channelId: session.channelId, selfMute: next.selfMute, selfDeaf: next.selfDeaf });
  if (!ok) throw new Error('Discord voice connection could not be reconfigured; try rejoining the channel.');
  try { await lib().entersState(session.connection, lib().VoiceConnectionStatus.Ready, 10_000); }
  catch { throw new Error('Timed out while applying the voice setting.'); }
  session.selfMute = next.selfMute; session.selfDeaf = next.selfDeaf;
  if (session.stay) staySettings.set(guildId, { enabled: true, ...next });
  return next;
}

module.exports = { dependencyProblem, join, play, stop, leave, status, getSession, setStay, setSelfState };
