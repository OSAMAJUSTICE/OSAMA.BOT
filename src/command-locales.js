'use strict';

// Per-guild command-name translations. Only root command names are translated;
// option names and subcommand names remain stable so existing handlers and saved workflows keep working.
const ARABIC_COMMAND_NAMES = Object.freeze({
  language: 'لغتي',
  serverlanguage: 'لغة_السيرفر',
  serverlanguagereset: 'إعادة_لغة_السيرفر',
  translate: 'ترجمة',
  community: 'المجتمع',
  control: 'لوحة_التحكم',
  'publish-panel': 'نشر_لوحة',
  'panel-style': 'تصميم_اللوحة',
  'panel-image': 'صورة_اللوحة',
  help: 'مساعدة',
  banner: 'بانر',
  postimage: 'نشر_صورة',
  'badge-role-set': 'تعيين_رتبة_شارة',
  'badge-role-clear': 'مسح_ربط_شارة',
  'sync-badges': 'مزامنة_الشارات',
  roleinfo: 'معلومات_رتبة',
  channelinfo: 'معلومات_قناة',
  'role-add': 'إضافة_رتبة',
  'role-remove': 'إزالة_رتبة',
  'role-create': 'إنشاء_رتبة',
  'role-delete': 'حذف_رتبة',
  'channel-create': 'إنشاء_قناة',
  'channel-delete': 'حذف_قناة',
  'delete-all-channels': 'حذف_كل_القنوات',
  'delete-whitelist-add': 'إضافة_قائمة_السماح',
  'delete-whitelist-remove': 'إزالة_قائمة_السماح',
  'delete-whitelist-list': 'عرض_قائمة_السماح',
  'voice-disconnect': 'فصل_الصوت',
  'voice-mute': 'كتم_الصوت',
  'voice-deafen': 'صمم_الصوت',
  daily: 'يومي',
  balance: 'رصيدي',
  transfer: 'تحويل',
  coinflip: 'عملة',
  leaderboard: 'المتصدرون',
  avatar: 'الصورة_الشخصية',
  server_icon: 'أيقونة_السيرفر',
  serverinfo: 'معلومات_السيرفر',
  userinfo: 'معلومات_العضو',
  ping: 'سرعة_البوت',
  botinfo: 'معلومات_البوت',
  cat: 'قطة',
  dog: 'كلب',
  'ticket-panel': 'لوحة_التذاكر',
  unban: 'إلغاء_الحظر',
  slowmode: 'الوضع_البطيء',
  kick: 'طرد',
  ban: 'حظر',
  timeout: 'مهلة',
  warn: 'تحذير',
  warnings: 'التحذيرات',
  clear: 'مسح_الرسائل',
  lock: 'قفل_القناة',
  unlock: 'فتح_القناة',
  suggest: 'اقتراح',
  giveaway: 'سحب',
  level: 'المستوى',
  'server-backup': 'نسخ_احتياطي',
  'server-restore': 'استعادة_السيرفر',
  'server-clone': 'نسخ_السيرفر',
  log: 'اللوج',
  setlogchannel: 'قناة_اللوج',
  'audit-logs': 'سجل_التدقيق',
  'setup-status': 'حالة_الإعداد',
  botstatus: 'حالة_البوت',
  botdescription: 'وصف_البوت',
  botnickname: 'اسم_البوت',
  profilewidget: 'حالة_الملف_الشخصي',
  say: 'قل',
  'feed-add': 'إضافة_موجز',
  'feed-list': 'قائمة_الموجزات',
  'feed-post': 'نشر_الموجز',
  'feed-toggle': 'تفعيل_الموجز',
  'feed-remove': 'حذف_الموجز',
  'image-collect': 'جمع_صور_الموقع',
  'image-source': 'مصادر_الصور',
  'collect-images': 'جمع_الصور_الإضافي',
  'image-sources': 'مصادر_الصور_الإضافية',
  'image-catalog-add': 'كتالوج_صور_إضافة',
  'image-catalog-list': 'كتالوج_صور',
  'image-catalog-post': 'كتالوج_صور_نشر',
  'image-catalog-remove': 'كتالوج_صور_حذف',
  'voice-join': 'دخول_الصوت',
  'voice-play': 'تشغيل_الصوت',
  'voice-stop': 'إيقاف_الصوت',
  'voice-leave': 'خروج_الصوت',
  'voice-stay': 'تثبيت_الصوت',
  'voice-self-mute': 'كتم_الميكروفون',
  'voice-self-deafen': 'صمم_السماعة',
  'media-channel': 'قناة_الوسائط',
  games: 'ألعاب',
  'transfer-tax': 'ضريبة_التحويل',
  'transfer-tax-config': 'إعداد_ضريبة_التحويل'
});

const ENGLISH_BY_ARABIC = Object.freeze(Object.fromEntries(Object.entries(ARABIC_COMMAND_NAMES).map(([en, ar]) => [ar, en])));

function commandNameForLanguage(name, language) {
  // Keep the two requested image commands discoverable by their documented names in every server language.
  if (name === 'image-source' || name === 'image-collect') return name;
  return language === 'ar' ? (ARABIC_COMMAND_NAMES[name] || name) : name;
}
const COMMAND_ALIASES = Object.freeze({
  'image-sources': 'image-source',
  'collect-images': 'image-collect',
  'مصادر_الصور_الإضافية': 'image-source',
  'جمع_الصور_الإضافي': 'image-collect'
});

function canonicalCommandName(name) {
  return COMMAND_ALIASES[name] || ENGLISH_BY_ARABIC[name] || name;
}
function localizeCommandNames(payload, language) {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  if (typeof copy.name === 'string') copy.name = commandNameForLanguage(copy.name, language);
  // Root command names are translated; keep option/subcommand identifiers unchanged.
  return copy;
}

module.exports = { ARABIC_COMMAND_NAMES, ENGLISH_BY_ARABIC, commandNameForLanguage, canonicalCommandName, localizeCommandNames };
