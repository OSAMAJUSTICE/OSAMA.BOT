const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const commands = fs.readFileSync(path.join(root, 'src', 'commands.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');

test('all dedicated panels, including sticker tools and server clone, are registered for publishing and image customization', () => {
  for (const [name, label] of [['welcome','Welcome'],['goodbye','Goodbye'],['logs','Event logs'],['autorole','Automatic role'],['verification','Verification'],['tempVoice','Temporary voice rooms'],['tickets','Tickets'],['suggestions','Suggestions'],['antiRaid','Anti-raid'],['backups','Backups'],['stickers','Sticker & Emoji Tools'],['serverClone','Server Clone']]) {
    assert.ok(commands.includes(`{name:'${label}',value:'${name}'}`), `missing command choice ${name}`);
    assert.ok(index.includes(`${name}:[`), `missing artwork metadata ${name}`);
    assert.ok(fs.existsSync(path.join(root, 'assets', 'panels', `${name}.png`)), `missing panel artwork ${name}`);
  }
});

test('help all-commands view is generated from every registered slash command', () => {
  assert.match(index, /selected==='all'\?commands:commands\.filter/);
  assert.match(index, /pageCommands\.map\(\(c,index\)=>/);
  assert.match(commands, /setName\('help'\)/);
});

test('sticker and server clone panel buttons explain real supported commands and limitations', () => {
  assert.match(index, /sp:tools:stickers/);
  assert.match(index, /sp:tools:serverClone/);
  assert.match(index, /Clone supported server structure/);
});


test('help panel exposes the organized Arabic categories and builds all commands dynamically', () => {
  for (const category of ['الإشراف وإدارة الأعضاء','الرولات والصلاحيات','إعدادات السيرفر واللوحات','الحماية وسجلات الأحداث','الإشراف التلقائي (AutoMod)','الصوت والموسيقى وأدوات الأعضاء','المستويات والخبرة والترتيب','المجتمع والاقتصاد والألعاب','الصور والوسائط والمحتوى','معلومات السيرفر والأعضاء','القرآن الكريم والمحتوى الإسلامي','أدوات البوت والإعدادات العامة']) {
    assert.ok(index.includes(`label:'${category}'`), `missing help category ${category}`);
  }
  assert.match(index, /setCustomId\('help:category'\)/);
  assert.match(index, /selected==='all'\?commands:commands\.filter/);
  assert.match(index, /pageCommands\.map\(\(c,index\)=>/);
});
