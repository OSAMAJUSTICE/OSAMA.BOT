'use strict';
const db = require('../src/db');
try {
  const result = db.pragma('quick_check');
  if (!Array.isArray(result) || result.length !== 1 || result[0].quick_check !== 'ok') {
    console.error('SQLite integrity check failed:', result); process.exitCode = 1;
  } else {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    for (const name of ['economy','warnings','levels','suggestions','giveaways','guild_settings','tickets','starboard','dashboard_sessions']) {
      if (!tables.includes(name)) throw new Error(`Missing expected table: ${name}`);
    }
    console.log('SQLite quick_check passed. Required tables are present.');
  }
} catch (e) { console.error('Database verification failed:', e.message); process.exitCode = 1; }
finally { db.close(); }
