'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
test('guild slash sync checks the 100-command limit and uses one atomic bulk request', () => {
  assert.match(source, /if \(chatInputBody\.length > 100\)/);
  assert.match(source, /Discord allows at most 100 guild chat-input commands/);
  assert.match(source, /registeredResponse = await rest\.put\(route, \{ body: bulkBody \}\)/);
  assert.match(source, /Bulk response contains \$\{registeredSlashCommands\.length\}\/\$\{chatInputBody\.length\} slash commands/);
  assert.match(source, /missingAfterSync/);
  assert.match(source, /Independent Discord read-back verification failed/);
  assert.match(source, /INDEPENDENT READ-BACK VERIFIED/);
  assert.match(source, /Bulk-registering \$\{chatInputBody\.length\} slash commands/);
});
test('bulk sync preserves non-chat-input commands and cleans only stale slash commands', () => {
  assert.match(source, /const nonChatInputCommands = existing\.filter\(command => Number\(command\.type \|\| 1\) !== 1\)/);
  assert.match(source, /const bulkBody = \[\.\.\.chatInputBody, \.\.\.nonChatInputCommands/);
  assert.match(source, /const stale = chatInput\.filter\(command => !wantedNames\.has\(command\.name\)\)/);
  assert.match(source, /if \(successful === targetGuilds\.length && !validId\(guildId\)/);
});
test('newly joined guilds automatically sync slash commands without deleting global commands', () => {
  assert.match(source, /client\.on\('guildCreate',async guild=>\{/);
  assert.match(source, /New guild detected: \$\{guild\.name\} \(\$\{guild\.id\}\); starting automatic slash registration/);
  assert.match(source, /await syncGuildSlashCommandsOnce\(guild, language\)/);
  assert.match(source, /Automatic slash registration finished for new guild/);
  assert.match(source, /Automatic slash registration failed for new guild/);
  assert.match(source, /Serialize per-guild slash synchronization so startup registration and guildCreate/);
  assert.match(source, /const guildSlashSyncInFlight = new Map\(\)/);
});

test('startup registration syncs every existing guild even when legacy GUILD_ID is configured', () => {
  assert.match(source, /Always refresh and sync every guild the bot belongs to/);
  assert.match(source, /const fetched = await client\.guilds\.fetch\(\);\s*targetGuilds = \[\.\.\.fetched\.values\(\)\]/);
  assert.doesNotMatch(source, /if \(validId\(guildId\)\) \{\s*const cached = client\.guilds\.cache\.get\(guildId\)/);
});

test('guild sync skips bulk overwrite when existing definitions already match', () => {
  assert.match(source, /if \(created === 0 && updated === 0 && removed === 0\)/);
  assert.match(source, /already has all \$\{chatInputBody\.length\} desired slash commands, including \/\$\{imageSourceCommandName\}; no overwrite needed/);
});

test('guild command REST timeout is long enough for a full atomic registration', () => {
  assert.match(source, /rest\.setTimeoutTime\(60000\)/);
});

test('every guild sync requires both original image commands and their compatibility aliases', () => {
  assert.match(source, /const imageSourceCommandName = 'image-source'/);
  assert.match(source, /const requiredImageCommandNames = language === 'ar'/);
  assert.match(source, /missingRequiredImageDefinitions/);
  assert.match(source, /requiredImageCommandNames\.some\(name => !registeredNames\.has\(name\)\)/);
  assert.match(source, /missingRequiredImageCommands/);
  assert.match(source, /image commands verified:/);
});
