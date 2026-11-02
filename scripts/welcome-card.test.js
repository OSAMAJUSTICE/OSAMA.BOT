const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
test('bilingual welcome card and embed are wired', () => {
  assert.match(source, /function welcomeCardSvg\(/);
  assert.match(source, /WELCOME • أهلاً وسهلاً/);
  assert.match(source, /Invited by \/ دعا بواسطة/);
  assert.match(source, /attachment:\/\/welcome-card\.svg/);
  assert.match(source, /Welcome \$\{m\} to/);
  assert.match(source, /resolveJoiningInvite\(m\.guild\)/);
  assert.match(source, /allowedMentions:\{users:\[m\.id\],roles:\[\],everyone:false\}/);
});
test('invite tracking gracefully handles unavailable invite permissions', () => {
  assert.match(source, /Welcome invite attribution unavailable/);
  assert.match(source, /Unknown \/ غير معروف/);
});
