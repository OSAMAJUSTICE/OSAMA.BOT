'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const root = path.join(__dirname, '..');
const source = [path.join(root, 'data', 'im-your-daddy.sqlite'), path.join(root, 'data', 'kshk.sqlite')].find(fs.existsSync);
const outDir = path.join(root, 'backups');
if (!source || !fs.existsSync(source)) { console.error('Database not found. Start the bot once before creating a backup.'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(outDir, `im-your-daddy-${stamp}.sqlite`);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destination);
    fs.chmodSync(destination, 0o600);
    const backups = fs.readdirSync(outDir).filter(f => /^im-your-daddy-.*\.sqlite$/.test(f)).map(f => ({f, t:fs.statSync(path.join(outDir,f)).mtimeMs})).sort((a,b)=>b.t-a.t);
    for (const old of backups.slice(10)) fs.rmSync(path.join(outDir, old.f), {force:true});
    console.log(`Database backup created: ${path.relative(root, destination)}`);
  } catch (e) { console.error('Backup failed:', e.message); process.exitCode = 1; }
  finally { db.close(); }
})();
