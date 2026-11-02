#!/usr/bin/env node
'use strict';
// Run inside the same hosting container as IMYD: npm run diagnose:i18n
const dns = require('node:dns').promises;
const { performance } = require('node:perf_hooks');
const providers = [
  { name: 'MyMemory', host: 'api.mymemory.translated.net', url: 'https://api.mymemory.translated.net/get', kind: 'mymemory' },
  { name: 'Google Translate', host: 'translate.googleapis.com', url: 'https://translate.googleapis.com/translate_a/single', kind: 'google' }
];
async function checkDns(provider) {
  const start = performance.now();
  try {
    const records = await dns.lookup(provider.host, { all: true, verbatim: true });
    console.log(`[PASS] DNS ${provider.name} (${provider.host}): ${records.map(r => r.address).join(', ')} (${Math.round(performance.now()-start)} ms)`);
    return true;
  } catch (error) {
    console.error(`[FAIL] DNS ${provider.name} (${provider.host}): ${error.code || error.message}`);
    return false;
  }
}
async function checkTranslation(provider, source, target, sample) {
  const url = new URL(provider.url);
  if (provider.kind === 'mymemory') {
    url.searchParams.set('q', sample); url.searchParams.set('langpair', `${source}|${target}`);
  } else {
    url.searchParams.set('client', 'gtx'); url.searchParams.set('sl', source); url.searchParams.set('tl', target); url.searchParams.set('dt', 't'); url.searchParams.set('q', sample);
  }
  const start = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 IMYD-Discord-Bot/3.20.19 translation-diagnostic' } });
    const body = await response.json().catch(() => null);
    if (!response.ok) { console.error(`[FAIL] ${provider.name} ${source}->${target}: HTTP ${response.status}`); return false; }
    let translated = '';
    if (provider.kind === 'mymemory') {
      if (Number(body?.responseStatus) === 200) translated = String(body?.responseData?.translatedText || '');
    } else if (Array.isArray(body?.[0])) {
      translated = body[0].map(segment => Array.isArray(segment) ? segment[0] : '').filter(Boolean).join('');
    }
    if (!translated) { console.error(`[FAIL] ${provider.name} ${source}->${target}: response did not contain translated text`); return false; }
    console.log(`[PASS] ${provider.name} ${source}->${target} (${Math.round(performance.now()-start)} ms): ${JSON.stringify(translated)}`);
    return true;
  } catch (error) {
    console.error(`[FAIL] ${provider.name} ${source}->${target}: ${error.cause?.code || error.code || error.name}: ${error.message}`);
    return false;
  }
}
(async () => {
  console.log(`IMYD translation failover diagnostic | Node ${process.version}`);
  const dnsResults = await Promise.all(providers.map(checkDns));
  const tests = [];
  for (const provider of providers) {
    tests.push(await checkTranslation(provider, 'en', 'ar', 'Translation service test. Please select a language.'));
    tests.push(await checkTranslation(provider, 'ar', 'en', 'هذا اختبار لخدمة الترجمة. اختر اللغة المطلوبة.'));
  }
  const pass = tests.filter(Boolean).length;
  console.log(`\nRESULT: ${pass}/4 live translation checks passed; DNS passed for ${dnsResults.filter(Boolean).length}/${providers.length} providers.`);
  if (pass === 0) {
    console.error('Both providers failed from this runtime. Application code cannot repair an unavailable DNS resolver or blocked outbound network; hosting-level DNS/network access must be restored.');
    process.exitCode = 1;
  } else if (pass < 4) {
    console.warn('At least one translation route works. IMYD can fail over between providers; check the failed provider details above.');
  } else {
    console.log('Both providers and both language directions are reachable from this runtime.');
  }
})();
