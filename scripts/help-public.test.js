const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('/help reply is public and includes an interactive category dropdown', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const start = source.indexOf("if(n==='help'){");
  const end = source.indexOf("if(n==='banner')", start);
  assert.notEqual(start, -1, 'help handler exists');
  assert.notEqual(end, -1, 'help handler ends before banner handler');
  const helpHandler = source.slice(start, end);
  assert.match(helpHandler, /return showHelpForInteraction\(i,category,0\);/);
  assert.doesNotMatch(helpHandler, /MessageFlags\.Ephemeral|ephemeral:\s*true/);
  assert.match(source, /setCustomId\('help:category'\)/);
  assert.match(source, /return showHelpForInteraction\(i,chosen,0\);/);
});


test('/help paginates every command instead of truncating the All Commands view', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(source, /const pageSize=6, totalPages=Math\.max\(1,Math\.ceil\(visible\.length\/pageSize\)\)/);
  assert.match(source, /setCustomId\(`help:page:\$\{selected\}:\$\{currentPage\+1\}`\)/);
  assert.match(source, /i\.isButton\(\)&&i\.customId\.startsWith\('help:page:'\)/);
  assert.match(source, /الأوامر المسجلة:/);
});


test('/help uses Arabic descriptions and a styled embed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(source, /function helpDescriptionArabic\(command\)/);
  assert.match(source, /helpDescriptionArabic\(c\)/);
  assert.match(source, /setAuthor\(\{name:`\$\{config\.brand\}  •  مركز المساعدة`/);
  assert.match(source, /setFooter\(\{text:'IMYD • لوحة مساعدة تفاعلية/);
  assert.match(source, /دليل أوامر البوت/);
});


test('/help localizes the complete interactive panel to the configured server language', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  assert.match(source, /async function localizedHelpPayload\(interaction, category='moderation', page=0\)/);
  assert.match(source, /i18n\.languageFor\(interaction\)/);
  assert.match(source, /i18n\.localizePayload\(payload,language\)/);
  assert.match(source, /async function showHelpForInteraction/);
  assert.match(source, /interaction\.deferUpdate\(\)/);
  assert.match(source, /interaction\.editReply\(payload\)/);
  assert.match(source, /commandLocales\.commandNameForLanguage\(c\.name,language\)/);
});
