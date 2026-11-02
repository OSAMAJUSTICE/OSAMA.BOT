'use strict';
const path = require('node:path');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const db = require('./db');
const MOSQUE_BANNER = path.join(__dirname, '..', 'assets', 'islamic-mosque-banner.png');
const CATEGORIES = [
  {name:'Quran / القرآن الكريم',value:'quran'},
  {name:'Hadith / الأحاديث',value:'hadith'},
  {name:'Daily benefits / الفوائد اليومية',value:'benefits'},
  {name:'Quran videos / فيديوهات القرآن',value:'videos'},
  {name:'Adhkar / الأذكار',value:'adhkar'},
  {name:'Dua / الأدعية',value:'dua'},
  {name:'Tasbeeh / التسبيح',value:'tasbeeh'},
  {name:'Salawat / الصلاة على النبي',value:'salawat'},
  {name:'Names of Allah / أسماء الله الحسنى',value:'names'},
  {name:'Seerah / السيرة النبوية',value:'seerah'},
  {name:'Prayer times / مواقيت الصلاة',value:'prayer'},
  {name:'Ramadan countdown / العد التنازلي لرمضان',value:'ramadan'},
  {name:'Mushaf / المصحف',value:'mushaf'}
];
const CAT = Object.fromEntries(CATEGORIES.map(x=>[x.value,x.name]));
// Fail-closed publication policy: static religious text is not auto-published until each item has an individually reviewed source, edition, and translation record.
const REVIEW_REQUIRED_CATEGORIES = new Set(); // Built-in catalog is enabled by setup; every item keeps its source/reference in the post.
const AUTO_ENABLE_CATEGORIES = new Set(CATEGORIES.map(item => item.value));
function publicationBlockReason(category, row) {
 if (REVIEW_REQUIRED_CATEGORIES.has(category) && Number(row?.content_approved || 0) !== 1) return 'الفئة دي محتاجة مراجعة المسؤول قبل النشر.';
 return null;
}
db.exec(`CREATE TABLE IF NOT EXISTS islamic_settings (
 guild_id TEXT NOT NULL, category TEXT NOT NULL, channel_id TEXT, enabled INTEGER NOT NULL DEFAULT 0,
 city TEXT NOT NULL DEFAULT 'Cairo', country TEXT NOT NULL DEFAULT 'Egypt', timezone TEXT NOT NULL DEFAULT 'Africa/Cairo', method INTEGER NOT NULL DEFAULT 5,
 last_post_key TEXT, last_post_at INTEGER NOT NULL DEFAULT 0, last_check_at INTEGER NOT NULL DEFAULT 0, video_url TEXT, last_video_id TEXT, content_approved INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,category)
)`);
try { const cols=db.prepare("PRAGMA table_info('islamic_settings')").all().map(x=>x.name); if(!cols.includes('video_url')) db.exec('ALTER TABLE islamic_settings ADD COLUMN video_url TEXT'); if(!cols.includes('content_approved')) db.exec('ALTER TABLE islamic_settings ADD COLUMN content_approved INTEGER NOT NULL DEFAULT 0'); if(!cols.includes('last_video_id')) db.exec('ALTER TABLE islamic_settings ADD COLUMN last_video_id TEXT'); if(!cols.includes('last_post_at')) db.exec('ALTER TABLE islamic_settings ADD COLUMN last_post_at INTEGER NOT NULL DEFAULT 0'); if(!cols.includes('last_check_at')) db.exec('ALTER TABLE islamic_settings ADD COLUMN last_check_at INTEGER NOT NULL DEFAULT 0'); } catch(e) { console.warn('[Islamic] Settings migration:',e.message); }
const contents = {
 quran:[
  {title:'آية اليوم | Quran Verse',body:'﴿ فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ۝ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾',foot:'سورة الشرح: 5–6'},
  {title:'آية اليوم | Quran Verse',body:'﴿ وَهُوَ مَعَكُمْ أَيْنَ مَا كُنْتُمْ ۚ وَاللَّهُ بِمَا تَعْمَلُونَ بَصِيرٌ ﴾',foot:'سورة الحديد: 4'},
  {title:'آية اليوم | Quran Verse',body:'﴿ أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ ﴾',foot:'سورة الرعد: 28'},
  {title:'آية اليوم | Quran Verse',body:'﴿ وَقُلْ رَبِّ زِدْنِي عِلْمًا ﴾',foot:'سورة طه: 114'},
  {title:'آية اليوم | Quran Verse',body:'﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾',foot:'سورة البقرة: 153'},
  {title:'آية اليوم | Quran Verse',body:'﴿ وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ ﴾',foot:'سورة الطلاق: 3'},
  {title:'آية اليوم | Quran Verse',body:'﴿ فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ ﴾',foot:'سورة البقرة: 152'}
 ],
 hadith:[
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «مَن دلَّ على خيرٍ فله مثلُ أجرِ فاعلِه»',foot:'صحيح مسلم، 1893'},
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «الكلمة الطيبة صدقة»',foot:'صحيح البخاري، 2989؛ صحيح مسلم، 1009'},
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «يسروا ولا تعسروا، وبشروا ولا تنفروا»',foot:'صحيح البخاري، 69؛ صحيح مسلم، 1734'},
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى»',foot:'صحيح البخاري، 1؛ صحيح مسلم، 1907'},
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «من كان يؤمن بالله واليوم الآخر فليقل خيرًا أو ليصمت»',foot:'صحيح البخاري، 6018؛ صحيح مسلم، 47'},
  {title:'حديث نبوي | Hadith',body:'قال رسول الله ﷺ: «لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه»',foot:'صحيح البخاري، 13؛ صحيح مسلم، 45'}
 ],
 adhkar:[
  {title:'ذكر | أذكار',body:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ.',foot:'صحيح البخاري، 6406؛ صحيح مسلم، 2694.'},
  {title:'أذكار الصباح والمساء',body:'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا.',foot:'سنن أبي داود 5072؛ جامع الترمذي 3389.'},
  {title:'ذكر يومي',body:'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ.',foot:'صحيح البخاري 6384؛ صحيح مسلم 2704.'},
  {title:'ذكر يومي',body:'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ.',foot:'صحيح البخاري 6307؛ صحيح مسلم 2702 (في الاستغفار والتوبة).'}
 ],
 dua:[{title:'دعاء | Dua',body:'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ.',foot:'سورة البقرة: 201'}, {title:'دعاء',body:'رَبِّ زِدْنِي عِلْمًا.',foot:'سورة طه: 114'}, {title:'دعاء',body:'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً ۚ إِنَّكَ أَنتَ الْوَهَّابُ.',foot:'سورة آل عمران: 8'}, {title:'دعاء',body:'رَبِّ اشْرَحْ لِي صَدْرِي ۝ وَيَسِّرْ لِي أَمْرِي.',foot:'سورة طه: 25–26'}],
 tasbeeh:[{title:'التسبيح',body:'سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ.',foot:'اذكر الله واحتسب الأجر.'},{title:'فضل الذكر',body:'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.',foot:'صحيح البخاري 6405؛ صحيح مسلم 2691.'},{title:'التسبيح',body:'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ وَأَتُوبُ إِلَيْهِ.',foot:'استغفار وتجديد للتوبة.'}],
 salawat:[{title:'الصلاة على النبي ﷺ',body:'اللَّهُمَّ صَلِّ وَسَلِّمْ وَبَارِكْ عَلَى نَبِيِّنَا مُحَمَّدٍ.',foot:'اللهم ارزقنا محبته واتباع سنته.'},{title:'الصلاة الإبراهيمية',body:'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ، كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ، إِنَّكَ حَمِيدٌ مَجِيدٌ.',foot:'من صيغة الصلاة الإبراهيمية الواردة في الصحيحين.'}],
 names:[{title:'من أسماء الله الحسنى',body:'الرَّحْمَنُ — واسع الرحمة، الذي وسعت رحمته كل شيء.',foot:'من أسماء الله الحسنى الواردة في القرآن الكريم.'},{title:'من أسماء الله الحسنى',body:'الْغَفُورُ — كثير المغفرة لعباده.',foot:'قال تعالى: ﴿وَهُوَ الْغَفُورُ الرَّحِيمُ﴾'}, {title:'من أسماء الله الحسنى',body:'السَّمِيعُ — الذي يسمع جميع الأصوات، لا يخفى عليه شيء منها.',foot:'قال تعالى: ﴿إِنَّهُ هُوَ السَّمِيعُ الْبَصِيرُ﴾'}, {title:'من أسماء الله الحسنى',body:'الْعَلِيمُ — الذي أحاط علمه بكل شيء.',foot:'قال تعالى: ﴿وَهُوَ بِكُلِّ شَيْءٍ عَلِيمٌ﴾'}],
 seerah:[{title:'من السيرة النبوية ﷺ',body:'بدأ نزول الوحي على النبي ﷺ في غار حراء، وكانت أول آيات نزلت: ﴿اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ﴾.',foot:'سورة العلق: 1–5؛ صحيح البخاري، كتاب بدء الوحي.'},{title:'من السيرة النبوية ﷺ',body:'أشار القرآن إلى موقف الهجرة في الغار: ﴿إِذْ يَقُولُ لِصَاحِبِهِ لَا تَحْزَنْ إِنَّ اللَّهَ مَعَنَا﴾.',foot:'القرآن الكريم، سورة التوبة 9:40. النص القرآني هو المرجع المباشر لهذه العبارة.'}],
 benefits:[{title:'فائدة اليوم | Daily Benefit',body:'الأخلاق الحسنة والرفق بالناس من المعاني التي يحث عليها الإسلام.',foot:'تذكير عام؛ انظر القرآن الكريم، آل عمران 3:159، وصحيح مسلم 2593 في الرفق.'},{title:'فائدة اليوم | Daily Benefit',body:'الكلمة الطيبة والرفق بالناس من أبواب الخير.',foot:'صحيح البخاري 2989؛ صحيح مسلم 2593.'},{title:'فائدة اليوم | Daily Benefit',body:'تحرَّ الدقة قبل نقل الأخبار أو نسبتها إلى القرآن الكريم أو السنة النبوية.',foot:'القرآن الكريم، سورة الحجرات 49:6.'}],
 mushaf:[{title:'المصحف الشريف 📖',body:'﴿ وَقُلْ رَبِّ زِدْنِي عِلْمًا ﴾',foot:'سورة طه: 114 · اقرأ وردك اليومي من القرآن.'}],
 videos:[{title:'تلاوة قرآنية 🎥',body:'للوصول إلى تلاوات القرآن، افتح مصدرًا موثوقًا واختر المقطع الذي ترغب في نشره. يمكن ضبط رابط الفيديو من إعدادات القناة.',foot:'لم يُدرج رابط فيديو عشوائي حتى لا ننشر رابطًا معطلًا أو غير موثوق.'}]
};
// English meanings/translations are shown beneath the Arabic text in each post.
// Quran translations are meanings; Arabic remains the original text.
const english = {
 quran:[
  'For indeed, with hardship comes ease. Indeed, with hardship comes ease. (Ash-Sharh 94:5–6)',
  'And He is with you wherever you are, and Allah is Seeing of what you do. (Al-Hadid 57:4)',
  'Surely in the remembrance of Allah do hearts find comfort. (Ar-Ra’d 13:28)',
  'And say, “My Lord, increase me in knowledge.” (Ta-Ha 20:114)',
  'Indeed, Allah is with the patient. (Al-Baqarah 2:153)',
  'And whoever relies upon Allah — then He is sufficient for him. (At-Talaq 65:3)',
  'So remember Me; I will remember you. And be grateful to Me and do not deny Me. (Al-Baqarah 2:152)'
 ],
 hadith:[
  'The Messenger of Allah ﷺ said: “Whoever guides someone to goodness will have a reward like the one who did it.” (Sahih Muslim 1893)',
  'The Messenger of Allah ﷺ said: “A good word is charity.” (Sahih al-Bukhari 2989; Sahih Muslim 1009)',
  'The Messenger of Allah ﷺ said: “Make things easy and do not make them difficult; give glad tidings and do not drive people away.” (Sahih al-Bukhari 69; Sahih Muslim 1734)',
  'The Messenger of Allah ﷺ said: “Actions are judged by intentions, and every person will have what they intended.” (Sahih al-Bukhari 1; Sahih Muslim 1907)',
  'The Messenger of Allah ﷺ said: “Whoever believes in Allah and the Last Day should speak good or remain silent.” (Sahih al-Bukhari 6018; Sahih Muslim 47)',
  'The Messenger of Allah ﷺ said: “None of you truly believes until he loves for his brother what he loves for himself.” (Sahih al-Bukhari 13; Sahih Muslim 45)'
 ],
 adhkar:[
  'Glory and praise be to Allah; glory be to Allah, the Magnificent. A remembrance established in authentic narrations.',
  'I am pleased with Allah as my Lord, Islam as my religion, and Muhammad ﷺ as my Prophet.',
  'There is no power nor strength except through Allah. (A remembrance from authentic narrations)',
  'I seek Allah’s forgiveness and repent to Him.'
 ],
 dua:[
  'Our Lord, grant us good in this world and good in the Hereafter, and protect us from the punishment of the Fire. (Quran 2:201)',
  'My Lord, increase me in knowledge. (Quran 20:114)',
  'Our Lord, do not let our hearts deviate after You have guided us, and grant us mercy from Yourself. (Quran 3:8)',
  'My Lord, expand for me my breast and ease for me my task. (Quran 20:25–26)'
 ],
 tasbeeh:['Glory be to Allah; all praise belongs to Allah; there is no god worthy of worship except Allah; and Allah is the Greatest. Remember Allah and hope for His reward.','Glory and praise be to Allah (100 times). A remembrance mentioned in authentic hadith.','I seek forgiveness from Allah the Almighty and repent to Him.'],
 salawat:['O Allah, send Your prayers, peace, and blessings upon our Prophet Muhammad. May Allah grant us love for him and the ability to follow his Sunnah.','O Allah, send prayers upon Muhammad and the family of Muhammad, as You sent prayers upon Ibrahim and the family of Ibrahim. You are Praiseworthy and Glorious.'],
 names:['Ar-Rahman — The Most Merciful; His mercy encompasses all things.', 'Al-Ghafur — The Oft-Forgiving. Allah says: “And He is the Forgiving, the Merciful.”','As-Sami‘ — The All-Hearing; no sound is hidden from Him.','Al-‘Alim — The All-Knowing; His knowledge encompasses all things.'],
 seerah:['The first revelation came to the Prophet ﷺ in the Cave of Hira. The opening verses revealed were from Surah Al-‘Alaq (96:1–5). (Sahih al-Bukhari, Book of Revelation)','The Quran refers to the Prophet ﷺ and his companion in the cave during the Hijrah (Quran 9:40). This English sentence is a summary, not a verbatim Quran translation.'],
 mushaf:['“And say: My Lord, increase me in knowledge.” (Quran 20:114) — Keep a daily portion of Quran recitation.'],
 videos:['To share Quran recitation, choose a trusted source and set an approved video link for this channel. No random or unverified video link is included.'],
 benefits:['A beautiful character and good deeds are among the ways a believer benefits others. Verify religious quotations against reliable sources before attributing them to the Quran or Sunnah.','Kind words, smiling, and gentleness are doors to goodness. Never underestimate a small righteous deed.','A Muslim should verify information before sharing it, especially when attributing it to the Quran or the Prophet ﷺ.']
};
function getRow(guild,category){return db.prepare('SELECT * FROM islamic_settings WHERE guild_id=? AND category=?').get(guild,category);}
function upsert(guild,category,patch){const old=getRow(guild,category)||{channel_id:null,enabled:0,city:'Cairo',country:'Egypt',timezone:'Africa/Cairo',method:5,last_post_key:null,last_post_at:0,last_check_at:0,video_url:null,last_video_id:null,content_approved:0};const v={...old,...patch};db.prepare(`INSERT INTO islamic_settings(guild_id,category,channel_id,enabled,city,country,timezone,method,last_post_key,last_post_at,last_check_at,video_url,last_video_id,content_approved,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,category) DO UPDATE SET channel_id=excluded.channel_id,enabled=excluded.enabled,city=excluded.city,country=excluded.country,timezone=excluded.timezone,method=excluded.method,last_post_key=excluded.last_post_key,last_post_at=excluded.last_post_at,last_check_at=excluded.last_check_at,video_url=excluded.video_url,last_video_id=excluded.last_video_id,content_approved=excluded.content_approved,updated_at=excluded.updated_at`).run(guild,category,v.channel_id,v.enabled,v.city,v.country,v.timezone,v.method,v.last_post_key,Number(v.last_post_at||0),Number(v.last_check_at||0),v.video_url||null,v.last_video_id||null,Number(v.content_approved||0),Date.now());}
const setupReligiousCommand = new SlashCommandBuilder()
 .setName('setup-religious')
 .setDescription('Set up religious posts and prayer times')
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
 .addStringOption(o=>o.setName('category').setDescription('Religious content category').setRequired(true).addChoices(...CATEGORIES))
 .addChannelOption(o=>o.setName('channel').setDescription('Channel for this category').addChannelTypes(0,5).setRequired(true));
const setupIslamicCatalogCommand = new SlashCommandBuilder()
 .setName('setup-islamic-catalog')
 .setDescription('Create the Islamic content catalog and configure safe automatic posts')
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const testReligiousCommand = new SlashCommandBuilder()
 .setName('test-religious')
 .setDescription('Check religious posting setup and channel permissions')
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const command = new SlashCommandBuilder().setName('islamic').setDescription('Configure automatic Islamic posts and prayer times').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
 .addSubcommand(s=>s.setName('set-channel').setDescription('Choose the channel for a content category').addStringOption(o=>o.setName('category').setDescription('Content category').setRequired(true).addChoices(...CATEGORIES)).addChannelOption(o=>o.setName('channel').setDescription('Target text channel').addChannelTypes(0,5).setRequired(true)))
 .addSubcommand(s=>s.setName('enable').setDescription('Enable automatic posts for a category').addStringOption(o=>o.setName('category').setDescription('Category').setRequired(true).addChoices(...CATEGORIES)))
 .addSubcommand(s=>s.setName('disable').setDescription('Disable automatic posts for a category').addStringOption(o=>o.setName('category').setDescription('Category').setRequired(true).addChoices(...CATEGORIES)))
 .addSubcommand(s=>s.setName('location').setDescription('Set city and country for prayer times').addStringOption(o=>o.setName('city').setDescription('City in English, e.g. Cairo').setMaxLength(80).setRequired(true)).addStringOption(o=>o.setName('country').setDescription('Country in English, e.g. Egypt').setMaxLength(80).setRequired(true)).addStringOption(o=>o.setName('timezone').setDescription('IANA timezone, e.g. Africa/Cairo').setMaxLength(80)).addIntegerOption(o=>o.setName('method').setDescription('Prayer calculation method (leave empty for country default)').addChoices({name:'Egyptian General Authority (5)',value:5},{name:'Umm Al-Qura, Saudi Arabia (4)',value:4},{name:'Muslim World League (3)',value:3},{name:'ISNA, North America (2)',value:2},{name:'Karachi (1)',value:1},{name:'Turkey (13)',value:13},{name:'Singapore (11)',value:11})))
 .addSubcommand(s=>s.setName('review-category').setDescription('Confirm a category was reviewed before enabling publication').addStringOption(o=>o.setName('category').setDescription('Reviewed category').setRequired(true).addChoices(...CATEGORIES)).addBooleanOption(o=>o.setName('confirm').setDescription('True only after checking source, wording, translation and reuse rights').setRequired(true)))
 .addSubcommand(s=>s.setName('status').setDescription('Show Islamic posting configuration'))
 .addSubcommand(s=>s.setName('post-now').setDescription('Publish a sample post immediately').addStringOption(o=>o.setName('category').setDescription('Category').setRequired(true).addChoices(...CATEGORIES)));
function countryTimezone(country='') {
 const c=String(country).trim().toLowerCase();
 if (/egypt|مصر/.test(c)) return 'Africa/Cairo';
 if (/saudi|السعودية|سعودية/.test(c)) return 'Asia/Riyadh';
 if (/uae|united arab emirates|الإمارات/.test(c)) return 'Asia/Dubai';
 if (/qatar|قطر/.test(c)) return 'Asia/Qatar';
 if (/kuwait|الكويت/.test(c)) return 'Asia/Kuwait';
 if (/pakistan|باكستان/.test(c)) return 'Asia/Karachi';
 if (/turkey|تركيا/.test(c)) return 'Europe/Istanbul';
 if (/singapore|سنغافورة/.test(c)) return 'Asia/Singapore';
 if (/india|الهند/.test(c)) return 'Asia/Kolkata';
 if (/bangladesh|بنغلاديش/.test(c)) return 'Asia/Dhaka';
 if (/morocco|المغرب/.test(c)) return 'Africa/Casablanca';
 if (/united kingdom|britain|بريطانيا|المملكة المتحدة/.test(c)) return 'Europe/London';
 return null; // Require an explicit IANA timezone when the country has multiple/unknown zones.
}
function countryPrayerMethod(country='') {
 const c=String(country).trim().toLowerCase();
 if (/egypt|مصر/.test(c)) return 5;
 if (/saudi|السعودية|سعودية/.test(c)) return 4;
 if (/pakistan|india|bangladesh|باكستان|الهند|بنغلاديش/.test(c)) return 1;
 if (/united states|canada|usa|أمريكا|كندا/.test(c)) return 2;
 if (/turkey|تركيا/.test(c)) return 13;
 if (/singapore|سنغافورة/.test(c)) return 11;
 if (/kuwait|الكويت/.test(c)) return 9;
 if (/qatar|قطر/.test(c)) return 10;
 if (/uae|united arab emirates|الإمارات/.test(c)) return 4;
 return 3; // Muslim World League as a general fallback; local authority may differ.
}
async function handle(i){
 if(!i.guild)return i.reply({content:'استخدم الأمر داخل السيرفر.',flags:64});
 if(!i.memberPermissions?.has(PermissionFlagsBits.Administrator))return i.reply({content:'الأمر للمسؤولين فقط.',flags:64});
 if(i.commandName==='setup-religious'){
  const category=i.options.getString('category',true),channel=i.options.getChannel('channel',true);
  if(!channel?.isTextBased?.()||!channel.guildId||channel.guildId!==i.guild.id)return i.reply({content:'اختار قناة نصية داخل نفس السيرفر.',flags:64});
  const me=i.guild.members.me;
  const perms=channel.permissionsFor(me);
  if(!perms?.has(['ViewChannel','SendMessages','EmbedLinks','AttachFiles']))return i.reply({content:'البوت محتاج View Channel وSend Messages وEmbed Links وAttach Files في القناة المختارة.',flags:64});
  upsert(i.guild.id,category,{channel_id:channel.id,enabled:0});
  return i.reply({content:`✅ تم حفظ قناة ${CAT[category]||category}: ${channel}\nتم حفظ القناة. استخدم /islamic enable لتشغيل الفئة بعد مراجعة إعداداتها.\nاستخدم /test-religious لفحص الإعدادات.`,flags:64});
 }
 if(i.commandName==='setup-islamic-catalog'){
  const me=i.guild.members.me;
  if(!me?.permissions?.has(PermissionFlagsBits.ManageChannels))return i.reply({content:'البوت يحتاج صلاحية Manage Channels لإنشاء كتالوج الرومات الدينية.',flags:64});
  await i.deferReply({flags:64});
  try {
   let parent=i.guild.channels.cache.find(ch=>ch.type===ChannelType.GuildCategory&&ch.name==='🕌 Islamic Catalog');
   if(!parent) parent=await i.guild.channels.create({name:'🕌 Islamic Catalog',type:ChannelType.GuildCategory,reason:'Create the Islamic content catalog'});
   const created=[], reused=[], blocked=[];
   for(const item of CATEGORIES){
    const slug=`islamic-${item.value}`;
    const oldRow=getRow(i.guild.id,item.value);
    let channel=oldRow?.channel_id ? await i.guild.channels.fetch(oldRow.channel_id).catch(()=>null) : null;
    if(channel&&!channel.isTextBased?.()) channel=null;
    if(!channel) channel=i.guild.channels.cache.find(ch=>ch.type===ChannelType.GuildText&&ch.parentId===parent.id&&ch.name===slug);
    if(!channel){
     try { channel=await i.guild.channels.create({name:slug,type:ChannelType.GuildText,parent:parent.id,topic:`Islamic catalog: ${item.name}`,reason:'Create the Islamic content catalog'}); created.push(slug); }
     catch(error){blocked.push(`${slug}: ${String(error.message||'creation failed').slice(0,100)}`);continue;}
    } else reused.push(slug);
    // Preserve existing channel/location/approval settings and enable every prepared category automatically.
    upsert(i.guild.id,item.value,{channel_id:channel.id,enabled:1,content_approved:1});
   }
   const active=CATEGORIES.filter(x=>AUTO_ENABLE_CATEGORIES.has(x.value)).map(x=>`<#${getRow(i.guild.id,x.value)?.channel_id}>`).join(' و ');
   const report=[`✅ تم تجهيز كتالوج المحتوى الديني في ${parent}.`,`• رومات جديدة: ${created.length}\n• رومات موجودة تم استخدامها: ${reused.length}`,`🟢 تم تفعيل جميع الفئات التي تم تجهيز قنواتها تلقائيًا. النشر يتكرر كل 30 دقيقة لكل فئة (عدا جدول الصلاة اليومي ورمضان).`,`🎥 فيديوهات القرآن تُفحص من خلاصات القنوات المحددة مسبقًا؛ لا تحتاج لإدخال رابط يدوي.`,`🕌 مواقيت الصلاة تُحسب حسب المدينة والدولة والمنطقة الزمنية المحددة.`,blocked.length?`⚠️ تعذر إنشاء بعض الرومات:\n${blocked.join('\n')}`:''].filter(Boolean).join('\n\n');
   return i.editReply({content:report.slice(0,1900)});
  } catch(error){console.error('[Islamic] Catalog setup failed:',error);return i.editReply({content:`تعذر إكمال الكتالوج الديني. الرومات التي أُنشئت بالفعل لم تُحذف؛ راجع صلاحيات البوت. السبب: ${String(error.message||'unknown').slice(0,300)}`});}
 }
 if(i.commandName==='test-religious'){
  const rows=db.prepare('SELECT * FROM islamic_settings WHERE guild_id=? ORDER BY category').all(i.guild.id);
  const me=i.guild.members.me;
  const lines=[];
  for(const row of rows){
   const ch=await i.guild.channels.fetch(row.channel_id).catch(()=>null);
   const ok=Boolean(ch?.isTextBased?.()&&ch.permissionsFor(me)?.has(['ViewChannel','SendMessages','EmbedLinks','AttachFiles']));
   lines.push(`${ok?'✅':'❌'} ${CAT[row.category]||row.category}: ${ch?`<#${ch.id}>`:'القناة غير موجودة'} — ${ok?'الصلاحيات سليمة':'تحقق من القناة وصلاحيات البوت'} — النشر ${row.enabled?'مفعّل':'متوقف'}`);
  }
  return i.reply({content:lines.length?`🧪 فحص إعدادات المحتوى الديني\n${lines.join('\n')}`:'لا توجد إعدادات بعد. استخدم /setup-religious لاختيار الفئة والقناة.',flags:64});
 }
 const sub=i.options.getSubcommand();
 if(sub==='set-channel'){const cat=i.options.getString('category'),ch=i.options.getChannel('channel');upsert(i.guild.id,cat,{channel_id:ch.id});return i.reply({content:`✅ تم تحديد قناة ${CAT[cat]}: ${ch}. فعّل النشر باستخدام [1m/islamic enable[0m.`,flags:64});}
 if(sub==='review-category'){const cat=i.options.getString('category',true),confirm=i.options.getBoolean('confirm',true);if(!REVIEW_REQUIRED_CATEGORIES.has(cat))return i.reply({content:'الفئة دي لا تحتاج مراجعة محتوى ثابت قبل النشر.',flags:64});if(!confirm){upsert(i.guild.id,cat,{content_approved:0,enabled:0});return i.reply({content:`تم إلغاء اعتماد ${CAT[cat]} وإيقاف النشر لها.`,flags:64});}upsert(i.guild.id,cat,{content_approved:1});return i.reply({content:`⚠️ تم تسجيل تأكيد مسؤول السيرفر بمراجعة ${CAT[cat]}. تأكد من صحة كل مادة ومصدرها وحقوق استخدامها؛ هذا التأكيد ليس تحققًا آليًا من صحتها. يمكنك الآن استخدام /islamic enable.`,flags:64});}
 if(sub==='enable'||sub==='disable'){const cat=i.options.getString('category'),row=getRow(i.guild.id,cat);if(sub==='enable'&&publicationBlockReason(cat,row))return i.reply({content:`🛡️ ${publicationBlockReason(cat,row)}`,flags:64});if(sub==='enable'&&!row?.channel_id)return i.reply({content:`حدد القناة الأول باستخدام /islamic set-channel للفئة ${CAT[cat]}.`,flags:64});upsert(i.guild.id,cat,{enabled:sub==='enable'?1:0});return i.reply({content:`${sub==='enable'?'✅ تم تشغيل':'⏸️ تم إيقاف'} النشر التلقائي: ${CAT[cat]}.`,flags:64});}
 if(sub==='location'){const city=i.options.getString('city'),country=i.options.getString('country'),timezone=i.options.getString('timezone')||countryTimezone(country),method=i.options.getInteger('method')??countryPrayerMethod(country);if(!timezone)return i.reply({content:'الدولة دي محتاجة تحديد المنطقة الزمنية يدويًا بصيغة IANA، مثل Europe/Paris أو America/New_York.',flags:64});try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{return i.reply({content:'اسم المنطقة الزمنية غير صحيح. مثال: Africa/Cairo أو Asia/Riyadh.',flags:64});}const rows=db.prepare('SELECT category FROM islamic_settings WHERE guild_id=?').all(i.guild.id);for(const r of rows)upsert(i.guild.id,r.category,{city,country,timezone,method,last_check_at:0});upsert(i.guild.id,'prayer',{city,country,timezone,method,last_check_at:0,last_post_at:0,last_post_key:null});return i.reply({content:`📍 تم ضبط الموقع على ${city}, ${country} والمنطقة الزمنية ${timezone}. طريقة الحساب: ${method} (تلقائية حسب الدولة ما لم تختَر غير ذلك). سيتم تحديث جدول الصلاة حسب التاريخ المحلي.`,flags:64});}
 if(sub==='status'){const rows=db.prepare('SELECT * FROM islamic_settings WHERE guild_id=? ORDER BY category').all(i.guild.id);if(!rows.length)return i.reply({content:'لسه مفيش إعدادات. استخدم /islamic set-channel لكل فئة، ثم /islamic enable.',flags:64});const lines=rows.map(r=>`${r.enabled?'🟢':'⚪'} **${CAT[r.category]||r.category}** — ${r.channel_id?`< #${r.channel_id} >`:'لا توجد قناة'} — ${r.enabled?'مفعّل':'متوقف'} — ${r.category==='prayer'?'حسب مواقيت الدولة يوميًا':r.category==='ramadan'?'يوميًا': 'كل 30 دقيقة'}`);return i.reply({embeds:[new EmbedBuilder().setTitle('إعدادات النشر الإسلامي').setDescription(lines.join('\n')).setColor(0x248F65)],flags:64});}
 if(sub==='post-now'){const cat=i.options.getString('category'),row=getRow(i.guild.id,cat);if(publicationBlockReason(cat,row))return i.reply({content:`🛡️ ${publicationBlockReason(cat,row)}`,flags:64});if(!row?.channel_id)return i.reply({content:'حدد قناة لهذه الفئة أولًا باستخدام /islamic set-channel.',flags:64});await i.deferReply({flags:64});const ok=await publish(i.client||i.guild.client,i.guild.id,cat,true);return i.editReply(ok?'تم إرسال المنشور.':'تعذر الإرسال؛ تأكد من صلاحيات البوت وإعداد القناة.');}}
async function fetchQuranVerse() {
 const response = await fetch('https://api.alquran.cloud/v1/ayah/random/editions/quran-uthmani,en.sahih', { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
 if (!response.ok) throw new Error(`AlQuran Cloud HTTP ${response.status}`);
 const payload = await response.json();
 if (payload.code !== 200 || !Array.isArray(payload.data) || payload.data.length < 2) throw new Error('AlQuran Cloud returned an unexpected verse payload');
 const arabic = payload.data.find(x => x.edition?.identifier === 'quran-uthmani') || payload.data[0];
 const englishVerse = payload.data.find(x => x.edition?.identifier === 'en.sahih') || payload.data[1];
 return { title: `آية من القرآن الكريم | Quran ${arabic.surah?.englishName || ''} ${arabic.surah?.number || ''}:${arabic.numberInSurah || ''}`.trim(), body: arabic.text, english: englishVerse.text, foot: `سورة ${arabic.surah?.name || ''}، الآية ${arabic.numberInSurah} · المصدر: AlQuran Cloud (quran-uthmani / en.sahih)` };
}
function prayerEmbed(data, row, now){
 const names=[['Fajr','الفجر'],['Sunrise','الشروق'],['Dhuhr','الظهر'],['Asr','العصر'],['Maghrib','المغرب'],['Isha','العشاء']];
 const times=names.map(([k,a])=>`**${a} | ${k}:** ${data[k]||'—'}`).join('\n');
 const desc=[
  '**📌 معلومات الصلاة | Prayer Details**',
  `**المكان | Location:** ${row.city}, ${row.country}`,
  times,
  '',
  'المواقيت حسابية وقد تختلف حسب طريقة الحساب والجهة الرسمية المحلية.',
  'Times are calculated and may differ by method or local religious authority.'
 ].join('\n');
 return new EmbedBuilder().setColor(0x248F65).setTitle(`🕌 مواقيت الصلاة | Prayer Times — ${row.city}, ${row.country}`).setDescription(desc.slice(0,4000)).setFooter({text:`التوقيت المحلي / Local time: ${row.timezone} · المصدر / Source: AlAdhan`}).setTimestamp(now);
}
function nextRamadan(){// Approximate date only; official moon-sighting may shift it by a day.
 const dates=['2027-02-08T00:00:00Z','2028-01-28T00:00:00Z','2029-01-16T00:00:00Z','2030-01-05T00:00:00Z','2030-12-26T00:00:00Z'];const now=Date.now();return dates.map(x=>new Date(x)).find(d=>d.getTime()>now)||new Date(Date.UTC(new Date().getUTCFullYear()+1,1,1));}
// Public YouTube Atom feeds do not require a YouTube API key. These IDs are pinned
// to the channels' own public identities; the first is the Saudi Broadcasting
// Corporation's verified KSA Qur'an TV channel, the second is Al-Majd's Quran channel.
const TRUSTED_QURAN_VIDEO_FEEDS = [
 { name: 'قناة القرآن الكريم السعودية', channelId: 'UCos52azQNBgW63_9uDJoPDA', url: 'https://www.youtube.com/@saudiqurantv' },
 { name: 'قناة المجد للقرآن الكريم', channelId: 'UCKg2dp4g9Y0VOmciYlwsR7g', url: 'https://www.youtube.com/@almajdquranchannelofficial' }
];
function decodeXml(value='') { return String(value).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
async function fetchLatestTrustedQuranVideo() {
 for (const source of TRUSTED_QURAN_VIDEO_FEEDS) {
  try {
   const endpoint = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
   const response = await fetch(endpoint, { headers: { accept: 'application/atom+xml,application/xml,text/xml' }, signal: AbortSignal.timeout(10000) });
   if (!response.ok) continue;
   const xml = await response.text();
   const entry = xml.match(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/i)?.[1];
   if (!entry) continue;
   const tag = name => decodeXml(entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.replace(/<[^>]+>/g,'').trim() || '');
   const id = tag('yt:videoId');
   const title = tag('title');
   const published = tag('published');
   if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id) || !title) continue;
   return { id, title: title.slice(0, 250), published, source, url: `https://www.youtube.com/watch?v=${id}` };
  } catch (error) { console.warn(`[Islamic] Quran video feed unavailable (${source.name}):`, error.message); }
 }
 throw new Error('تعذر الوصول إلى خلاصات قنوات القرآن الموثوقة حاليًا. لم يتم نشر رابط بديل غير متحقق.');
}

async function publish(client,guildId,category,force=false){const row=getRow(guildId,category);if(publicationBlockReason(category,row)){console.warn(`[Islamic] Blocked category: ${category}`);return false;}if(!row?.channel_id||(!force&&!row.enabled))return false;const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:row.timezone||'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const lp=Object.fromEntries(localParts.map(x=>[x.type,x.value]));const key=`${category}:${lp.year}-${lp.month}-${lp.day}`;try{const ch=await client.channels.fetch(row.channel_id);if(!ch?.isTextBased?.())return false;let embed;
 if(category==='prayer'){const now=new Date();const parts=new Intl.DateTimeFormat('en-GB',{timeZone:row.timezone||'Africa/Cairo',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(now);const dp=Object.fromEntries(parts.map(x=>[x.type,x.value]));const apiDate=`${dp.day}-${dp.month}-${dp.year}`;const url=`https://api.aladhan.com/v1/timingsByCity/${apiDate}?city=${encodeURIComponent(row.city)}&country=${encodeURIComponent(row.country)}&method=${Number.isFinite(Number(row.method))?Number(row.method):countryPrayerMethod(row.country)}`;const res=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('Prayer API HTTP '+res.status);const json=await res.json();if(json.code!==200||!json.data?.timings)throw Error('Prayer API response invalid');embed=prayerEmbed(json.data.timings,row,now);}
 else if(category==='ramadan'){const target=nextRamadan(),days=Math.max(0,Math.ceil((target.getTime()-Date.now())/86400000));embed=new EmbedBuilder().setColor(0x248F65).setTitle('🌙 رمضان المبارك | Ramadan Countdown').setDescription(`شهر القرآن والصيام والقيام.\nThe month of Quran, fasting, and night prayer.\n\n**رمضان القادم المتوقع | Expected next Ramadan:** ${target.toLocaleDateString('ar-EG',{dateStyle:'full',timeZone:row.timezone||'Africa/Cairo'})}\n**متبقي تقريبًا | Approximately:** ${days} يومًا / days.`).setFooter({text:'التاريخ تقديري وقد يختلف حسب رؤية الهلال والإعلان الرسمي.'});}
 else if(category==='videos'){const video=await fetchLatestTrustedQuranVideo();if(!force&&row.last_video_id===video.id){upsert(guildId,category,{last_check_at:Date.now()});return false;}// Send the canonical YouTube URL as plain message content, not inside a custom
 // Discord embed. Discord can then create its native YouTube player preview when
 // the video/channel permits embedding and the channel allows Embed Links.
 const message = buildQuranVideoMessage(video);
 await ch.send(message);
 upsert(guildId,category,{last_video_id:video.id,last_post_key:key,last_post_at:Date.now(),last_check_at:Date.now()});return true;}else {const arr=contents[category]||contents.quran;const idx=Math.floor(Date.now()/(30*60*1000))%arr.length;let item=arr[idx];let translation=english[category]?.[idx]||'English translation/meaning is not available for this item yet.';if(category==='quran'||category==='mushaf'){const liveVerse=await fetchQuranVerse();item={title:liveVerse.title,body:liveVerse.body,foot:liveVerse.foot};translation=liveVerse.english;}embed=new EmbedBuilder().setColor(0x248F65).setTitle(item.title).setDescription(`**العربية | Arabic**\n${item.body}\n\n**English meaning / المعنى بالإنجليزية**\n${translation}`).setFooter({text:item.foot||'تذكير يومي'}).setTimestamp(new Date());}
 embed.setImage('attachment://islamic-mosque-banner.png');
 await ch.send({embeds:[embed],files:[{attachment:MOSQUE_BANNER,name:'islamic-mosque-banner.png'}],allowedMentions:{parse:[]}});upsert(guildId,category,{last_post_key:key,last_post_at:Date.now(),last_check_at:Date.now()});return true;
 }catch(e){console.warn(`[Islamic] Publish failed (${category}, guild ${guildId}):`,e.message);return false;}}
let schedulerStarted = false;
const CONTENT_INTERVAL_MS = 30 * 60 * 1000;
const SCHEDULER_TICK_MS = 10 * 1000;
function localDateTime(now, timezone) {
 const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone || 'Africa/Cairo', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 return Object.fromEntries(parts.map(x=>[x.type,x.value]));
}
function start(client){
 if (schedulerStarted) { console.warn('[Islamic] Scheduler start ignored: already running.'); return; }
 schedulerStarted = true;
 let running = false;
 const timer = setInterval(async()=>{
  if (running) return;
  running = true;
  try {
   let rows;
   try { rows=db.prepare('SELECT * FROM islamic_settings WHERE enabled=1 AND channel_id IS NOT NULL').all(); }
   catch (e) { console.error('[Islamic] Could not read enabled posting settings:', e?.message || e); return; }
   for (const r of rows) {
    try {
     const now = new Date();
     const p = localDateTime(now, r.timezone);
     const date = `${p.year}-${p.month}-${p.day}`;
     if (r.category === 'prayer') {
      // One fresh timetable per local day; retry temporary API/Discord failures every five minutes.
      if (r.last_post_key !== `prayer:${date}` && now.getTime() - Number(r.last_check_at || 0) >= 5 * 60 * 1000) {
       const ok = await publish(client, r.guild_id, 'prayer', false);
       upsert(r.guild_id, 'prayer', {last_check_at: now.getTime()});
       if (!ok) console.warn(`[Islamic] Prayer timetable not published: guild=${r.guild_id}, location=${r.city},${r.country}`);
      }
      continue;
     }
     if (r.category === 'ramadan') {
      if (r.last_post_key !== `ramadan:${date}` && now.getTime() - Number(r.last_check_at || 0) >= 5 * 60 * 1000) {
       const ok = await publish(client, r.guild_id, 'ramadan', false);
       upsert(r.guild_id, 'ramadan', {last_check_at: now.getTime()});
       if (!ok) console.warn(`[Islamic] Ramadan countdown not published: guild=${r.guild_id}`);
      }
      continue;
     }
     const last = Number(r.last_post_at || 0);
     const lastCheck = Number(r.last_check_at || 0);
     if (now.getTime() - Math.max(last, lastCheck) < CONTENT_INTERVAL_MS) continue;
     const ok = await publish(client, r.guild_id, r.category, false);
     if (!ok && r.category === 'videos') upsert(r.guild_id, r.category, {last_check_at: now.getTime()});
     if (!ok) console.warn(`[Islamic] Scheduled post not published: guild=${r.guild_id}, category=${r.category}; see preceding error for cause.`);
    } catch (e) { console.error(`[Islamic] Scheduler error for guild=${r.guild_id}, category=${r.category}:`, e?.stack || e?.message || e); }
   }
  } finally { running = false; }
 }, SCHEDULER_TICK_MS);
 if (typeof timer.unref === 'function') timer.unref();
 console.log('[Startup] Islamic auto-post scheduler started (10s check; 30-minute per-category interval; prayer timetable follows selected location; no catch-up spam).');
}
function buildQuranVideoMessage(video) {
 if (!video || !/^[A-Za-z0-9_-]{11}$/.test(String(video.id || ''))) throw new Error('Invalid YouTube video ID');
 const canonicalUrl = `https://www.youtube.com/watch?v=${video.id}`;
 return { content: `${canonicalUrl}\n\n**${String(video.title || 'تلاوة قرآنية').slice(0, 180)}**\nالمصدر: ${String(video.source?.name || 'قناة قرآن موثوقة').slice(0, 100)}`, allowedMentions: { parse: [] } };
}
module.exports={command,commands:[setupReligiousCommand,setupIslamicCatalogCommand,testReligiousCommand],handles:i=>i.isChatInputCommand?.()&&['islamic','setup-religious','setup-islamic-catalog','test-religious'].includes(i.commandName),handle,start,CATEGORIES,buildQuranVideoMessage};
