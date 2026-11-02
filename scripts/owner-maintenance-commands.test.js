const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('owner-only bulk channel deletion remains registered and protected while music queue command is retired', () => {
  const commands = fs.readFileSync(path.join(__dirname, '../src/commands.js'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(commands, /setName\('delete-all-channels'\)/);
  assert.doesNotMatch(commands, /setName\('music-clear-queue'\)/);
  assert.match(commands, /setName\('delete-whitelist-add'\)/);
  assert.match(commands, /setName\('delete-whitelist-remove'\)/);
  assert.match(commands, /setName\('delete-whitelist-list'\)/);
  const database = fs.readFileSync(path.join(__dirname, '../src/db.js'), 'utf8');
  assert.match(database, /CREATE TABLE IF NOT EXISTS delete_whitelist/);
  assert.match(source, /if\(n==='delete-all-channels'\)[\s\S]*?u\.id!==g\.ownerId&&\(!process\.env\.BOT_OWNER_ID\|\|u\.id!==process\.env\.BOT_OWNER_ID\)/);
  assert.match(source, /DELETE ALL CHANNELS/);
  assert.match(source, /delete-whitelist-add'\|\|n==='delete-whitelist-remove'\|\|n==='delete-whitelist-list'[\s\S]*?u\.id!==process\.env\.BOT_OWNER_ID/);
  assert.match(source, /SELECT 1 FROM delete_whitelist WHERE user_id=\?/);
  assert.match(source, /delete_whitelist_add/);
  assert.match(source, /delete_whitelist_remove/);

});
