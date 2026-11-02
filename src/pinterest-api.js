'use strict';

const API_BASE = 'https://api.pinterest.com/v5';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function getToken() {
  const token = String(process.env.PINTEREST_ACCESS_TOKEN || '').trim();
  return token || null;
}
function extractPinId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)pinterest\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/^\/pin\/(\d+)(?:\/|$)/i);
    return match ? match[1] : null;
  } catch { return null; }
}
function imageUrlsFromPin(pin) {
  const images = pin?.media?.images;
  if (!images || typeof images !== 'object') return [];
  const ranked = Object.values(images)
    .filter(item => item && typeof item.url === 'string' && /^https:\/\//i.test(item.url))
    .sort((a, b) => (Number(b.width) * Number(b.height)) - (Number(a.width) * Number(a.height)));
  return [...new Set(ranked.map(item => item.url))].slice(0, 8);
}
async function apiGet(path) {
  const token = getToken();
  if (!token) return null;
  let response;
  try {
    // Fixed Pinterest API origin, no redirects: never forward the bearer token to another host.
    response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
    });
  } catch (error) {
    throw new Error(`تعذر الاتصال بـ Pinterest API: ${String(error.message || 'network error').slice(0, 140)}`);
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error('Pinterest API response is too large.');
  if (response.status === 401) throw new Error('Pinterest API رفض التوكن (401). أنشئ Access Token جديدًا وتأكد من وضعه في PINTEREST_ACCESS_TOKEN داخل .env.');
  if (response.status === 403) throw new Error('Pinterest API رفض الوصول (403). غالبًا التطبيق لا يملك صلاحية pins:read أو أن Pinterest لم يعتمد الوصول لبيانات Pins. جرّب مصدرًا عامًا يسمح بالوصول أو اطلب صلاحية التطبيق.');
  if (response.status === 429) throw new Error('Pinterest API حدّد عدد الطلبات (429). انتظر قليلًا قبل إعادة المحاولة.');
  if (response.status >= 400) throw new Error(`Pinterest API أعاد HTTP ${response.status}.`);
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Pinterest API response is too large.');
  let data;
  try { data = JSON.parse(body); }
  catch { throw new Error('Pinterest API أعاد استجابة غير مفهومة.'); }
  return data;
}
function extractSearchQuery(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/(^|\.)pinterest\.com$/i.test(url.hostname) || !/^\/search\/pins\/?$/i.test(url.pathname)) return null;
    const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
    return query ? query.slice(0, 120) : null;
  } catch { return null; }
}
async function loadPinterestSource(rawUrl) {
  if (!getToken()) return null;
  const pinId = extractPinId(rawUrl);
  if (pinId) {
    const pin = await apiGet(`/pins/${encodeURIComponent(pinId)}`);
    const urls = imageUrlsFromPin(pin);
    if (!urls.length) throw new Error('Pinterest API وصل إلى الـPin لكنه لم يُرجع صورًا قابلة للتنزيل.');
    return { pin, candidates: urls, source: 'pinterest-api' };
  }
  const query = extractSearchQuery(rawUrl);
  if (query) {
    const result = await apiGet(`/search/pins?query=${encodeURIComponent(query)}&page_size=100`);
    const urls = [...new Set((Array.isArray(result?.items) ? result.items : []).flatMap(imageUrlsFromPin))].slice(0, 100);
    if (!urls.length) throw new Error('Pinterest API لم يُرجع Pins لبحث Pinterest هذا. تحقق من صلاحية pins:read أو جرّب بحثًا آخر.');
    return { candidates: urls, source: 'pinterest-api-search', query };
  }
  return null;
}
async function testConnection() {
  if (!getToken()) return { configured: false, ok: false, message: 'PINTEREST_ACCESS_TOKEN غير موجود في .env.' };
  try {
    // The endpoint is a low-volume read used only as a token/scope check.
    await apiGet('/pins?page_size=1');
    return { configured: true, ok: true, message: 'Pinterest API متصل والتوكن يملك صلاحية قراءة Pins.' };
  } catch (error) {
    return { configured: true, ok: false, message: String(error.message || 'Pinterest API check failed').slice(0, 240) };
  }
}
module.exports = { getToken, extractPinId, extractSearchQuery, imageUrlsFromPin, loadPinterestSource, testConnection };
