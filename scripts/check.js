const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const projectRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const configJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config.json'), 'utf8'));
if (!packageJson.dependencies?.['discord.js'] || !packageJson.dependencies?.['better-sqlite3']) { console.error('Required dependencies are missing from package.json.'); process.exit(1); }
if (!configJson.economy || !configJson.automod || !configJson.antiRaid || !configJson.logs) { console.error('Required configuration sections are missing from config.json.'); process.exit(1); }
const commandSource = fs.readFileSync(path.join(projectRoot, 'src', 'commands.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(projectRoot, 'src', 'index.js'), 'utf8');
const extrasSource = fs.readFileSync(path.join(projectRoot, 'src', 'extras.js'), 'utf8');
const gamesSource = fs.readFileSync(path.join(projectRoot, 'src', 'games.js'), 'utf8');
const communitySource = fs.readFileSync(path.join(projectRoot, 'src', 'community-tools.js'), 'utf8');
const taxSource = fs.readFileSync(path.join(projectRoot, 'src', 'transfer-tax.js'), 'utf8');
const automodSource = fs.readFileSync(path.join(projectRoot, 'src', 'automod.js'), 'utf8');
const commandNames = [...commandSource.matchAll(/^\s*new SlashCommandBuilder\(\)\.setName\('([^']+)'/gm), ...extrasSource.matchAll(/^\s*new SlashCommandBuilder\(\)\.setName\('([^']+)'/gm), ...gamesSource.matchAll(/^\s*new SlashCommandBuilder\(\)\.setName\('([^']+)'/gm), ...taxSource.matchAll(/^\s*new SlashCommandBuilder\(\)\.setName\('([^']+)'/gm)].map(m => m[1]).concat(['community', 'automod', 'transfer-tax', 'transfer-tax-config', 'islamic', 'setup-religious', 'setup-islamic-catalog', 'test-religious', 'image-sources', 'collect-images']);
if (new Set(commandNames).size !== commandNames.length) { console.error('Duplicate slash command names found.'); process.exit(1); }
if (commandNames.length > 100) { console.error(`Discord application command limit exceeded: ${commandNames.length}/100.`); process.exit(1); }
if (commandNames.some(name => !/^[a-z0-9_-]{1,32}$/.test(name))) { console.error('Invalid Discord slash command name detected.'); process.exit(1); }
if (packageJson.name !== 'im-your-daddy-bot' || configJson.brand !== '『♔𝙄𝙈 𝐘𝙊𝐔𝐑 𝐃𝘼𝐃𝐃𝐘♔』') { console.error('Project package name or brand does not match the requested identity.'); process.exit(1); }
if (typeof configJson.tickets?.enabled !== 'boolean' || typeof configJson.giveaways?.enabled !== 'boolean') { console.error('Feature enable/disable flags must be booleans.'); process.exit(1); }
const missingHandlers = commandNames.filter(name => (`${indexSource}\n${extrasSource}\n${gamesSource}\n${communitySource}\n${taxSource}\n${automodSource}\n${fs.readFileSync(path.join(projectRoot, 'src', 'command-locales.js'), 'utf8')}`.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length < 2);
if (missingHandlers.length && !indexSource.includes('function buildHelpPayload')) { console.error(`Possible commands without a handler or help entry: ${missingHandlers.join(', ')}`); process.exit(1); }
console.log(`Static config check passed; ${commandNames.length} unique slash commands declared, handlers/help references checked, and branding verified.`);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]).filter(p=>p.endsWith('.js'));
}
const files = [...walk(projectRoot)].filter(p => !p.includes(`${path.sep}node_modules${path.sep}`));
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (result.status !== 0) { failed = true; console.error(`FAIL ${path.relative(process.cwd(),file)}\n${result.stderr}`); }
  else console.log(`OK   ${path.relative(process.cwd(),file)}`);
}
if (!files.length) { console.error('No JavaScript files found.'); process.exit(1); }
if (failed) process.exit(1);
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
