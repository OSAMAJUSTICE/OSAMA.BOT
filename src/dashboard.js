'use strict';
const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const path = require('node:path');
const db = require('./db');
const { PermissionFlagsBits } = require('discord.js');
const i18n = require('./i18n');

class SQLiteSessionStore extends session.Store {
  constructor() { super(); this.getStmt = db.prepare('SELECT sess,expires FROM dashboard_sessions WHERE sid=?'); this.setStmt = db.prepare('INSERT INTO dashboard_sessions(sid,sess,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expires=excluded.expires'); this.delStmt = db.prepare('DELETE FROM dashboard_sessions WHERE sid=?'); this.touchStmt = db.prepare('UPDATE dashboard_sessions SET expires=? WHERE sid=?'); }
  get(sid, cb) { try { const row=this.getStmt.get(sid); if(!row) return cb(null,null); if(row.expires <= Date.now()){this.delStmt.run(sid);return cb(null,null);} return cb(null,JSON.parse(row.sess)); } catch(e){cb(e);} }
  set(sid, sess, cb=()=>{}) { try { const exp=sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+(Number(sess.cookie?.maxAge)||7200000); this.setStmt.run(sid,JSON.stringify(sess),exp); cb(null); } catch(e){cb(e);} }
  destroy(sid, cb=()=>{}) { try { this.delStmt.run(sid); cb(null); } catch(e){cb(e);} }
  touch(sid, sess, cb=()=>{}) { try { const exp=sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+(Number(sess.cookie?.maxAge)||7200000); this.touchStmt.run(exp,sid); cb(null); } catch(e){cb(e);} }
}

function startDashboard(client, config) {
  if (config.dashboard?.enabled === false) return;
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('Dashboard disabled: PORT must be an integer from 1 to 65535.'); return; }
  const baseUrl = (process.env.DASHBOARD_URL || `http://localhost:${port}`).replace(/\/$/, '');
  let parsedBaseUrl;
  try { parsedBaseUrl = new URL(baseUrl); } catch { console.error('Dashboard disabled: DASHBOARD_URL must be a valid absolute URL.'); return; }
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol) || parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) { console.error('Dashboard disabled: DASHBOARD_URL must be an HTTP(S) URL without credentials, query, or fragment.'); return; }
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  let sessionSecret = process.env.SESSION_SECRET;
  if (!clientId || !clientSecret || clientSecret === 'PUT_APPLICATION_CLIENT_SECRET_HERE') {
    console.warn('Dashboard disabled: set CLIENT_ID and CLIENT_SECRET in .env.'); return;
  }
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === 'REPLACE_WITH_A_LONG_RANDOM_SECRET') {
    sessionSecret = crypto.randomBytes(48).toString('hex');
    console.warn('SESSION_SECRET was missing/invalid; generated a secure temporary secret for this run. Set a persistent random SESSION_SECRET in the host environment to keep dashboard sessions valid across restarts.');
  }
  if (process.env.NODE_ENV === 'production' && !baseUrl.startsWith('https://')) {
    console.error('Dashboard disabled in production unless DASHBOARD_URL uses HTTPS.'); return;
  }
  const app = express();
  const rateBuckets = new Map();
  app.use((req, res, next) => {
    const now = Date.now(), key = `${req.ip}:${req.path.startsWith('/auth/') ? 'oauth' : 'web'}`, entry = rateBuckets.get(key) || { start: now, count: 0 };
    if (now - entry.start > 60000) { entry.start = now; entry.count = 0; }
    entry.count++; rateBuckets.set(key, entry);
    if (entry.count > (key.endsWith('oauth') ? 20 : 120)) return res.status(429).send('Too many requests. Please wait and try again.');
    if (rateBuckets.size > 5000) for (const [k,v] of rateBuckets) if (now - v.start > 120000) rateBuckets.delete(k);
    next();
  });
  if (baseUrl.startsWith('https://')) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const cspNonce = crypto.randomBytes(18).toString('base64');
    res.locals.cspNonce = cspNonce;
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${cspNonce}'; style-src 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    res.setHeader('Cache-Control', 'no-store');
    if (baseUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '12kb', parameterLimit: 60 }));
  const sessionStore = new SQLiteSessionStore();
  setInterval(() => { try { db.prepare('DELETE FROM dashboard_sessions WHERE expires<=?').run(Date.now()); } catch (e) { console.error('Session cleanup:', e.message); } }, 60 * 60 * 1000).unref();
  app.use(session({ name: 'imydaddy.sid', secret: sessionSecret, store: sessionStore, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: baseUrl.startsWith('https://'), maxAge: 2 * 60 * 60 * 1000, path: '/' } }));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const languageOptions = Object.entries(i18n.LANGUAGES).filter(([code]) => code !== 'en').map(([code, language]) => `<option value="${esc(code)}">${esc(language.name)}</option>`).join('');
  const page = (title, body, user, csrf, nonce) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>:root{color-scheme:dark}body{font:16px system-ui;background:#111827;color:#e5e7eb;max-width:960px;margin:40px auto;padding:0 18px}a,button{color:white;background:#5865f2;padding:10px 14px;border-radius:8px;border:0;text-decoration:none;cursor:pointer}input,select{padding:10px;border-radius:6px;border:1px solid #374151;background:#1f2937;color:white;width:min(100%,620px);box-sizing:border-box}label{display:block;margin:16px 0 6px}.card{background:#1f2937;border:1px solid #374151;border-radius:12px;padding:18px;margin:14px 0}.card h2{margin-top:0}.card p{line-height:1.5}button{margin-top:10px;margin-right:8px}select{display:block}.muted{color:#9ca3af}form{margin:8px 0}code{color:#c4b5fd}.language-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 18px}.language-tools label{margin:0}.language-tools select{width:auto;min-width:180px}</style></head><body><div class="language-tools"><label for="ui-language">Dashboard language / لغة لوحة التحكم</label><select id="ui-language"><option value="en">English</option>${languageOptions}</select><span id="translation-status" class="muted" aria-live="polite"></span></div><h1 data-no-translate="true">${esc(title)}</h1>${user ? `<div class="muted">Signed in as <span data-no-translate="true">${esc(user.username)}</span><form method="post" action="/logout"><input type="hidden" name="_csrf" value="${esc(csrf || '')}"><button type="submit">Log out</button></form></div>` : ''}${body}<script nonce="${esc(nonce || '')}">
(function(){
 const select=document.getElementById('ui-language'),status=document.getElementById('translation-status');
 const supported=${JSON.stringify(Object.keys(i18n.LANGUAGES))};
 const original=new WeakMap(),originalAttrs=new WeakMap();
 function textNodes(){const out=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||!node.nodeValue.trim()||parent.closest('script,style,code,pre,textarea,option,select,[data-no-translate=\"true\"]'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}});while(walker.nextNode())out.push(walker.currentNode);return out;}
 function collectItems(){const items=[];for(const node of textNodes()){if(!original.has(node))original.set(node,node.nodeValue);items.push({text:original.get(node),apply:value=>{node.nodeValue=value;}});}for(const option of document.querySelectorAll('option:not(#ui-language option)')){if(!original.has(option))original.set(option,option.textContent);items.push({text:original.get(option),apply:value=>{option.textContent=value;}});}for(const element of document.querySelectorAll('[placeholder],[title],[aria-label]')){if(element.closest('script,style,code,pre,textarea,option,select,[data-no-translate=\"true\"]'))continue;let saved=originalAttrs.get(element);if(!saved){saved={};originalAttrs.set(element,saved);}for(const attr of ['placeholder','title','aria-label']){if(!element.hasAttribute(attr))continue;if(!(attr in saved))saved[attr]=element.getAttribute(attr);items.push({text:saved[attr],apply:value=>element.setAttribute(attr,value)});}}return items;}
 let translationRun=0;
 async function applyLanguage(lang){const run=++translationRun;document.documentElement.lang=lang==='zh'?'zh-CN':lang;select.value=lang;const items=collectItems();if(lang==='en'){for(const item of items)item.apply(item.text);status.textContent='';return;}
 const unique=[...new Set(items.map(x=>x.text))];status.textContent='Translating…';
 try{const map=new Map();for(let offset=0;offset<unique.length;offset+=60){if(run!==translationRun)return;const batch=unique.slice(offset,offset+60);const response=await fetch('/api/translate-ui',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:lang,texts:batch})});const data=await response.json();if(!response.ok||!Array.isArray(data.translations))throw new Error(data.error||'Translation unavailable');batch.forEach((text,index)=>map.set(text,data.translations[index]||text));}if(run!==translationRun)return;for(const item of items)item.apply(map.get(item.text)||item.text);status.textContent='';}catch(error){if(run===translationRun)status.textContent='Some text could not be translated; original text is preserved.';}
 }
 let initial='en';try{const saved=localStorage.getItem('imydaddy-dashboard-language');if(saved&&supported.includes(saved))initial=saved;else{const browser=(navigator.language||'en').toLowerCase().split('-')[0];if(supported.includes(browser))initial=browser;}}catch{}
 select.value=initial;select.addEventListener('change',()=>{try{localStorage.setItem('imydaddy-dashboard-language',select.value);}catch{}applyLanguage(select.value);});if(initial!=='en')applyLanguage(initial);
})();
</script></body></html>`;
  function auth(req, res, next) { if (!req.session.user) return res.redirect('/'); next(); }
  function safeEqual(a, b) { const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || '')); return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb); }
  function ensureCsrf(req, res, next) {
    const submitted = String(req.body?._csrf || ''); const expected = String(req.session.csrf || '');
    if (!safeEqual(submitted, expected)) return res.status(403).send('Invalid security token. Refresh the page and try again.');
    next();
  }
  async function allowedGuild(req, gid) {
    const entry = (req.session.guilds || []).find(g => g.id === gid && (((BigInt(g.permissions) & 0x8n) !== 0n) || ((BigInt(g.permissions) & 0x20n) !== 0n)));
    const guild = client.guilds.cache.get(gid);
    if (!entry || !guild || !/^\d{17,20}$/.test(gid) || !/^\d{17,20}$/.test(String(req.session.user?.id || ''))) return null;
    try {
      const member = await guild.members.fetch({ user: req.session.user.id, force: true });
      if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) return null;
      return entry;
    } catch { return null; }
  }
  function mergeDeep(base, override) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
    const out = { ...base };
    for (const [k,v] of Object.entries(override)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeDeep(base?.[k] || {}, v) : v;
    return out;
  }
  // Dashboard-only text translation endpoint. It accepts a small bounded list,
  // translates only plain text, and never returns executable HTML.
  app.post('/api/translate-ui', express.json({ limit: '12kb' }), async (req, res) => {
    const language = i18n.normalizeLanguage(req.body?.language);
    const texts = req.body?.texts;
    if (!language || language === 'en' || !Array.isArray(texts) || texts.length > 80 || texts.some(text => typeof text !== 'string' || text.length > 300) || texts.reduce((sum, text) => sum + (typeof text === 'string' ? text.length : 0), 0) > 8000) {
      return res.status(400).json({ error: 'Invalid translation request.' });
    }
    try {
      const translations = new Array(texts.length);
      let nextIndex = 0;
      const workers = Array.from({ length: Math.min(6, texts.length) }, async () => {
        while (nextIndex < texts.length) {
          const index = nextIndex++;
          translations[index] = await i18n.translateRuntimeText(texts[index], language);
        }
      });
      await Promise.all(workers);
      return res.json({ language, translations });
    } catch (error) {
      console.warn('[dashboard-i18n] Translation fallback:', error.message);
      return res.status(503).json({ error: 'Translation service temporarily unavailable.' });
    }
  });
  const builderDir = path.join(__dirname, '..', 'tools', 'components-builder');
  app.get('/tools/components-builder', auth, (req, res) => res.redirect('/tools/components-builder/'));
  app.get('/tools/components-builder/', auth, (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https://discord.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.sendFile(path.join(builderDir, 'index.html'));
  });
  app.get('/tools/components-builder/:asset', auth, (req, res) => {
    const allowed = { 'script.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' };
    const type = allowed[req.params.asset];
    if (!type) return res.status(404).send('Not found.');
    res.type(type).sendFile(path.join(builderDir, req.params.asset));
  });

  app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/servers');
    res.send(page(config.brand || '『♔𝙄𝙈 𝐘𝙊𝐔𝐑 𝐃𝘼𝐃𝐃𝐘♔』', `<div class="card"><p>Sign in with Discord. You can manage only servers where you have Administrator or Manage Server permission and the bot is installed.</p><a href="/auth/login">Login with Discord</a></div><p class="muted">OAuth2 redirect URI: <code>${esc(baseUrl)}/auth/callback</code></p>`, undefined, undefined, res.locals.cspNonce));
  });
  app.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(32).toString('hex'); req.session.oauthState = state;
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
    url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', 'identify guilds'); url.searchParams.set('state', state);
    res.redirect(url.toString());
  });
  app.get('/auth/callback', async (req, res) => {
    try {
      const supplied = String(req.query.state || ''), expected = String(req.session.oauthState || '');
      if (!req.query.code || !safeEqual(supplied, expected)) return res.status(400).send('Invalid OAuth state. Please log in again.');
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'authorization_code',code:String(req.query.code),redirect_uri:`${baseUrl}/auth/callback`}), signal: AbortSignal.timeout(10000) });
      const tokenData = await tokenRes.json(); if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAuth token exchange failed');
      const headers = { Authorization: `Bearer ${tokenData.access_token}` };
      const [userRes, guildRes] = await Promise.all([fetch('https://discord.com/api/users/@me',{headers,signal:AbortSignal.timeout(10000)}),fetch('https://discord.com/api/users/@me/guilds',{headers,signal:AbortSignal.timeout(10000)})]);
      if (!userRes.ok || !guildRes.ok) throw new Error('Could not retrieve Discord profile/guilds');
      const user = await userRes.json(), guilds = await guildRes.json();
      // The access token is only needed for this callback; revoke it after fetching profile/server data.
      try {
        await fetch('https://discord.com/api/oauth2/token/revoke', {
          method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
          body: new URLSearchParams({client_id:clientId,client_secret:clientSecret,token:tokenData.access_token,token_type_hint:'access_token'}),
          signal: AbortSignal.timeout(5000)
        });
      } catch (revokeError) { console.warn('Could not revoke temporary dashboard OAuth token:', revokeError.message); }
      req.session.regenerate(err => {
        if (err) return res.status(500).send('Could not create secure session.');
        req.session.user = { id: user.id, username: user.username, avatar: user.avatar };
        req.session.guilds = guilds; req.session.csrf = crypto.randomBytes(32).toString('hex');
        req.session.save(saveErr => saveErr ? res.status(500).send('Could not save session.') : res.redirect('/servers'));
      });
    } catch (e) { console.error('Dashboard OAuth:', e.message); res.status(502).send('Discord login failed. Check OAuth settings and try again.'); }
  });
  app.get('/servers', auth, (req, res) => {
    const csrf = req.session.csrf || (req.session.csrf = crypto.randomBytes(32).toString('hex'));
    const guilds = (req.session.guilds || []).filter(g => (((BigInt(g.permissions) & 0x8n) !== 0n) || ((BigInt(g.permissions) & 0x20n) !== 0n))).filter(g => client.guilds.cache.has(g.id));
    const list = guilds.map(g => `<div class="card"><h3>${esc(g.name)}</h3><a href="/servers/${esc(g.id)}">Manage settings</a></div>`).join('') || '<p>No manageable servers found where the bot is installed.</p>';
    const toolsCard = '<div class="card"><h3>🧱 Components V2 & Webhook Builder</h3><p>Build Components V2 messages visually, preview them, generate discord.js code, and send embeds through a Discord webhook.</p><a href="/tools/components-builder/">Open visual builder</a></div>';
    res.send(page('Your servers', toolsCard + list, req.session.user, csrf, res.locals.cspNonce));
  });
  app.get('/servers/:id/backup', auth, async (req, res) => {
    const gid=req.params.id, entry=await allowedGuild(req,gid); if(!/^\d{17,20}$/.test(gid)||!entry)return res.status(403).send('Forbidden');
    const guild=client.guilds.cache.get(gid); await guild.roles.fetch().catch(()=>{}); await guild.channels.fetch().catch(()=>{});
    const roles=[...guild.roles.cache.values()].filter(r=>r.id!==gid&&!r.managed).sort((a,b)=>a.position-b.position).map(r=>({id:r.id,name:r.name,color:r.color,hoist:r.hoist,mentionable:r.mentionable,permissions:r.permissions.bitfield.toString(),position:r.position}));
    const supported=new Set([0,2,4,5,10,11,12,13,15]);
    const channels=[...guild.channels.cache.values()].filter(ch=>supported.has(ch.type)).map(ch=>({id:ch.id,name:ch.name,type:ch.type,position:ch.rawPosition,parentId:ch.parentId||null,topic:ch.topic||null,nsfw:Boolean(ch.nsfw),rateLimitPerUser:Number(ch.rateLimitPerUser||0),bitrate:ch.bitrate||null,userLimit:ch.userLimit||0,overwrites:[...ch.permissionOverwrites.cache.values()].filter(o=>o.type===0).map(o=>({id:o.id,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}))})).sort((a,b)=>a.position-b.position);
    const data={format:'im-your-daddy-server-template',version:1,createdAt:new Date().toISOString(),sourceGuild:{id:gid,name:guild.name},roles,channels};
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename=server-template-${gid}.json`);res.send(JSON.stringify(data,null,2));
  });
  app.get('/servers/:id', auth, async (req, res) => {
    const gid = req.params.id, guild = await allowedGuild(req, gid);
    if (!/^\d{17,20}$/.test(gid) || !guild) return res.status(403).send('You do not have access to this server or the bot is not installed.');
    const stored = db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(gid);
    let saved = {}; try { saved = stored ? JSON.parse(stored.settings_json) : {}; } catch {}
    const settings = mergeDeep(config, saved), csrf = req.session.csrf || (req.session.csrf = crypto.randomBytes(32).toString('hex'));
    const discordGuild = client.guilds.cache.get(gid); await discordGuild.channels.fetch().catch(()=>{}); await discordGuild.roles.fetch().catch(()=>{});
    const channels = [...discordGuild.channels.cache.values()].filter(ch => ch.type === 0 || ch.type === 5 || ch.type === 2 || ch.type === 13 || ch.type === 4).sort((a,b)=>a.rawPosition-b.rawPosition);
    const textChannels = channels.filter(ch => ch.type === 0 || ch.type === 5);
    const voiceChannels = channels.filter(ch => ch.type === 2);
    const categories = channels.filter(ch => ch.type === 4);
    const roles = [...discordGuild.roles.cache.values()].filter(r=>r.id!==gid&&!r.managed).sort((a,b)=>b.position-a.position);
    const channelSelect = (name,label,value,list,allowBlank=true) => `<label>${esc(label)}</label><select name="${esc(name)}"><option value="">${allowBlank?'— Not configured —':'Choose a channel'}</option>${list.map(ch=>`<option value="${ch.id}" ${value===ch.id?'selected':''}>#${esc(ch.name)} (${ch.id})</option>`).join('')}</select>`;
    const roleSelect = (name,label,value) => `<label>${esc(label)}</label><select name="${esc(name)}"><option value="">— Not configured —</option>${roles.map(r=>`<option value="${r.id}" ${value===r.id?'selected':''}>@${esc(r.name)} (${r.id})</option>`).join('')}</select>`;
    const categorySelect = (name,label,value) => channelSelect(name,label,value,categories);
    const toggle = (key,label,value) => `<label><input style="width:auto" type="checkbox" name="${esc(key)}" ${value?'checked':''}> ${esc(label)}</label>`;
    const card = (title,description,content) => `<section class="card"><h2>${esc(title)}</h2><p class="muted">${esc(description)}</p>${content}</section>`;
    const panels = [
      card('👋 Welcome & goodbye','اختر رومات الترحيب والمغادرة.',toggle('welcome.enabled','Enable welcome',settings.welcome?.enabled)+channelSelect('welcome.channelId','Welcome channel',settings.welcome?.channelId,textChannels)+toggle('goodbye.enabled','Enable goodbye',settings.goodbye?.enabled)+channelSelect('goodbye.channelId','Goodbye channel',settings.goodbye?.channelId,textChannels)),
      card('🛡️ Verification & auto roles','حدد رتبة التوثيق والرول التلقائي. زر التوثيق يمنح الرتبة المختارة فقط بعد ضغط العضو.',toggle('verification.enabled','Enable verification panel',settings.verification?.enabled)+channelSelect('verification.channelId','Verification channel',settings.verification?.channelId,textChannels)+roleSelect('verification.roleId','Verified member role',settings.verification?.roleId)+toggle('autorole.enabled','Give autorole automatically on join',settings.autorole?.enabled)+roleSelect('autorole.roleId','Automatic join role',settings.autorole?.roleId)),
      card('🛡️ New-account protection','Optionally kick accounts younger than the configured age. This is strict and may remove legitimate new members, so it is disabled by default.',toggle('accountAgeProtection.enabled','Enable new-account age protection',settings.accountAgeProtection?.enabled)+`<label>Minimum account age (days; 1–365)</label><input type="number" name="accountAgeProtection.minDays" min="1" max="365" value="${esc(settings.accountAgeProtection?.minDays||7)}" required>`+channelSelect('accountAgeProtection.logChannelId','Account-age protection log channel',settings.accountAgeProtection?.logChannelId,textChannels)),
      card('🎮 Activity auto-roles','Assign/remove roles when Discord exposes the matching activity. Enable Guild Presences in the Discord Developer Portal; not every app publishes presence activity.',toggle('activityRoles.enabled','Enable activity auto-roles',settings.activityRoles?.enabled)+roleSelect('activityRoles.minecraftRoleId','Minecraft activity role',settings.activityRoles?.minecraftRoleId)+roleSelect('activityRoles.robloxRoleId','Roblox activity role',settings.activityRoles?.robloxRoleId)+roleSelect('activityRoles.vscodeRoleId','VS Code activity role',settings.activityRoles?.vscodeRoleId)+roleSelect('activityRoles.streamingRoleId','Streaming activity role',settings.activityRoles?.streamingRoleId)),
      card('📝 Logs & protection','حدد روم اللوجات وتنبيهات الحماية.',toggle('logs.enabled','Enable event logs',settings.logs?.enabled)+channelSelect('logs.channelId','Log channel',settings.logs?.channelId,textChannels)+toggle('antiRaid.enabled','Enable anti-raid alerts',settings.antiRaid?.enabled)+channelSelect('antiRaid.alertChannelId','Anti-raid alert channel',settings.antiRaid?.alertChannelId,textChannels)+toggle('automod.enabled','Enable basic anti-spam',settings.automod?.enabled)),
      card('🔊 Temporary voice rooms','اختر روم الدخول الذي ينشئ رومًا مؤقتًا، والتصنيف الذي توضع فيه الرومات.',toggle('tempVoice.enabled','Enable temporary voice rooms',settings.tempVoice?.enabled)+channelSelect('tempVoice.createChannelId','Join-to-create voice channel',settings.tempVoice?.createChannelId,voiceChannels)+categorySelect('tempVoice.categoryId','Temporary room category',settings.tempVoice?.categoryId)+toggle('tempVoice.createTextChannel','Create private text room too',settings.tempVoice?.createTextChannel)),
      card('💾 Backups & server tools','حمّل نسخة JSON من هيكل السيرفر. النسخة لا تحتوي الرسائل أو الأعضاء أو التوكنات أو بيانات الدخول.',`<p><a href="/servers/${esc(gid)}/backup">Download server template backup (.json)</a></p><p>للاستعادة استخدم <code>/server-restore</code> بصلاحية الإدارة. الاستعادة إضافية ولا تحذف الموجود.</p>`),
      card('⚖️ Moderation commands & language','حدد اللغة الافتراضية لكل ردود البوت في السيرفر، ويمكنك تخصيص لغة الإشراف بشكل منفصل عند الحاجة. اكتب كلمة واحدة لكل أمر، مثل #kick أو #طرد؛ اذكر العضو ثم السبب.',`<label>Default bot language for this server / اللغة الافتراضية للبوت في السيرفر</label><select name="server.language">${Object.entries(i18n.LANGUAGES).map(([code,language])=>`<option value="${esc(code)}" ${(settings.language||'en')===code?'selected':''}>${esc(language.name)}</option>`).join('')}</select><label>Response language / لغة الردود القديمة للإشراف</label><select name="moderation.language">${Object.entries(i18n.LANGUAGES).map(([code,language])=>`<option value="${esc(code)}" ${(settings.moderation?.language||'en')===code?'selected':''}>${esc(language.name)}</option>`).join('')}</select><label>Kick trigger / كلمة الطرد</label><input name="moderation.aliases.kick" maxlength="24" value="${esc(settings.moderation?.aliases?.kick||'#kick')}" required><label>Ban trigger / كلمة الحظر</label><input name="moderation.aliases.ban" maxlength="24" value="${esc(settings.moderation?.aliases?.ban||'#ban')}" required><label>Unban trigger / كلمة فك الحظر</label><input name="moderation.aliases.unban" maxlength="24" value="${esc(settings.moderation?.aliases?.unban||'#unban')}" required><p class="muted">Example: <code>#kick @member spam</code> · <code>#ban @member raid</code> · <code>#unban USER_ID reason</code>. Commands still require the matching Discord permissions and the bot's role hierarchy.</p>`),
      card('🎟️ Tickets, suggestions & community','حدد إعدادات التذاكر والاقتراحات والأنظمة المجتمعية.',toggle('starboard.enabled','Enable starboard',settings.starboard?.enabled)+channelSelect('starboard.channelId','Starboard channel',settings.starboard?.channelId,textChannels)+toggle('suggestions.enabled','Enable suggestions',settings.suggestions?.enabled)+channelSelect('suggestions.channelId','Suggestions channel',settings.suggestions?.channelId,textChannels)+roleSelect('tickets.supportRoleId','Ticket support role',settings.tickets?.supportRoleId)+categorySelect('tickets.categoryId','Ticket category',settings.tickets?.categoryId)+toggle('levels.enabled','Enable XP levels',settings.levels?.enabled))
    ].join('');
    const body = `<p><a href="/servers/${esc(gid)}/economy">Open economy dashboard & ledger</a></p><p class="muted">Each server has separate settings. Choose channels and roles from the lists; the bot needs suitable permissions and its highest role must be above any role it assigns.</p><form method="post" action="/servers/${esc(gid)}"><input type="hidden" name="_csrf" value="${esc(csrf)}">${panels}<button type="submit">Save all settings</button> <button type="submit" name="action" value="postVerification">Save & post verification panel</button></form><p><a href="/servers">Back to servers</a></p>`;
    res.send(page(`Control panels: ${guild.name}`, body, req.session.user, csrf, res.locals.cspNonce));
  });
  app.get('/servers/:id/economy', auth, async (req, res) => {
    const gid=req.params.id, guild=await allowedGuild(req,gid);
    if(!/^\d{17,20}$/.test(gid)||!guild)return res.status(403).send('Forbidden');
    const balances=db.prepare('SELECT user_id,balance,last_daily FROM economy WHERE guild_id=? ORDER BY balance DESC LIMIT 50').all(gid);
    const ledger=db.prepare('SELECT user_id,delta,kind,details,created_at FROM economy_ledger WHERE guild_id=? ORDER BY id DESC LIMIT 50').all(gid);
    const items=db.prepare('SELECT name,price,role_id,enabled FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC LIMIT 50').all(gid);
    const table=(headers,rows)=>`<div style="overflow:auto"><table style="width:100%;border-collapse:collapse"><thead><tr>${headers.map(h=>`<th style="text-align:left;padding:8px;border-bottom:1px solid #374151">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td style="padding:8px;border-bottom:1px solid #374151">${esc(cell)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}" class="muted">No data yet.</td></tr>`}</tbody></table></div>`;
    const body=`<p class="muted">Read-only economy overview for ${esc(guild.name)}. Create shop entries with <code>/community shop-item</code>; purchases are delivered by the bot and logged.</p><section class="card"><h2>🪙 Top balances</h2>${table(['User ID','Balance','Last daily'],balances.map(x=>[x.user_id,x.balance,x.last_daily?new Date(x.last_daily).toISOString():'Never']))}</section><section class="card"><h2>🛍️ Shop items</h2>${table(['Item','Price','Role ID','Enabled'],items.map(x=>[x.name,x.price,x.role_id,x.enabled?'Yes':'No']))}</section><section class="card"><h2>📒 Recent ledger (50)</h2>${table(['User ID','Delta','Type','Details','When'],ledger.map(x=>[x.user_id,`${x.delta>0?'+':''}${x.delta}`,x.kind,x.details,new Date(x.created_at).toISOString()]))}</section><p><a href="/servers/${esc(gid)}">Back to server settings</a> <a href="/servers">All servers</a></p>`;
    res.send(page(`Economy dashboard: ${guild.name}`,body,req.session.user,req.session.csrf||'',res.locals.cspNonce));
  });
  app.post('/servers/:id', auth, ensureCsrf, async (req, res) => {
    const gid = req.params.id, guildEntry = await allowedGuild(req, gid);
    if (!/^\d{17,20}$/.test(gid) || !guildEntry) return res.status(403).send('Forbidden');
    const guild = client.guilds.cache.get(gid);
    const previous = db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(gid);
    let saved = {}; try { saved = previous ? JSON.parse(previous.settings_json) : {}; } catch { return res.status(500).send('Stored settings are invalid.'); }
    const settings = mergeDeep(config, saved);
    const booleanFields = [['welcome','enabled'],['goodbye','enabled'],['logs','enabled'],['autorole','enabled'],['automod','enabled'],['antiRaid','enabled'],['starboard','enabled'],['suggestions','enabled'],['levels','enabled'],['tempVoice','enabled'],['tempVoice','createTextChannel'],['verification','enabled'],['accountAgeProtection','enabled'],['activityRoles','enabled']];
    for (const [section,key] of booleanFields) settings[section] = {...(settings[section]||{}),[key]:req.body[`${section}.${key}`]==='on'};
    const fields = [
      ['welcome','channelId','text'],['goodbye','channelId','text'],['logs','channelId','text'],['antiRaid','alertChannelId','text'],['accountAgeProtection','logChannelId','text'],
      ['activityRoles','minecraftRoleId','assignableRole'],['activityRoles','robloxRoleId','assignableRole'],['activityRoles','vscodeRoleId','assignableRole'],['activityRoles','streamingRoleId','assignableRole'],
      ['autorole','roleId','role'],['tickets','supportRoleId','role'],['tickets','categoryId','category'],['tempVoice','createChannelId','voice'],['tempVoice','categoryId','category'],
      ['starboard','channelId','text'],['suggestions','channelId','text'],['verification','channelId','text'],['verification','roleId','role']
    ];
    for (const [section,key,type] of fields) {
      const value = String(req.body[`${section}.${key}`] || '').trim();
      if (value && !/^\d{17,20}$/.test(value)) return res.status(400).send(`Invalid selection for ${esc(section)}.${esc(key)}.`);
      if (value && ['role','assignableRole'].includes(type)) { const role = client.guilds.cache.get(gid)?.roles.cache.get(value); if (!role || role.managed) return res.status(400).send(`Role ${esc(value)} is not assignable in this server.`); if ((type === 'assignableRole' || key === 'roleId') && guild.members.me && role.position >= guild.members.me.roles.highest.position) return res.status(400).send('The selected role must be below the bot highest role.'); }
      if (value && ['text','voice','category'].includes(type)) { const ch = client.guilds.cache.get(gid)?.channels.cache.get(value); if (!ch || ch.guildId !== gid) return res.status(400).send(`Channel ${esc(value)} is not in this server.`); if (type==='voice' && ch.type!==2) return res.status(400).send('Choose a voice channel for temporary-room creation.'); if (type==='category' && ch.type!==4) return res.status(400).send('Choose a category channel.'); if (type==='text' && ch.type!==0 && ch.type!==5) return res.status(400).send('Choose a text or announcement channel.'); }
      settings[section] = {...(settings[section]||{}),[key]:value};
    }
    const minAccountAge = Number(req.body['accountAgeProtection.minDays'] || settings.accountAgeProtection?.minDays || 7);
    if (!Number.isInteger(minAccountAge) || minAccountAge < 1 || minAccountAge > 365) return res.status(400).send('Minimum account age must be an integer from 1 to 365 days.');
    settings.accountAgeProtection = { ...(settings.accountAgeProtection || {}), minDays: minAccountAge };
    const serverLanguage=i18n.normalizeLanguage(req.body['server.language']||settings.language||'en');
    if(!serverLanguage) return res.status(400).send('Choose a supported default language for this server.');
    settings.language=serverLanguage;
    const modLanguage=i18n.normalizeLanguage(req.body['moderation.language']||settings.moderation?.language||'en');
    if(!modLanguage) return res.status(400).send('Choose a supported language for moderation responses.');
    const aliases={};
    for(const action of ['kick','ban','unban']){
      const value=String(req.body[`moderation.aliases.${action}`]||'').trim();
      if(!value||value.length>24||/[\s@<>`]/u.test(value)) return res.status(400).send(`The ${esc(action)} trigger must be 1–24 characters without spaces, mentions, or Discord markup.`);
      aliases[action]=value;
    }
    if(new Set(Object.values(aliases).map(x=>x.toLocaleLowerCase())).size!==3) return res.status(400).send('Each moderation trigger must be unique.');
    settings.moderation={...(settings.moderation||{}),language:modLanguage,aliases};
    db.prepare('INSERT INTO guild_settings(guild_id,settings_json) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json').run(gid, JSON.stringify(settings));
    if (req.body.action === 'postVerification') {
      if (!settings.verification?.enabled || !/^\d{17,20}$/.test(settings.verification?.channelId||'') || !/^\d{17,20}$/.test(settings.verification?.roleId||'')) return res.status(400).send('Enable verification and select both a verification channel and a verified role before posting the panel.');
      const channel = client.guilds.cache.get(gid)?.channels.cache.get(settings.verification.channelId);
      if (!channel?.isTextBased() || !channel.permissionsFor(client.guilds.cache.get(gid).members.me)?.has(['ViewChannel','SendMessages','EmbedLinks'])) return res.status(400).send('The bot needs View Channel, Send Messages, and Embed Links in the verification channel.');
      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      await channel.send({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle('Member verification').setDescription('Press the button below to verify your membership and receive the configured role.').setFooter({text:'Server verification'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('member_verify').setLabel('Verify me').setStyle(ButtonStyle.Success))]});
    }
    res.redirect(`/servers/${gid}`);
  });
  app.post('/logout', (req, res) => { const ok = req.session.user && safeEqual(req.body?._csrf, req.session.csrf); if (!ok) return res.status(403).send('Invalid security token.'); req.session.destroy(() => { res.clearCookie('imydaddy.sid'); res.redirect('/'); }); });
  app.use((err, req, res, next) => { console.error('Dashboard request error:', err.message); res.status(err.status || 400).send('Request could not be processed.'); });
  const server = app.listen(port, () => console.log(`Dashboard listening at ${baseUrl}`));
  return server;
}
module.exports = { startDashboard };
