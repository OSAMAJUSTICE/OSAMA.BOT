const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
const commands = fs.readFileSync(path.join(root, 'src', 'commands.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));

test('presence intent and status/stream logging are wired', () => {
  assert.match(source, /GatewayIntentBits\.GuildPresences/);
  assert.match(source, /client\.on\('presenceUpdate'/);
  assert.match(source, /presence_change/);
  assert.match(source, /stream_started/);
  assert.match(source, /stream_ended/);
});
test('profile and voice event logging are wired', () => {
  assert.match(source, /client\.on\('userUpdate'/);
  assert.match(source, /profile_image_change/);
  assert.match(source, /client\.on\('voiceStateUpdate'/);
  for (const action of ['voice_join', 'voice_leave', 'voice_move']) assert.ok(source.includes(action), `missing ${action}`);
  for (const flag of ['selfMute', 'serverMute', 'selfDeaf', 'serverDeaf', 'selfVideo']) assert.ok(source.includes(`['${flag}'`), `missing voice flag ${flag}`);
  assert.match(source, /action:`voice_\$\{key\.toLowerCase\(\)\}`/);
});
test('log channel command persists per-server configuration', () => {
  assert.match(commands, /setName\('setlogchannel'\)/);
  assert.match(source, /if\(n==='setlogchannel'\)/);
  assert.equal(config.logs.enabled, false, 'logs should require deliberate per-server configuration');
});

test('/log slash command offers setup, status and disable and server events are logged', () => {
  assert.match(commands, /setName\('log'\).*addSubcommand/);
  assert.match(commands, /setName\('setup'\)/);
  assert.match(commands, /setName\('status'\)/);
  assert.match(commands, /setName\('disable'\)/);
  assert.match(source, /if\(n==='log'\)/);
  for (const event of ['guildMemberAdd', 'guildMemberRemove', 'messageDelete', 'messageUpdate', 'guildBanAdd', 'guildBanRemove', 'guildMemberUpdate', 'channelCreate', 'channelDelete', 'channelUpdate', 'roleCreate', 'roleDelete', 'roleUpdate', 'guildUpdate']) {
    assert.ok(source.includes(`client.on('${event}'`), `missing ${event} logger`);
  }
});


test('/log setup creates a localized dedicated channel catalog', () => {
  assert.match(commands, /setName\('language'\)/);
  assert.match(commands, /value:'en'/);
  assert.match(commands, /value:'ar'/);
  assert.match(source, /async function setupLogCatalog/);
  assert.match(source, /LOG_CHANNEL_GROUPS/);
  for (const group of ['members','messages','voice','camera','moderation','roles','channels','server']) {
    assert.ok(source.includes(`${group}:{en:`), `missing ${group} log group`);
  }
  assert.match(source, /const baseOverwrites=\[/);
  assert.match(source, /Build the replacement catalog before touching existing channels/);
  assert.match(source, /Retire previous managed log catalog after successful replacement/);
  assert.match(source, /oldChannelIds=new Set\(Object\.values\(savedLogs\.channels\|\|\{\}\)\.filter\(validId\)\)/);
  assert.match(source, /Create organized per-topic log categories within Discord limits/);
  assert.match(source, /📁・لوج-الشات/);
  assert.match(source, /📁・لوج-الفويسات/);
  assert.match(source, /📁・لوج-الأعضاء/);
  assert.match(source, /Create log channel under its dedicated topic category/);
  assert.match(source, /catalogVersion:5/);
  assert.match(source, /categoryLayout:'topic-categories'/);
  assert.match(source, /categoryIds:categories\.map/);
  assert.match(source, /logs:\{enabled:true,language:lang,categoryId:categories\[0\]\.id,categoryIds:categories\.map/);
});
