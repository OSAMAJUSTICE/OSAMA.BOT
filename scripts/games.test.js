'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src','games.js'),'utf8');
const index=fs.readFileSync(path.join(root,'src','index.js'),'utf8');
test('game arcade command and persistent virtual economy are registered',()=>{
 assert.match(source,/setName\('games'\)/);
 for(const action of ['daily','profile','leaderboard','streak','roulette','chairs','mafia','xo','quiz'])assert.ok(source.includes(`['${action}'`),`missing action ${action}`);
 assert.match(source,/CREATE TABLE IF NOT EXISTS game_wallets/);
 assert.match(source,/CREATE TABLE IF NOT EXISTS game_stats/);
 assert.match(source,/coins=MAX\(0,coins\+\?/);
 assert.match(index,/games\.commands/);
 assert.match(index,/games\.handle\(i\)/);
});
test('interactive games validate players, keep XO boards within Discord component row limits, and cap roulette bets',()=>{
 assert.match(source,/setMaxValue\(500\)/);
 assert.match(source,/Not your turn/);
 assert.match(source,/at least 4 players/);
 assert.match(source,/function xoRows/);
 assert.match(source,/\.map\(r=>new ActionRowBuilder\(\)\.addComponents/);
});
