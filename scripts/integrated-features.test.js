'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('transfer fee commands and Quran integration are wired into the main runtime', () => {
  const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
  const tax = fs.readFileSync(path.join(root, 'src/transfer-tax.js'), 'utf8');
  const games = fs.readFileSync(path.join(root, 'src/games.js'), 'utf8');
  assert.match(index, /require\('\.\/transfer-tax'\)/);
  assert.match(index, /quranFeatures\.registerEvents\(client\)/);
  assert.match(index, /transferTax\.handles\(i\)/);
  assert.match(tax, /setName\('transfer-tax'\)/);
  assert.match(tax, /setName\('transfer-tax-config'\)/);
  assert.match(games, /would-you-rather/);
});
