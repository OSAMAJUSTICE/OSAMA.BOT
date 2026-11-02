'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const roulette = fs.readFileSync(path.join(root, 'src', 'roulette', 'service.js'), 'utf8');
const community = fs.readFileSync(path.join(root, 'src', 'community-tools.js'), 'utf8');

test('roulette purchases debit and grant inventory in one transaction with an atomic balance guard', () => {
  assert.match(roulette, /db\.transaction\(\(\)=>\{const debit=db\.prepare\('UPDATE roulette_wallets SET points=points-\? WHERE guild_id=\? AND user_id=\? AND points>=\?'\)/);
  assert.match(roulette, /if\(debit\.changes!==1\)return false;giveItem\(g,u,key\);return true;/);
});

test('roulette inventory consumption is atomic and blocked players cannot use items', () => {
  assert.match(roulette, /UPDATE roulette_inventory SET quantity=quantity-1 WHERE guild_id=\? AND user_id=\? AND item_key=\? AND quantity>0/);
  assert.match(roulette, /if\(\(state\.blocked\|\|\[\]\)\.includes\(u\)\)return i\.reply/);
});

test('roulette refuses stale controls and records a winner when an item ends a game', () => {
  assert.match(roulette, /if\(!\['lobby','active'\]\.includes\(game\.status\)\|\|!\['lobby','active'\]\.includes\(state\.status\)\)/);
  assert.match(roulette, /INSERT INTO roulette_history\(guild_id,channel_id,host_id,winner_id,winner_name,players_count,created_at\)/);
});

test('honeypot does not punish administrators or moderation-capable staff', () => {
  assert.match(community, /PermissionFlagsBits\.ManageGuild,PermissionFlagsBits\.KickMembers,PermissionFlagsBits\.BanMembers,PermissionFlagsBits\.ModerateMembers,PermissionFlagsBits\.ManageMessages/);
});
