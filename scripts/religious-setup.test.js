'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('religious setup and diagnostics commands are registered and routed', () => {
  const moduleText = fs.readFileSync(path.join(root, 'src', 'islamic-autopost.js'), 'utf8');
  const indexText = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  assert.match(moduleText, /setName\('setup-religious'\)/);
  assert.match(moduleText, /setName\('test-religious'\)/);
  assert.match(moduleText, /\['islamic','setup-religious','setup-islamic-catalog','test-religious'\]/);
  assert.match(indexText, /islamicAutopost\.commands\s*\|\|\s*\[\]/);
});
test('+setup catches setup errors and attempts to return a useful message', () => {
  const text = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
  assert.match(text, /\[\+setup\] Monitoring setup failed/);
  assert.match(text, /Setup failed:/);
});
