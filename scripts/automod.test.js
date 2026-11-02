const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'automod.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('native AutoMod command exposes batch setup, progress and existing rule commands', () => {
  for (const name of ['automod', 'setup-batch', 'progress', 'flagged-words', 'keyword', 'mention-spam', 'spam-messages', 'list-bot-rules', 'remove-rule', 'remove-bot-rules']) {
    assert.match(source, new RegExp(`setName\\('${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}'\\)`));
  }
});

test('AutoMod is registered for slash-command synchronization and routed to its handler', () => {
  assert.match(index, /automod\.commands/);
  assert.match(index, /automod\.handle\(i\)/);
  assert.match(pkg.scripts.test, /node --test scripts\/\*\.test\.js/);
});

test('AutoMod requires Manage Server or Administrator for the user and Manage Server for the bot', () => {
  assert.match(source, /PermissionFlagsBits\.ManageGuild/);
  assert.match(source, /PermissionFlagsBits\.Administrator/);
  assert.match(source, /members\.fetchMe\(\)/);
});

test('batch contains six keyword rules and one of each other native trigger type', () => {
  assert.match(source, /const TARGET_RULES = 100/);
  assert.match(source, /const MAX_RULES_PER_GUILD_TARGET = 10/);
  assert.match(source, /triggerType: 1/);
  assert.match(source, /triggerType: 4/);
  assert.match(source, /triggerType: 5/);
  assert.match(source, /triggerType: 3/);
  assert.match(source, /triggerType: 6/);
  assert.match(source, /actions: \[\{ type: 1 \}\]/);
  assert.match(source, /enabled: true/);
  assert.match(source, /autoModerationRules\.create\(createPayload\(template, interaction\)\)/);
});

test('progress counts rules created by this bot, and setup does not delete existing rules', () => {
  assert.match(source, /rule\.creatorId === interaction\.client\.user\.id/);
  assert.match(source, /No existing rules were deleted/);
  assert.ok(source.indexOf('await interaction.deferReply({ flags: 64 })') < source.indexOf('await fetchGuildRules(interaction.guild)'));
  assert.match(source, /await interaction\.editReply\('❌ The keyword cannot be empty or whitespace\.'/);
});


test('AutoMod removal commands only target rules created by this bot and require explicit bulk confirmation', () => {
  assert.match(source, /rule\.creatorId === interaction\.client\.user\.id/);
  assert.match(source, /confirmation !== 'DELETE'/);
  assert.match(source, /rule\.delete\(/);
  assert.match(source, /Rules created by other admins or bots were not targeted/);
});
