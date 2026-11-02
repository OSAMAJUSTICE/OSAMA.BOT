'use strict';

const crypto = require('node:crypto');

const TOKEN_RE = /[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/g;
const PLACEHOLDER = /^(?:PUT_|REPLACE_|CHANGE_THIS|YOUR_)/i;

function makeRedactor(secrets) {
  const values = [...new Set((secrets || []).filter(v => typeof v === 'string' && v.length >= 8))]
    .sort((a, b) => b.length - a.length);
  return function redact(value) {
    let out = String(value);
    for (const secret of values) out = out.split(secret).join('[REDACTED]');
    return out.replace(TOKEN_RE, '[REDACTED_TOKEN]');
  };
}

function installLogRedaction(secrets) {
  const redact = makeRedactor(secrets);
  const sanitize = value => {
    if (typeof value === 'string') return redact(value);
    if (value instanceof Error) {
      const clean = new Error(redact(value.message));
      clean.name = value.name;
      clean.stack = redact(value.stack || '');
      return clean;
    }
    if (value && typeof value === 'object') {
      try { return JSON.parse(redact(JSON.stringify(value))); }
      catch { return '[object]'; }
    }
    return value;
  };
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method].bind(console);
    console[method] = (...args) => original(...args.map(sanitize));
  }
  return redact;
}

function createLimiter({ max = 8, windowMs = 10_000, penaltyMs = 30_000, maxKeys = 20_000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    check(key) {
      const time = now();
      let bucket = buckets.get(key);
      if (!bucket || time - bucket.startedAt >= windowMs) {
        bucket = { startedAt: time, count: 0, blockedUntil: 0 };
        buckets.set(key, bucket);
      }
      if (buckets.size > maxKeys) {
        for (const [k, v] of buckets) if (time - v.startedAt >= windowMs && v.blockedUntil <= time) buckets.delete(k);
        while (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value);
      }
      if (bucket.blockedUntil > time) return { ok: false, retryAfterMs: bucket.blockedUntil - time };
      bucket.count++;
      if (bucket.count > max) {
        bucket.blockedUntil = time + penaltyMs;
        return { ok: false, retryAfterMs: penaltyMs };
      }
      return { ok: true, retryAfterMs: 0 };
    },
    clear() { buckets.clear(); }
  };
}

function isPlaceholder(value) {
  return !value || PLACEHOLDER.test(String(value));
}

function checkEnvironment(env = process.env) {
  const issues = [];
  if (isPlaceholder(env.DISCORD_TOKEN)) issues.push({ level: 'error', message: 'DISCORD_TOKEN is missing or still a placeholder.' });
  if (!/^\d{17,20}$/.test(String(env.CLIENT_ID || ''))) issues.push({ level: 'error', message: 'CLIENT_ID must be a valid 17–20 digit Discord application ID.' });
  if (env.CLIENT_SECRET && !isPlaceholder(env.CLIENT_SECRET)) {
    if (isPlaceholder(env.SESSION_SECRET) || String(env.SESSION_SECRET).length < 32) issues.push({ level: 'error', message: 'SESSION_SECRET must be a random secret of at least 32 characters when dashboard OAuth is configured.' });
    const dashboardUrl = String(env.DASHBOARD_URL || '');
    try {
      const url = new URL(dashboardUrl);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) issues.push({ level: 'error', message: 'DASHBOARD_URL must use HTTPS except for localhost development.' });
    } catch { issues.push({ level: 'error', message: 'DASHBOARD_URL must be a valid URL when dashboard OAuth is configured.' }); }
  }
  return { ok: !issues.some(x => x.level === 'error'), issues };
}

function printEnvironmentReport(issues) {
  for (const issue of issues || []) {
    const log = issue.level === 'error' ? console.error : console.warn;
    log(`[security] ${String(issue.level || 'info').toUpperCase()}: ${issue.message}`);
  }
  if (!(issues || []).length) console.log('[security] Environment configuration checks passed.');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

module.exports = { installLogRedaction, createLimiter, checkEnvironment, printEnvironmentReport, isPlaceholder, safeEqual };
