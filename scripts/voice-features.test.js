'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const extras = fs.readFileSync(path.join(root, 'src', 'extras.js'), 'utf8');
const player = fs.readFileSync(path.join(root, 'src', 'voice-player.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');

test('voice commands support join, persistent stay, bot self-mute and self-deafen', () => {
  for (const name of ['voice-join', 'voice-stay', 'voice-self-mute', 'voice-self-deafen', 'voice-play', 'voice-stop', 'voice-leave']) {
    assert.ok(extras.includes(`setName('${name}')`), `missing command ${name}`);
  }
  assert.match(extras, /CREATE TABLE IF NOT EXISTS extras_voice_stay/);
  assert.match(extras, /SELECT guild_id,channel_id,self_mute,self_deaf FROM extras_voice_stay WHERE enabled=1/);
  assert.match(player, /function setSelfState/);
  assert.match(player, /function setStay/);
  assert.match(player, /session\.stay && !session\.reconnecting/);
});

test('member voice moderation remains available with permission checks and voice help category', () => {
  assert.match(index, /\['voice-disconnect','voice-mute','voice-deafen'\]/);
  assert.match(index, /PermissionFlagsBits\.MuteMembers/);
  assert.match(index, /PermissionFlagsBits\.DeafenMembers/);
  assert.match(index, /value:'voice',label:'الصوت والموسيقى وأدوات الأعضاء'/);
  assert.match(index, /helpCategoryFor\(c\.name\)===selected/);
});

test('voice media feature explicitly documents that video links are audio-only', () => {
  assert.match(extras, /Discord bots cannot screen-share, so video links play as audio only/);
});
