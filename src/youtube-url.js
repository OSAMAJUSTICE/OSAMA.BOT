'use strict';

function validYouTubeUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return false;
    if (host === 'youtu.be') return /^\/[A-Za-z0-9_-]{6,}(?:\/)?$/.test(url.pathname);
    if (url.pathname === '/watch') return /^[A-Za-z0-9_-]{6,}$/.test(url.searchParams.get('v') || '');
    return /^\/(?:shorts|live|embed)\/[A-Za-z0-9_-]{6,}\/?$/.test(url.pathname);
  } catch { return false; }
}

module.exports = { validYouTubeUrl };
