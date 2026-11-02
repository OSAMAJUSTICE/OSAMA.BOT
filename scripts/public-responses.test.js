const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('ordinary command and panel responses are public; only server backup exports defer privately', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const ephemeralUses = [...source.matchAll(/flags:\s*MessageFlags\.Ephemeral/g)].map(m => source.slice(Math.max(0, m.index - 100), m.index + 100));
  assert.equal(ephemeralUses.length, 3, 'server backup exports and destructive bulk channel deletion should defer privately');
  for (const context of ephemeralUses) assert.match(context, /makeServerBackup|delete-all-channels|Manage Channels/, 'private deferral must be a server backup export or destructive bulk channel deletion');
  const translateStart = source.indexOf("if(n==='translate'){");
  assert.notEqual(translateStart, -1);
  assert.match(source.slice(translateStart, translateStart + 450), /await i\.deferReply\(\)/);
  assert.doesNotMatch(source, /flags:\s*MessageFlags\.Ephemeral[^\n]*i\.(?:reply|followUp)\(/);
});
