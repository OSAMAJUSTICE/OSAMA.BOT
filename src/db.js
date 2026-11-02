'use strict';
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const databasePath = path.join(dataDir, 'im-your-daddy.sqlite');
const legacyDatabasePath = path.join(dataDir, 'kshk.sqlite');
if (!fs.existsSync(databasePath) && fs.existsSync(legacyDatabasePath)) {
  // Migrate the previous database filename once; preserve user/server data.
  const legacy = new Database(legacyDatabasePath, { timeout: 5000 });
  try { legacy.pragma('wal_checkpoint(TRUNCATE)'); } finally { legacy.close(); }
  fs.renameSync(legacyDatabasePath, databasePath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = legacyDatabasePath + suffix;
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
  }
  console.warn('Migrated existing database to the new project filename.');
}
const db = new Database(databasePath, { timeout: 5000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');
db.pragma('trusted_schema = OFF');
db.exec(`
CREATE TABLE IF NOT EXISTS warnings(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,moderator_id TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id,user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS levels(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,xp INTEGER NOT NULL DEFAULT 0,level INTEGER NOT NULL DEFAULT 0,last_xp INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS giveaways(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT NOT NULL,prize TEXT NOT NULL,ends_at INTEGER NOT NULL,ended INTEGER NOT NULL DEFAULT 0,ending INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS guild_settings(guild_id TEXT PRIMARY KEY,settings_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS dashboard_sessions(sid TEXT PRIMARY KEY,sess TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expiry ON dashboard_sessions(expires);
CREATE TABLE IF NOT EXISTS tickets(channel_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(guild_id,owner_id);
CREATE TABLE IF NOT EXISTS starboard(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,posted_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,details TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_languages(user_id TEXT PRIMARY KEY, language TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bot_preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS delete_whitelist(user_id TEXT PRIMARY KEY, added_by TEXT NOT NULL, added_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created ON audit_logs(guild_id,created_at DESC);
`);
// Safe migration: old global balances are preserved in economy_legacy; new balances are isolated per guild.
const economyCols = db.prepare("PRAGMA table_info('economy')").all();
if (economyCols.length && !economyCols.some(c => c.name === 'guild_id')) {
  db.exec('ALTER TABLE economy RENAME TO economy_legacy');
}
db.exec(`CREATE TABLE IF NOT EXISTS economy(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,last_daily INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id));
CREATE INDEX IF NOT EXISTS idx_economy_leaderboard ON economy(guild_id,balance DESC);`);
const giveawayCols = db.prepare("PRAGMA table_info('giveaways')").all().map(c => c.name);
if (!giveawayCols.includes('ending')) db.exec('ALTER TABLE giveaways ADD COLUMN ending INTEGER NOT NULL DEFAULT 0');
module.exports = db;

// Enforce one tracked open ticket per owner and server; preserve the newest record if upgrading old duplicate data.
db.exec("DELETE FROM tickets WHERE rowid NOT IN (SELECT MAX(rowid) FROM tickets GROUP BY guild_id, owner_id)");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_one_open_per_owner ON tickets(guild_id,owner_id)');
