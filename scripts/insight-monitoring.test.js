const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
test('Insight Monitoring prefix commands are implemented and test does not fake event simulation', () => {
  for (const cmd of ['help', 'setup', 'bots', 'test']) assert.match(source, new RegExp(`cmd==='${cmd}'`));
  assert.match(source, /if\(!admin\(m\.member\)\)return m\.reply\('❌ Admin permission is required\.'\)/);
  assert.match(source, /does not simulate every Discord event/i);
});
test('expanded log catalog includes key screenshot channel families and localized names', () => {
  for (const name of ['stream-leaderboard','member-move-logs','voice-sessions','everyone-mentions','kick-details','camera-details','slash-commands','anti-spam-alerts','bulk-deletes','poll-votes','soundboard-logs','application-cmd-logs','monetization-logs','guild-security-logs']) assert.ok(source.includes(name), `missing ${name}`);
  assert.match(source, /تفاصيل-الكاميرا/);
});
