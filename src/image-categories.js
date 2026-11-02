'use strict';

const INTENT_RE = /(?:\b(?:image|images|photo|photos|picture|pictures|gif|gifs|banner|wallpaper|girls?|boys?|women|men|anime|avatar)\b|صور|صورة|بنات|شباب|رجال|نساء|بانر|بنر|خلفية|خلفيات|متحرك(?:ة|ه)?|جيف)/i;

function inferKind(text, url) {
  const s = `${text} ${url}`.toLowerCase();
  // Keep English word boundaries separate from Arabic: JavaScript's \b is ASCII-oriented.
  if (/\b(?:gif|gifs)\b|متحرك(?:ة|ه)?|جيف/.test(s)) return 'gif';
  if (/\b(?:banner|header)\b|بانر|بنر/.test(s)) return 'banner';
  if (/\b(?:girl|girls|woman|women|female)\b|بنات|نساء|بنت/.test(s)) return 'girls';
  if (/\b(?:boy|boys|man|men|male)\b|شباب|رجال|ولد/.test(s)) return 'boys';
  return 'any';
}
function isImageIntent(text) { return INTENT_RE.test(String(text || '')); }

function isPinterestPinPage(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return /(^|\.)pinterest\.com$/i.test(url.hostname) && /^\/pin\/\d+(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}

function isPinterestSearchPage(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return /(^|\.)pinterest\.com$/i.test(url.hostname) && /^\/search\/pins\/?$/i.test(url.pathname);
  } catch { return false; }
}

function pinterestQueryMatchesCategory(sourceUrl, category) {
  if (!isPinterestSearchPage(sourceUrl)) return false;
  let query = '';
  try {
    const url = new URL(sourceUrl);
    query = `${url.searchParams.get('q') || ''} ${url.searchParams.get('query') || ''}`.toLowerCase();
  } catch { return false; }
  const patterns = {
    girls: /\b(girls?|women|woman|female|ladies)\b|بنات|نساء|بنت/,
    boys: /\b(boys?|men|man|male|guys)\b|شباب|رجال|ولد/,
    'girls-boys': /\b(girls?|women|woman|female|boys?|men|man|male|guys)\b|بنات|نساء|بنت|شباب|رجال|ولد/,
    couples: /\b(couple|couples|duo|romance|love)\b|كبلز|ثنائي|حب|عشاق/,
    banner: /\b(banner|header|cover)\b|بانر|بنر/,
    gif: /\b(gif|gifs|animated)\b|متحرك|جيف/,
    'gif-girls': /\b(gif|gifs|animated)\b.*\b(girls?|women|female)\b|\b(girls?|women|female)\b.*\b(gif|gifs|animated)\b|بنات.*(متحرك|جيف)|(متحرك|جيف).*بنات/,
    'gif-boys': /\b(gif|gifs|animated)\b.*\b(boys?|men|male)\b|\b(boys?|men|male)\b.*\b(gif|gifs|animated)\b|شباب.*(متحرك|جيف)|(متحرك|جيف).*شباب/,
    anime: /\b(anime|manga|waifu|husbando)\b|أنمي|انمي|مانجا/
  };
  return Boolean(patterns[category]?.test(query));
}

function categoryCandidates(sourceUrl, candidates, category, categoryMatches = () => true) {
  if (category === 'any') return candidates;
  // Pinterest CDN filenames are opaque. Trust a Pinterest search only when its
  // actual search query explicitly matches the requested feed category.
  if (isPinterestSearchPage(sourceUrl)) return pinterestQueryMatchesCategory(sourceUrl, category) ? candidates : [];
  // A single Pin is user-selected content; it can supply its own image but is not
  // a multi-image category search. Keep the prior explicit-category behavior.
  if (isPinterestPinPage(sourceUrl) && ['girls', 'boys', 'banner'].includes(category)) return candidates;
  return candidates.filter(url => categoryMatches(url, category));
}

module.exports = { isPinterestPinPage, isPinterestSearchPage, pinterestQueryMatchesCategory, categoryCandidates, inferKind, isImageIntent };
