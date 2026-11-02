'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ARABIC_COMMAND_NAMES, canonicalCommandName, commandNameForLanguage, localizeCommandNames } = require('../src/command-locales');

test('all root slash commands have an Arabic name', () => {
  const root = path.join(__dirname, '..', 'src');
  const names = new Set();
  for (const file of ['commands.js', 'extras.js', 'games.js', 'community-tools.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/new SlashCommandBuilder\(\)\.setName\('([^']+)'\)/g)) names.add(match[1]);
  }
  assert.equal(names.size, 89);
  assert.deepEqual([...names].filter(name => !ARABIC_COMMAND_NAMES[name] && !['image-source','image-collect'].includes(name)), []);
});

test('Arabic command names are unique, valid length, and map back to original handlers', () => {
  const values = Object.values(ARABIC_COMMAND_NAMES);
  assert.equal(new Set(values).size, values.length);
  for (const [english, arabic] of Object.entries(ARABIC_COMMAND_NAMES)) {
    assert.ok(arabic.length >= 1 && arabic.length <= 32, `${english} => ${arabic}`);
    const expectedHandler = english === 'image-sources' ? 'image-source' : english === 'collect-images' ? 'image-collect' : english;
    assert.equal(canonicalCommandName(arabic), expectedHandler);
    assert.equal(commandNameForLanguage(english, 'ar'), ['image-source','image-collect'].includes(english) ? english : arabic);
  }
});

test('English commands remain unchanged and only root names are translated', () => {
  assert.equal(commandNameForLanguage('kick', 'en'), 'kick');
  assert.equal(commandNameForLanguage('image-source', 'ar'), 'image-source');
  assert.equal(commandNameForLanguage('image-collect', 'ar'), 'image-collect');
  assert.equal(canonicalCommandName('kick'), 'kick');
  const payload = { name: 'kick', description: 'Kick member', options: [{ name: 'member', description: 'Target' }] };
  const translated = localizeCommandNames(payload, 'ar');
  assert.equal(translated.name, 'طرد');
  assert.equal(translated.options[0].name, 'member');
});
