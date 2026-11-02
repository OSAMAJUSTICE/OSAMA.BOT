// IMYD (! 卍I'M Your Daddy卍) localization and on-demand translation.
// Runtime fallback translations use MyMemory; successful results are cached without storing source text in SQLite.
'use strict';
const db = require('./db');
const crypto = require('node:crypto');
const LANGUAGES = {
  ar:{name:'العربية',code:'ar'}, en:{name:'English',code:'en'}, es:{name:'Español',code:'es'}, fr:{name:'Français',code:'fr'}, de:{name:'Deutsch',code:'de'},
  tr:{name:'Türkçe',code:'tr'}, pt:{name:'Português',code:'pt'}, it:{name:'Italiano',code:'it'}, ru:{name:'Русский',code:'ru'}, zh:{name:'中文（简体）',code:'zh-CN'},
  ja:{name:'日本語',code:'ja'}, ko:{name:'한국어',code:'ko'}, nl:{name:'Nederlands',code:'nl'}, pl:{name:'Polski',code:'pl'}, uk:{name:'Українська',code:'uk'},
  hi:{name:'हिन्दी',code:'hi'}, id:{name:'Bahasa Indonesia',code:'id'}, vi:{name:'Tiếng Việt',code:'vi'}, th:{name:'ไทย',code:'th'}, fa:{name:'فارسی',code:'fa'},
  ur:{name:'اردو',code:'ur'}, el:{name:'Ελληνικά',code:'el'}, sv:{name:'Svenska',code:'sv'}, da:{name:'Dansk',code:'da'}, no:{name:'Norsk',code:'no'},
  af:{name:'Afrikaans',code:'af'}, sq:{name:'Shqip',code:'sq'}, am:{name:'አማርኛ',code:'am'}, hy:{name:'Հայերեն',code:'hy'}, az:{name:'Azərbaycanca',code:'az'},
  eu:{name:'Euskara',code:'eu'}, be:{name:'Беларуская',code:'be'}, bn:{name:'বাংলা',code:'bn'}, bs:{name:'Bosanski',code:'bs'}, bg:{name:'Български',code:'bg'},
  ca:{name:'Català',code:'ca'}, ceb:{name:'Cebuano',code:'ceb'}, co:{name:'Corsu',code:'co'}, hr:{name:'Hrvatski',code:'hr'}, cs:{name:'Čeština',code:'cs'},
  et:{name:'Eesti',code:'et'}, fi:{name:'Suomi',code:'fi'}, fy:{name:'Frysk',code:'fy'}, gl:{name:'Galego',code:'gl'}, ka:{name:'ქართული',code:'ka'},
  gu:{name:'ગુજરાતી',code:'gu'}, ht:{name:'Kreyòl ayisyen',code:'ht'}, ha:{name:'Hausa',code:'ha'}, haw:{name:'ʻŌlelo Hawaiʻi',code:'haw'}, he:{name:'עברית',code:'he'},
  hmn:{name:'Hmong',code:'hmn'}, hu:{name:'Magyar',code:'hu'}, is:{name:'Íslenska',code:'is'}, ig:{name:'Igbo',code:'ig'}, ga:{name:'Gaeilge',code:'ga'},
  jv:{name:'Basa Jawa',code:'jv'}, kn:{name:'ಕನ್ನಡ',code:'kn'}, kk:{name:'Қазақша',code:'kk'}, km:{name:'ខ្មែរ',code:'km'}, rw:{name:'Kinyarwanda',code:'rw'},
  ku:{name:'Kurdî',code:'ku'}, ky:{name:'Кыргызча',code:'ky'}, lo:{name:'ລາວ',code:'lo'}, la:{name:'Latina',code:'la'}, lv:{name:'Latviešu',code:'lv'},
  lt:{name:'Lietuvių',code:'lt'}, lb:{name:'Lëtzebuergesch',code:'lb'}, mk:{name:'Македонски',code:'mk'}, mg:{name:'Malagasy',code:'mg'}, ms:{name:'Bahasa Melayu',code:'ms'},
  ml:{name:'മലയാളം',code:'ml'}, mt:{name:'Malti',code:'mt'}, mi:{name:'Te Reo Māori',code:'mi'}, mr:{name:'मराठी',code:'mr'}, mn:{name:'Монгол',code:'mn'},
  my:{name:'မြန်မာ',code:'my'}, ne:{name:'नेपाली',code:'ne'}, ny:{name:'Chichewa',code:'ny'}, ps:{name:'پښتو',code:'ps'}, pa:{name:'ਪੰਜਾਬੀ',code:'pa'},
  ro:{name:'Română',code:'ro'}, sm:{name:'Gagana Samoa',code:'sm'}, gd:{name:'Gàidhlig',code:'gd'}, sr:{name:'Српски',code:'sr'}, st:{name:'Sesotho',code:'st'},
  sn:{name:'chiShona',code:'sn'}, sd:{name:'سنڌي',code:'sd'}, si:{name:'සිංහල',code:'si'}, sk:{name:'Slovenčina',code:'sk'}, sl:{name:'Slovenščina',code:'sl'},
  so:{name:'Soomaali',code:'so'}, su:{name:'Basa Sunda',code:'su'}, sw:{name:'Kiswahili',code:'sw'}, tg:{name:'Тоҷикӣ',code:'tg'}, ta:{name:'தமிழ்',code:'ta'},
  te:{name:'తెలుగు',code:'te'}, uz:{name:'Oʻzbekcha',code:'uz'}, cy:{name:'Cymraeg',code:'cy'}, xh:{name:'isiXhosa',code:'xh'}, yi:{name:'ייִדיש',code:'yi'},
  yo:{name:'Yorùbá',code:'yo'}, zu:{name:'isiZulu',code:'zu'}, fil:{name:'Filipino',code:'tl'}, eo:{name:'Esperanto',code:'eo'}
};
const CHOICES = Object.entries(LANGUAGES).map(([value,x])=>({name:x.name,value}));
function languageAutocomplete(query=''){
  const q=String(query||'').trim().toLocaleLowerCase();
  const matches = Object.entries(LANGUAGES).filter(([code, item])=>!q || code.toLocaleLowerCase().includes(q) || item.name.toLocaleLowerCase().includes(q) || item.code.toLocaleLowerCase().includes(q)).map(([value,item])=>({name:`${item.name} (${value})`.slice(0,100),value}));
  return matches.slice(0,25);
}
function normalizeLanguage(value){
  if(!value) return null;
  const v=String(value).toLowerCase().replace('_','-');
  if(LANGUAGES[v]) return v;
  const found=Object.entries(LANGUAGES).find(([,x])=>x.code.toLowerCase()===v || x.code.toLowerCase().startsWith(v+'-'));
  if (found) return found[0];
  // Only offer configured languages. An ISO-looking code does not prove that the
  // translation provider supports it; accepting arbitrary codes caused silent failures.
  return null;
}
function getUserLanguage(userId){
  const row=db.prepare('SELECT language FROM user_languages WHERE user_id=?').get(String(userId));
  return normalizeLanguage(row?.language) || null;
}
function setUserLanguage(userId, language){
  const lang=normalizeLanguage(language); if(!lang) throw new Error('Unsupported language');
  db.prepare('INSERT INTO user_languages(user_id,language,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,updated_at=excluded.updated_at')
    .run(String(userId),lang,Date.now());
  return lang;
}
function getServerLanguage(guildId){
  if(!guildId) return null;
  const row=db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(String(guildId));
  try { return normalizeLanguage(row ? JSON.parse(row.settings_json).language : null); } catch { return null; }
}
function setServerLanguage(guildId, language){
  const lang=normalizeLanguage(language); if(!lang) throw new Error('Unsupported language');
  const row=db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(String(guildId));
  let settings={}; try { settings=row?JSON.parse(row.settings_json):{}; } catch { settings={}; }
  settings.language=lang;
  db.prepare('INSERT INTO guild_settings(guild_id,settings_json) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json')
    .run(String(guildId),JSON.stringify(settings));
  return lang;
}
function clearServerLanguage(guildId){
  if(!guildId) throw new Error('A server is required');
  const id=String(guildId);
  const row=db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(id);
  if(!row) return false;
  let settings={};
  try { settings=JSON.parse(row.settings_json)||{}; } catch { settings={}; }
  const existed=Object.prototype.hasOwnProperty.call(settings,'language');
  delete settings.language;
  if(Object.keys(settings).length===0){
    db.prepare('DELETE FROM guild_settings WHERE guild_id=?').run(id);
  }else{
    db.prepare('UPDATE guild_settings SET settings_json=? WHERE guild_id=?').run(JSON.stringify(settings),id);
  }
  return existed;
}
function languageFor(interaction){
  // A configured server language is authoritative for every command in that server.
  // Personal language is used in DMs, or when a guild has not configured a default.
  const serverLanguage = getServerLanguage(interaction.guildId);
  if (serverLanguage) return serverLanguage;
  return getUserLanguage(interaction.user.id) || normalizeLanguage(interaction.locale) || 'en';
}
function languageName(code){ const normalized=normalizeLanguage(code); return LANGUAGES[normalized||'en']?.name || normalized || 'English'; }
let runtimeProviderCooldownUntil = 0;
const RUNTIME_PROVIDER_COOLDOWN_MS = 60_000;
async function translateText(text, source, target, timeoutMs=12000){
  if (Date.now() < runtimeProviderCooldownUntil) throw new Error('Translation providers are temporarily cooling down after rate limiting.');
  const src=normalizeLanguage(source||'en'), dst=normalizeLanguage(target);
  if(!src||!dst) throw new Error('Choose a supported source and target language.');
  const input=String(text||'').trim();
  if(!input) throw new Error('Text cannot be empty.');
  if(input.length>4500) throw new Error('Text is too long. Please keep it under 4,500 characters.');
  if(src===dst) return input;
  // MyMemory documents q as a maximum of 500 UTF-8 bytes, not 500 characters.
  // This matters for Arabic and other multibyte scripts. Keep a safety margin.
  const chunks=[]; let current='';
  const maxQueryBytes=440;
  const pushPiece=(piece)=>{
    const words=String(piece).split(/(\s+)/u);
    for(const word of words){
      if(!word) continue;
      const candidate=current+word;
      if(Buffer.byteLength(candidate,'utf8')<=maxQueryBytes){current=candidate;continue;}
      if(current.trim()) chunks.push(current.trim());
      current='';
      if(Buffer.byteLength(word,'utf8')<=maxQueryBytes){current=word;continue;}
      // A single unusually long token must be split on Unicode code points,
      // never in the middle of a UTF-8 character.
      for(const char of word){
        if(Buffer.byteLength(current+char,'utf8')>maxQueryBytes){if(current)chunks.push(current);current='';}
        current+=char;
      }
    }
  };
  for(const piece of input.split(/(?<=[.!?。！？])\s+|\n+/u)) pushPiece(piece+' ');
  if(current.trim()) chunks.push(current.trim());
  const out=[];
  const sourceCode=LANGUAGES[src]?.code||src;
  const targetCode=LANGUAGES[dst]?.code||dst;
  const timeout=Math.max(2500, Number(timeoutMs)||8000);
  async function viaMyMemory(chunk){
    const url=new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q',chunk); url.searchParams.set('langpair',`${sourceCode}|${targetCode}`);
    const response=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'IMYD-Discord-Bot/3.20.19'}});
    if(!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);
    const data=await response.json();
    if(Number(data.responseStatus)!==200 || !data.responseData?.translatedText) throw new Error(`MyMemory API status ${data.responseStatus||'unknown'}`);
    return String(data.responseData.translatedText);
  }
  async function viaGoogle(chunk){
    const url=new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client','gtx'); url.searchParams.set('sl',sourceCode); url.searchParams.set('tl',targetCode); url.searchParams.set('dt','t'); url.searchParams.set('q',chunk);
    const response=await fetch(url,{signal:AbortSignal.timeout(timeout),headers:{'User-Agent':'Mozilla/5.0 IMYD-Discord-Bot/3.20.19'}});
    if(!response.ok) throw new Error(`Google Translate HTTP ${response.status}`);
    const data=await response.json();
    const translated=Array.isArray(data?.[0]) ? data[0].map(segment=>Array.isArray(segment)?segment[0]:'').filter(Boolean).join('') : '';
    if(!translated) throw new Error('Google Translate returned no translated text');
    return translated;
  }
  for(const chunk of chunks){
    let translated=null; const errors=[];
    // Provider failover prevents a single provider outage/quota/DNS issue from
    // breaking localization when the other provider is reachable.
    for(const provider of [viaMyMemory, viaGoogle]){
      try { translated=await provider(chunk); break; }
      catch(error) {
        const reason=error?.message||String(error);
        errors.push(reason);
        if(/HTTP 429|rate.?limit|too many requests/i.test(reason)) runtimeProviderCooldownUntil=Date.now()+RUNTIME_PROVIDER_COOLDOWN_MS;
      }
    }
    if(translated===null) throw new Error(`All translation providers failed: ${errors.join(' | ')}`);
    out.push(String(translated).replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
  }
  return out.join(' ');
}
const MESSAGES={
  en:{languageSet:'Your language is now **{language}**.',serverLanguageSet:'The server default language is now **{language}**.',serverAdmin:'You need Administrator or Manage Server permission to change the server language.',translationTitle:'Translation',translationFooter:'Translated from {source} to {target}. Automated translation may contain errors.',translationFailed:'Translation failed: {error}',languageHelp:'Choose the language you want the bot to use for your personal replies.',serverLanguageHelp:'Choose the default language for this server. Members can override it with /language.'},
  ar:{languageSet:'تم ضبط لغتك إلى **{language}**.',serverLanguageSet:'تم ضبط اللغة الافتراضية للسيرفر إلى **{language}**.',serverAdmin:'تحتاج إلى صلاحية Administrator أو Manage Server لتغيير لغة السيرفر.',translationTitle:'الترجمة',translationFooter:'تمت الترجمة من {source} إلى {target}. قد تحتوي الترجمة الآلية على أخطاء.',translationFailed:'فشلت الترجمة: {error}',languageHelp:'اختر اللغة التي تريد أن يستخدمها البوت في ردوده الشخصية.',serverLanguageHelp:'اختر اللغة الافتراضية للسيرفر. يمكن لكل عضو تغييرها باستخدام /language.'},
  es:{languageSet:'Tu idioma ahora es **{language}**.',serverLanguageSet:'El idioma predeterminado del servidor ahora es **{language}**.',serverAdmin:'Necesitas permisos de Administrador o Gestionar servidor para cambiar el idioma.',translationTitle:'Traducción',translationFooter:'Traducido de {source} a {target}. La traducción automática puede contener errores.',translationFailed:'Error de traducción: {error}',languageHelp:'Elige el idioma de las respuestas personales del bot.',serverLanguageHelp:'Elige el idioma predeterminado del servidor. Los miembros pueden cambiarlo con /language.'},
  fr:{languageSet:'Votre langue est maintenant **{language}**.',serverLanguageSet:'La langue par défaut du serveur est maintenant **{language}**.',serverAdmin:'Vous devez être administrateur ou gérer le serveur pour changer sa langue.',translationTitle:'Traduction',translationFooter:'Traduit de {source} vers {target}. La traduction automatique peut contenir des erreurs.',translationFailed:'Échec de la traduction : {error}',languageHelp:'Choisissez la langue des réponses personnelles du bot.',serverLanguageHelp:'Choisissez la langue par défaut du serveur. Les membres peuvent la remplacer avec /language.'},
  de:{languageSet:'Deine Sprache ist jetzt **{language}**.',serverLanguageSet:'Die Standardsprache des Servers ist jetzt **{language}**.',serverAdmin:'Du benötigst Administrator- oder Server-verwalten-Berechtigung, um die Serversprache zu ändern.',translationTitle:'Übersetzung',translationFooter:'Übersetzt von {source} nach {target}. Automatische Übersetzungen können Fehler enthalten.',translationFailed:'Übersetzung fehlgeschlagen: {error}',languageHelp:'Wähle die Sprache für persönliche Bot-Antworten.',serverLanguageHelp:'Wähle die Standardsprache des Servers. Mitglieder können sie mit /language überschreiben.'},
  tr:{languageSet:'Bot dilin artık **{language}**.',serverLanguageSet:'Sunucunun varsayılan dili artık **{language}**.',serverAdmin:'Sunucu dilini değiştirmek için Yönetici veya Sunucuyu Yönet izni gerekir.',translationTitle:'Çeviri',translationFooter:'{source} dilinden {target} diline çevrildi. Otomatik çeviriler hata içerebilir.',translationFailed:'Çeviri başarısız: {error}',languageHelp:'Kişisel bot yanıtların için bir dil seç.',serverLanguageHelp:'Sunucunun varsayılan dilini seç. Üyeler /language ile değiştirebilir.'},
  pt:{languageSet:'Seu idioma agora é **{language}**.',serverLanguageSet:'O idioma padrão do servidor agora é **{language}**.',serverAdmin:'Você precisa de permissão de Administrador ou Gerenciar servidor para alterar o idioma.',translationTitle:'Tradução',translationFooter:'Traduzido de {source} para {target}. A tradução automática pode conter erros.',translationFailed:'Falha na tradução: {error}',languageHelp:'Escolha o idioma das respostas pessoais do bot.',serverLanguageHelp:'Escolha o idioma padrão do servidor. Os membros podem substituí-lo com /language.'},
  it:{languageSet:'La tua lingua è ora **{language}**.',serverLanguageSet:'La lingua predefinita del server è ora **{language}**.',serverAdmin:'Servono i permessi Amministratore o Gestisci server per cambiare la lingua.',translationTitle:'Traduzione',translationFooter:'Tradotto da {source} a {target}. La traduzione automatica può contenere errori.',translationFailed:'Traduzione non riuscita: {error}',languageHelp:'Scegli la lingua delle risposte personali del bot.',serverLanguageHelp:'Scegli la lingua predefinita del server. I membri possono cambiarla con /language.'},
  ru:{languageSet:'Ваш язык теперь **{language}**.',serverLanguageSet:'Язык сервера по умолчанию теперь **{language}**.',serverAdmin:'Для смены языка сервера нужны права администратора или управления сервером.',translationTitle:'Перевод',translationFooter:'Переведено с {source} на {target}. Автоматический перевод может содержать ошибки.',translationFailed:'Ошибка перевода: {error}',languageHelp:'Выберите язык личных ответов бота.',serverLanguageHelp:'Выберите язык сервера по умолчанию. Участники могут изменить его командой /language.'},
  zh:{languageSet:'你的语言已设置为 **{language}**。',serverLanguageSet:'服务器默认语言已设置为 **{language}**。',serverAdmin:'你需要管理员或管理服务器权限才能更改服务器语言。',translationTitle:'翻译',translationFooter:'已从 {source} 翻译为 {target}。自动翻译可能存在错误。',translationFailed:'翻译失败：{error}',languageHelp:'选择机器人个人回复使用的语言。',serverLanguageHelp:'选择服务器默认语言。成员可使用 /language 覆盖此设置。'},
  ja:{languageSet:'言語を **{language}** に設定しました。',serverLanguageSet:'サーバーの既定言語を **{language}** に設定しました。',serverAdmin:'サーバーの言語変更には管理者またはサーバー管理権限が必要です。',translationTitle:'翻訳',translationFooter:'{source} から {target} に翻訳しました。自動翻訳には誤りが含まれる場合があります。',translationFailed:'翻訳に失敗しました：{error}',languageHelp:'ボットの個人向け返信の言語を選択してください。',serverLanguageHelp:'サーバーの既定言語を選択してください。メンバーは /language で変更できます。'},
  ko:{languageSet:'언어가 **{language}**(으)로 설정되었습니다.',serverLanguageSet:'서버 기본 언어가 **{language}**(으)로 설정되었습니다.',serverAdmin:'서버 언어를 변경하려면 관리자 또는 서버 관리 권한이 필요합니다.',translationTitle:'번역',translationFooter:'{source}에서 {target}(으)로 번역했습니다. 자동 번역에는 오류가 있을 수 있습니다.',translationFailed:'번역 실패: {error}',languageHelp:'봇의 개인 응답에 사용할 언어를 선택하세요.',serverLanguageHelp:'서버 기본 언어를 선택하세요. 멤버는 /language로 변경할 수 있습니다.'},
  nl:{languageSet:'Je taal is nu **{language}**.',serverLanguageSet:'De standaardtaal van de server is nu **{language}**.',serverAdmin:'Je hebt Administrator- of Server beheren-rechten nodig om de servertaal te wijzigen.',translationTitle:'Vertaling',translationFooter:'Vertaald van {source} naar {target}. Automatische vertaling kan fouten bevatten.',translationFailed:'Vertalen mislukt: {error}',languageHelp:'Kies de taal voor persoonlijke botantwoorden.',serverLanguageHelp:'Kies de standaardtaal van de server. Leden kunnen deze met /language overschrijven.'},
  pl:{languageSet:'Twój język to teraz **{language}**.',serverLanguageSet:'Domyślny język serwera to teraz **{language}**.',serverAdmin:'Do zmiany języka serwera potrzebujesz uprawnień administratora lub zarządzania serwerem.',translationTitle:'Tłumaczenie',translationFooter:'Przetłumaczono z {source} na {target}. Tłumaczenie automatyczne może zawierać błędy.',translationFailed:'Tłumaczenie nie powiodło się: {error}',languageHelp:'Wybierz język osobistych odpowiedzi bota.',serverLanguageHelp:'Wybierz domyślny język serwera. Członkowie mogą zmienić go poleceniem /language.'},
  uk:{languageSet:'Вашу мову встановлено: **{language}**.',serverLanguageSet:'Мову сервера за замовчуванням встановлено: **{language}**.',serverAdmin:'Для зміни мови сервера потрібні права адміністратора або керування сервером.',translationTitle:'Переклад',translationFooter:'Перекладено з {source} на {target}. Автоматичний переклад може містити помилки.',translationFailed:'Помилка перекладу: {error}',languageHelp:'Оберіть мову особистих відповідей бота.',serverLanguageHelp:'Оберіть мову сервера за замовчуванням. Учасники можуть змінити її командою /language.'},
  hi:{languageSet:'आपकी भाषा अब **{language}** है।',serverLanguageSet:'सर्वर की डिफ़ॉल्ट भाषा अब **{language}** है।',serverAdmin:'सर्वर की भाषा बदलने के लिए Administrator या Manage Server अनुमति चाहिए।',translationTitle:'अनुवाद',translationFooter:'{source} से {target} में अनुवाद किया गया। स्वचालित अनुवाद में त्रुटियाँ हो सकती हैं।',translationFailed:'अनुवाद विफल: {error}',languageHelp:'बॉट के व्यक्तिगत जवाबों की भाषा चुनें।',serverLanguageHelp:'सर्वर की डिफ़ॉल्ट भाषा चुनें। सदस्य /language से इसे बदल सकते हैं।'},
  id:{languageSet:'Bahasa Anda sekarang **{language}**.',serverLanguageSet:'Bahasa default server sekarang **{language}**.',serverAdmin:'Anda memerlukan izin Administrator atau Kelola Server untuk mengubah bahasa server.',translationTitle:'Terjemahan',translationFooter:'Diterjemahkan dari {source} ke {target}. Terjemahan otomatis dapat mengandung kesalahan.',translationFailed:'Terjemahan gagal: {error}',languageHelp:'Pilih bahasa untuk balasan pribadi bot.',serverLanguageHelp:'Pilih bahasa default server. Anggota dapat menggantinya dengan /language.'},
  vi:{languageSet:'Ngôn ngữ của bạn hiện là **{language}**.',serverLanguageSet:'Ngôn ngữ mặc định của máy chủ hiện là **{language}**.',serverAdmin:'Bạn cần quyền Quản trị viên hoặc Quản lý máy chủ để đổi ngôn ngữ.',translationTitle:'Bản dịch',translationFooter:'Đã dịch từ {source} sang {target}. Bản dịch tự động có thể có lỗi.',translationFailed:'Dịch thất bại: {error}',languageHelp:'Chọn ngôn ngữ cho phản hồi riêng của bot.',serverLanguageHelp:'Chọn ngôn ngữ mặc định của máy chủ. Thành viên có thể đổi bằng /language.'},
  th:{languageSet:'ตั้งค่าภาษาของคุณเป็น **{language}** แล้ว',serverLanguageSet:'ตั้งค่าภาษาเริ่มต้นของเซิร์ฟเวอร์เป็น **{language}** แล้ว',serverAdmin:'ต้องมีสิทธิ์ผู้ดูแลระบบหรือจัดการเซิร์ฟเวอร์เพื่อเปลี่ยนภาษา',translationTitle:'คำแปล',translationFooter:'แปลจาก {source} เป็น {target} การแปลอัตโนมัติอาจมีข้อผิดพลาด',translationFailed:'แปลไม่สำเร็จ: {error}',languageHelp:'เลือกภาษาสำหรับคำตอบส่วนตัวจากบอต',serverLanguageHelp:'เลือกภาษาเริ่มต้นของเซิร์ฟเวอร์ สมาชิกเปลี่ยนได้ด้วย /language'},
  fa:{languageSet:'زبان شما اکنون **{language}** است.',serverLanguageSet:'زبان پیش‌فرض سرور اکنون **{language}** است.',serverAdmin:'برای تغییر زبان سرور به مجوز مدیر یا مدیریت سرور نیاز دارید.',translationTitle:'ترجمه',translationFooter:'از {source} به {target} ترجمه شد. ترجمه خودکار ممکن است خطا داشته باشد.',translationFailed:'ترجمه ناموفق بود: {error}',languageHelp:'زبان پاسخ‌های شخصی ربات را انتخاب کنید.',serverLanguageHelp:'زبان پیش‌فرض سرور را انتخاب کنید. اعضا می‌توانند با /language آن را تغییر دهند.'},
  ur:{languageSet:'آپ کی زبان اب **{language}** ہے۔',serverLanguageSet:'سرور کی ڈیفالٹ زبان اب **{language}** ہے۔',serverAdmin:'سرور کی زبان بدلنے کے لیے ایڈمنسٹریٹر یا مینیج سرور کی اجازت درکار ہے۔',translationTitle:'ترجمہ',translationFooter:'{source} سے {target} میں ترجمہ کیا گیا۔ خودکار ترجمے میں غلطیاں ہو سکتی ہیں۔',translationFailed:'ترجمہ ناکام: {error}',languageHelp:'بوٹ کے ذاتی جوابات کی زبان منتخب کریں۔',serverLanguageHelp:'سرور کی ڈیفالٹ زبان منتخب کریں۔ اراکین /language سے اسے بدل سکتے ہیں۔'},
  el:{languageSet:'Η γλώσσα σου είναι πλέον **{language}**.',serverLanguageSet:'Η προεπιλεγμένη γλώσσα του διακομιστή είναι πλέον **{language}**.',serverAdmin:'Χρειάζεσαι δικαιώματα Διαχειριστή ή Διαχείρισης διακομιστή για να αλλάξεις τη γλώσσα.',translationTitle:'Μετάφραση',translationFooter:'Μεταφράστηκε από {source} σε {target}. Η αυτόματη μετάφραση μπορεί να έχει σφάλματα.',translationFailed:'Η μετάφραση απέτυχε: {error}',languageHelp:'Επίλεξε τη γλώσσα για τις προσωπικές απαντήσεις του bot.',serverLanguageHelp:'Επίλεξε την προεπιλεγμένη γλώσσα του διακομιστή. Τα μέλη μπορούν να την αλλάξουν με /language.'},
  sv:{languageSet:'Ditt språk är nu **{language}**.',serverLanguageSet:'Serverns standardspråk är nu **{language}**.',serverAdmin:'Du behöver administratörs- eller serverhanteringsbehörighet för att ändra språk.',translationTitle:'Översättning',translationFooter:'Översatt från {source} till {target}. Automatisk översättning kan innehålla fel.',translationFailed:'Översättningen misslyckades: {error}',languageHelp:'Välj språk för botens personliga svar.',serverLanguageHelp:'Välj serverns standardspråk. Medlemmar kan ändra det med /language.'},
  da:{languageSet:'Dit sprog er nu **{language}**.',serverLanguageSet:'Serverens standardsprog er nu **{language}**.',serverAdmin:'Du skal have administrator- eller serveradministrationsrettigheder for at ændre sproget.',translationTitle:'Oversættelse',translationFooter:'Oversat fra {source} til {target}. Automatisk oversættelse kan indeholde fejl.',translationFailed:'Oversættelsen mislykkedes: {error}',languageHelp:'Vælg sproget for botens personlige svar.',serverLanguageHelp:'Vælg serverens standardsprog. Medlemmer kan ændre det med /language.'},
  no:{languageSet:'Språket ditt er nå **{language}**.',serverLanguageSet:'Serverens standardspråk er nå **{language}**.',serverAdmin:'Du trenger administrator- eller serveradministrasjonstillatelse for å endre språket.',translationTitle:'Oversettelse',translationFooter:'Oversatt fra {source} til {target}. Automatisk oversettelse kan inneholde feil.',translationFailed:'Oversettelsen mislyktes: {error}',languageHelp:'Velg språk for botens personlige svar.',serverLanguageHelp:'Velg serverens standardspråk. Medlemmer kan endre det med /language.'}
};

// Discord localizes command metadata by the user's Discord client locale, not by
// per-guild settings. Runtime replies continue to use languageFor(interaction).
const AR_COMMAND_DESCRIPTIONS = {
  language:'اختر اللغة الشخصية لردود البوت',serverlanguage:'تعيين اللغة الافتراضية لهذا السيرفر',translate:'ترجمة نص إلى اللغة المحددة',control:'فتح لوحة التحكم التفاعلية لأنظمة البوت',
  'publish-panel':'نشر وتثبيت لوحة تحكم لنظام محدد في قناة', 'panel-image':'اختيار صورة لوحة النظام العامة (للمسؤول فقط)',help:'عرض أوامر البوت وميزاته',banner:'عرض صورة غلاف الملف الشخصي للمستخدم',postimage:'نشر صورة من رابط HTTPS عام',roleinfo:'عرض تفاصيل رتبة في السيرفر',channelinfo:'عرض تفاصيل قناة في السيرفر',
  'role-add':'إضافة رتبة إلى عضو','role-remove':'إزالة رتبة من عضو','role-create':'إنشاء رتبة في السيرفر','role-delete':'حذف رتبة من السيرفر','channel-create':'إنشاء قناة نصية أو صوتية','channel-delete':'حذف قناة من السيرفر','voice-disconnect':'فصل عضو من القناة الصوتية','voice-mute':'كتم عضو في القناة الصوتية','voice-deafen':'منع عضو من سماع الصوت',
  daily:'استلام العملات اليومية',balance:'عرض رصيد العملات',transfer:'تحويل العملات إلى عضو آخر',coinflip:'المراهنة على صورة أو كتابة',leaderboard:'عرض ترتيب الاقتصاد والعملات',avatar:'عرض الصورة الرمزية',server_icon:'عرض أيقونة السيرفر',serverinfo:'عرض معلومات السيرفر',userinfo:'عرض معلومات العضو',ping:'عرض زمن استجابة البوت',botinfo:'عرض معلومات البوت',cat:'عرض صورة قطة عشوائية',dog:'عرض صورة كلب عشوائية',
  'ticket-panel':'نشر لوحة التذاكر',unban:'إلغاء حظر مستخدم باستخدام معرّف Discord',slowmode:'تعيين وضع الإبطاء في القناة الحالية',kick:'طرد عضو من السيرفر',ban:'حظر عضو من السيرفر',timeout:'تقييد عضو لمدة محددة',warn:'إرسال تحذير إلى عضو',warnings:'عرض تحذيرات عضو',clear:'حذف من 1 إلى 100 رسالة',lock:'قفل القناة النصية الحالية',unlock:'فتح القناة النصية الحالية',suggest:'إرسال اقتراح',giveaway:'بدء سحب على جائزة',level:'عرض مستواك أو مستوى عضو',
  'server-backup':'تصدير الرتب والقنوات وصلاحياتها إلى ملف نسخ احتياطي','server-restore':'استعادة هيكل السيرفر من ملف JSON دون حذف العناصر الحالية','server-clone':'نسخ الهيكل والإعدادات المدعومة بين سيرفرين',play:'تشغيل أغنية أو إضافتها إلى قائمة الانتظار',pause:'إيقاف الموسيقى مؤقتًا',resume:'استئناف الموسيقى',skip:'تخطي المقطع الحالي',stop:'إيقاف الموسيقى ومسح قائمة الانتظار',queue:'عرض قائمة تشغيل الموسيقى',volume:'تحديد مستوى صوت الموسيقى',loop:'تحديد وضع تكرار الموسيقى',shuffle:'خلط المقاطع القادمة',log:'إعداد سجلات أحداث السيرفر',setlogchannel:'تحديد قناة سجلات الأعضاء والملفات الشخصية والصوت', 'audit-logs':'عرض أحدث أحداث التدقيق الخاصة بالبوت','setup-status':'عرض حالة إعداد الميزات',
  say:'جعل البوت يرسل رسالة في قناة محددة (للطاقم فقط)','feed-add':'إنشاء موجز صور تلقائي للنشر في قناة','feed-post':'نشر صورة من موجز الآن','feed-toggle':'تفعيل موجز صور أو إيقافه مؤقتًا','feed-remove':'حذف موجز صور','feed-list':'عرض موجزات الصور وإعداداتها','voice-join':'إدخال البوت إلى قناة صوتية','voice-play':'تشغيل صوت من رابط مباشر أو ملف مرفوع؛ الفيديو يُشغّل كصوت فقط','voice-stop':'إيقاف التشغيل الصوتي الحالي','voice-leave':'إخراج البوت من القناة الصوتية','voice-stay':'إبقاء البوت متصلًا بالقناة الصوتية','voice-self-mute':'كتم أو إلغاء كتم إرسال صوت البوت','voice-self-deafen':'كتم أو إلغاء كتم استقبال الصوت لدى البوت','media-channel':'تحديد قناة لمراقبة روابط الوسائط المباشرة',games:'الألعاب والعملات الافتراضية وسلاسل الفوز ولوحات الصدارة'
};
const AR_OPTION_DESCRIPTIONS = {
  language:'اللغة المطلوبة',text:'النص المراد ترجمته',target:'اللغة المستهدفة',source:'لغة النص الأصلي',category:'اختر فئة الأوامر',member:'العضو المستهدف',role:'الرتبة المطلوبة',channel:'القناة المطلوبة',name:'الاسم',color:'اللون',mentionable:'السماح بالإشارة إلى الرتبة',type:'النوع',minutes:'المدة بالدقائق',reason:'السبب',amount:'العدد أو الكمية',idea:'نص الاقتراح',prize:'الجائزة',title:'العنوان',description:'التفاصيل والوصف',url:'الرابط',file:'الملف المرفوع',source_id:'معرّف السيرفر المصدر',target_id:'معرّف السيرفر الهدف',confirm:'تأكيد تنفيذ العملية',query:'اسم الأغنية أو الرابط المدعوم',percent:'مستوى الصوت بالنسبة المئوية',mode:'وضع التكرار',limit:'عدد النتائج',enabled:'تفعيل أو إيقاف',system:'النظام المطلوب',image_url:'رابط HTTPS مباشر للصورة',caption:'نص توضيحي اختياري',user_id:'معرّف مستخدم Discord',seconds:'عدد الثواني؛ صفر لتعطيل الإبطاء',bet:'قيمة الرهان بالعملات الافتراضية',side:'جهة الرهان',opponent:'الخصم',action:'اختر إجراء أو لعبة',interval_minutes:'الفاصل الزمني بالدقائق',source_url:'رابط HTTPS لمصدر الصور',source_id:'معرّف المصدر',target_id:'معرّف الوجهة',muted:'صحيح للكتم، وخطأ لإلغاء الكتم',deafened:'صحيح لمنع السماع، وخطأ لإلغاء ذلك',mentionable:'السماح للأعضاء بالإشارة إلى هذه الرتبة'
};
const AR_CHOICE_LABELS = {
  Welcome:'الترحيب', Goodbye:'المغادرة', 'Event logs':'سجلات الأحداث', 'Automatic role':'رتبة تلقائية',
  Verification:'التحقق', 'Temporary voice rooms':'غرف صوتية مؤقتة', Tickets:'التذاكر',
  Suggestions:'الاقتراحات', 'Anti-raid':'مكافحة الإغراق', Backups:'النسخ الاحتياطي',
  'Sticker & Emoji Tools':'أدوات الملصقات والإيموجي', 'Server Clone':'نسخ السيرفر',
  'Built-in panel artwork':'صور اللوحات المدمجة', 'Server icon':'أيقونة السيرفر', 'Custom HTTPS image':'صورة HTTPS مخصصة',
  Off:'إيقاف', 'Current track':'المقطع الحالي', Queue:'قائمة الانتظار', Heads:'صورة', Tails:'كتابة',
  'English':'الإنجليزية', 'العربية':'العربية', 'Text channel':'قناة نصية', 'Announcement channel':'قناة إعلانات'
};
function localizeCommandPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };
  const commandDescription = AR_COMMAND_DESCRIPTIONS[copy.name];
  if (commandDescription && copy.description) copy.description_localizations = { ...(copy.description_localizations || {}), ar: commandDescription };
  const optionDescription = AR_OPTION_DESCRIPTIONS[copy.name];
  if (optionDescription && copy.description) copy.description_localizations = { ...(copy.description_localizations || {}), ar: optionDescription };
  if (Array.isArray(copy.options)) copy.options = copy.options.map(localizeCommandPayload);
  if (Array.isArray(copy.choices)) copy.choices = copy.choices.map(choice => {
    const localized = { ...choice };
    const label = AR_CHOICE_LABELS[choice.name];
    if (label) localized.name_localizations = { ...(choice.name_localizations || {}), ar: label };
    return localized;
  });
  return copy;
}



// Runtime localization for all user-visible interaction payloads. Translation is
// cached in memory; failures deliberately fall back to the original text so a
// translation outage never prevents a command from completing.
const runtimeTranslationCache = new Map();
const RUNTIME_CACHE_LIMIT = 2500;
// Persist successful static/dynamic translations across restarts to reduce external
// translation calls. This table is additive and does not modify existing settings.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS i18n_translation_cache (
    cache_key TEXT PRIMARY KEY, source_language TEXT NOT NULL, target_language TEXT NOT NULL,
    source_hash TEXT NOT NULL, translated_text TEXT NOT NULL, updated_at INTEGER NOT NULL
  )`);
} catch (error) {
  console.warn('[i18n] Persistent translation cache unavailable; using memory cache:', error.message);
}
function runtimeCacheKey(language, text) {
  return `${language}\u0000${text}`;
}
function persistentCacheKey(language, text) {
  return crypto.createHash('sha256').update(runtimeCacheKey(language, text)).digest('hex');
}
function readPersistentTranslation(language, text) {
  try { return db.prepare('SELECT translated_text FROM i18n_translation_cache WHERE cache_key=?').get(persistentCacheKey(language, text))?.translated_text || null; }
  catch { return null; }
}
function writePersistentTranslation(language, sourceLanguage, text, translated) {
  try {
    db.prepare('INSERT INTO i18n_translation_cache(cache_key,source_language,target_language,source_hash,translated_text,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET translated_text=excluded.translated_text,updated_at=excluded.updated_at')
      .run(persistentCacheKey(language, text), normalizeLanguage(sourceLanguage) || 'en', language, persistentCacheKey('source', text), translated, Date.now());
    // Keep the table bounded so translation cache growth cannot exhaust disk space.
    db.prepare('DELETE FROM i18n_translation_cache WHERE cache_key IN (SELECT cache_key FROM i18n_translation_cache ORDER BY updated_at DESC LIMIT -1 OFFSET 5000)').run();
  } catch (error) { console.warn('[i18n] Could not persist translation cache:', error.message); }
}
function looksAlreadyLocalized(text, target) {
  const value = String(text || '').trim();
  if (!value || target === 'en') return false;
  const letters = value.match(/[\p{L}]/gu) || [];
  if (!letters.length) return false;
  const ratio = re => (value.match(re) || []).length / letters.length;
  if (target === 'ar') return ratio(/[\u0600-\u06FF]/g) >= 0.45 && !/[پچژگٹڈڑںھ]/u.test(value);
  if (target === 'fa') return ratio(/[\u0600-\u06FF]/g) >= 0.35 && /[پچژگ]/u.test(value);
  if (target === 'ur') return ratio(/[\u0600-\u06FF]/g) >= 0.35 && /[ٹڈڑںھ]/u.test(value);
  if (target === 'hi') return ratio(/[\u0900-\u097F]/g) >= 0.35;
  if (target === 'th') return ratio(/[\u0E00-\u0E7F]/g) >= 0.35;
  if (target === 'zh') return ratio(/[\u4E00-\u9FFF]/g) >= 0.35;
  if (target === 'ja') return ratio(/[\u3040-\u30FF\u4E00-\u9FFF]/g) >= 0.35;
  if (target === 'ko') return ratio(/[\uAC00-\uD7AF]/g) >= 0.35;
  if (target === 'ru' || target === 'uk') return ratio(/[\u0400-\u04FF]/g) >= 0.45;
  if (target === 'el') return ratio(/[\u0370-\u03FF]/g) >= 0.45;
  // Latin-script languages cannot be identified by Unicode script alone. Use
  // small stop-word signatures and require multiple matches to avoid mistaking
  // a product name or a single short word for a complete localized sentence.
  const latinHints = {
    es: ['el','la','los','las','una','un','que','para','con','por','del','servidor','configuración','idioma','guardar'],
    fr: ['le','la','les','des','une','un','que','pour','avec','dans','votre','serveur','langue','enregistrer'],
    de: ['der','die','das','ein','eine','und','mit','für','nicht','server','sprache','einstellungen','speichern'],
    tr: ['ve','bir','için','ile','değil','sunucu','dil','ayarlar','kaydet','seçin'],
    pt: ['o','a','os','as','uma','um','que','para','com','servidor','idioma','salvar','configurações'],
    it: ['il','lo','la','gli','una','un','che','per','con','server','lingua','salva','impostazioni'],
    nl: ['de','het','een','en','van','voor','met','niet','server','taal','instellingen','opslaan'],
    pl: ['i','oraz','dla','jest','nie','serwer','język','ustawienia','zapisz','wybierz'],
    vi: ['và','của','cho','trong','không','máy','chủ','ngôn','ngữ','lưu','chọn'],
    id: ['dan','yang','untuk','dengan','tidak','server','bahasa','pengaturan','simpan','pilih'],
    sv: ['och','att','för','med','inte','server','språk','inställningar','spara','välj'],
    da: ['og','at','for','med','ikke','server','sprog','indstillinger','gem','vælg'],
    no: ['og','at','for','med','ikke','server','språk','innstillinger','lagre','velg'],
    af: ['die','van','vir','nie','met','taal','bediener','instellings','stoor'],
    sq: ['dhe','për','një','është','serveri','gjuha','cilësimet','ruaj'],
    eu: ['eta','bat','dira','ez','zerbitzaria','hizkuntza','ezarpenak','gorde'],
    ca: ['els','les','una','per','amb','servidor','llengua','configuració','desa'],
    gl: ['unha','que','para','con','servidor','lingua','configuración','gardar'],
    ro: ['și','este','pentru','cu','nu','server','limba','setări','salvează'],
    cs: ['pro','který','není','server','jazyk','nastavení','uložit','vyberte'],
    sk: ['pre','ktorý','nie','server','jazyk','nastavenia','uložiť','vyberte'],
    fi: ['ja','että','ole','kanssa','palvelin','kieli','asetukset','tallenna'],
    et: ['ja','ning','pole','server','keel','seaded','salvesta','vali'],
    lv: ['un','ir','nav','serveris','valoda','iestatījumi','saglabāt','izvēlieties'],
    lt: ['ir','kad','yra','serveris','kalba','nustatymai','išsaugoti','pasirinkite'],
    hu: ['és','hogy','nem','szerver','nyelv','beállítások','mentés','válasszon'],
    hr: ['i','za','nije','poslužitelj','jezik','postavke','spremi','odaberite'],
    bs: ['i','za','nije','server','jezik','postavke','sačuvaj','izaberite'],
    sl: ['in','za','ni','strežnik','jezik','nastavitve','shrani','izberite'],
    sr: ['и','за','није','server','jezik','podešavanja','sačuvaj','izaberite'],
    cy: ['a','yn','gyda','ddim','gweinydd','iaith','gosodiadau','cadw'],
    sw: ['na','kwa','katika','hii','seva','lugha','mipangilio','hifadhi'],
    ms: ['dan','yang','untuk','dengan','tidak','pelayan','bahasa','tetapan','simpan'],
    fil: ['ang','ng','para','hindi','server','wika','mga','setting','i-save'],
    uz: ['va','uchun','bilan','emas','server','til','sozlamalar','saqlash'],
    eo: ['kaj','por','kun','estas','servilo','lingvo','agordoj','konservi'],
    la: ['et','cum','non','est','servus','lingua','configuratio','serva'],
    fy: ['en','foar','mei','net','tsjinner','taal','ynstellings','bewarje'],
    gd: ['agus','airson','le','chan','frithealaiche','cànan','roghainnean','sàbhail'],
    mi: ['me','ki','ngā','kāore','tūmau','reo','tautuhinga','tiakina'],
    zu: ['futhi','ukuze','nge','cha','iseva','ulimi','izilungiselelo','gcina'],
    xh: ['kunye','ukuze','nge','hayi','iseva','ulwimi','izicwangciso','gcina'],
    yo: ['ati','fun','pẹlu','kii','olupin','ede','eto','fipamọ'],
    ha: ['da','don','cikin','ba','uwar','harshe','saituna','ajiye'],
    ig: ['na','maka','nke','ọ bụghị','sava','asụsụ','ntọala','chekwaa'],
    jv: ['lan','kanggo','karo','ora','server','basa','setelan','simpen'],
    su: ['jeung','pikeun','kalayan','henteu','server','basa','setélan','simpen'],
    ceb: ['ug','alang','uban','dili','server','pinulongan','setting','tipigi'],
    ht: ['ak','pou','avèk','pa','sèvè','lang','paramèt','sove'],
    haw: ['a me','no ka','ʻaʻole','kikowaena','ʻōlelo','hoʻonohonoho','mālama'],
    lb: ['an','fir','mat','net','server','sprooch','astellungen','späicheren'],
    mt: ['u','għal','ma','mhux','server','lingwa','settings','issejvja'],
    ga: ['agus','le haghaidh','nach','freastalaí','teanga','socruithe','sábháil'],
    is: ['og','fyrir','ekki','þjónn','tungumál','stillingar','vista','veldu']
  }[target];
  if (latinHints) {
    const words = value.toLocaleLowerCase().match(/[\p{L}]+/gu) || [];
    const matches = words.filter(word => latinHints.includes(word)).length;
    if (matches >= 2 && matches / Math.max(words.length, 1) >= 0.18) return true;
  }
  return false;
}
function protectRuntimeTokens(text) {
  const tokens = [];
  const protectedText = String(text).replace(/https?:\/\/[^\s<>]+|<@!?\d+>|<@&\d+>|<#\d+>|<a?:[A-Za-z0-9_]+:\d+>|```[\s\S]*?```|`[^`\n]+`|\{\w+\}|\*\*/g, token => {
    const marker = `ZXQPROTECTED${tokens.length}QXZ`;
    tokens.push([marker, token]);
    return marker;
  });
  return { protectedText, tokens };
}
function detectSourceLanguage(text) {
  const value = String(text || '');
  if (/[\u1200-\u137F]/u.test(value)) return 'am';
  if (/[\u0530-\u058F]/u.test(value)) return 'hy';
  if (/[\u10A0-\u10FF\u1C90-\u1CBF]/u.test(value)) return 'ka';
  if (/[\u0590-\u05FF]/u.test(value)) return 'he';
  if (/[\u0980-\u09FF]/u.test(value)) return 'bn';
  if (/[\u0A00-\u0A7F]/u.test(value)) return 'pa';
  if (/[\u0A80-\u0AFF]/u.test(value)) return 'gu';
  if (/[\u0B80-\u0BFF]/u.test(value)) return 'ta';
  if (/[\u0C00-\u0C7F]/u.test(value)) return 'te';
  if (/[\u0C80-\u0CFF]/u.test(value)) return 'kn';
  if (/[\u0D00-\u0D7F]/u.test(value)) return 'ml';
  if (/[\u0D80-\u0DFF]/u.test(value)) return 'si';
  if (/[\u0E80-\u0EFF]/u.test(value)) return 'lo';
  if (/[\u1000-\u109F]/u.test(value)) return 'my';
  if (/[\u1780-\u17FF]/u.test(value)) return 'km';
  if (/[\u3040-\u30FF]/u.test(value)) return 'ja';
  if (/[\uAC00-\uD7AF]/u.test(value)) return 'ko';
  if (/[\u4E00-\u9FFF]/u.test(value)) return 'zh';
  if (/[\u0E00-\u0E7F]/u.test(value)) return 'th';
  if (/[\u0900-\u097F]/u.test(value)) return 'hi';
  if (/[\u0370-\u03FF]/u.test(value)) return 'el';
  if (/[\u0400-\u04FF]/u.test(value)) return /[іїєґ]/iu.test(value) ? 'uk' : 'ru';
  if (/[\u0600-\u06FF]/u.test(value)) {
    if (/[ٹڈڑںھ]/u.test(value)) return 'ur';
    if (/[پچژگ]/u.test(value)) return 'fa';
    return 'ar';
  }
  const words = value.toLocaleLowerCase().match(/[\p{L}]+/gu) || [];
  const signatures = {
    es: ['el','los','las','una','que','para','con','por','del','servidor','configuración','idioma'],
    fr: ['le','les','des','une','que','pour','avec','dans','votre','serveur','langue','enregistrer','veuillez','choisir'],
    de: ['der','die','das','ein','eine','und','mit','für','nicht','sprache','einstellungen','speichern'],
    tr: ['ve','bir','için','ile','değil','sunucu','ayarlar','kaydet','seçin'],
    pt: ['uma','que','para','com','servidor','idioma','salvar','configurações'],
    it: ['gli','una','che','per','con','lingua','salva','impostazioni'],
    nl: ['het','een','van','voor','met','niet','taal','instellingen','opslaan'],
    pl: ['oraz','dla','jest','nie','serwer','język','ustawienia','zapisz'],
    vi: ['và','của','cho','trong','không','ngôn','ngữ','lưu','chọn'],
    id: ['dan','yang','untuk','dengan','tidak','bahasa','pengaturan','simpan','pilih'],
    sv: ['och','att','för','med','inte','språk','inställningar','spara'],
    da: ['og','at','for','med','ikke','sprog','indstillinger','gem'],
    no: ['og','at','for','med','ikke','språk','innstillinger','lagre'],
    af: ['die','van','vir','nie','met','taal','bediener','instellings','stoor'],
    sq: ['dhe','për','një','është','serveri','gjuha','cilësimet','ruaj'],
    eu: ['eta','bat','dira','ez','zerbitzaria','hizkuntza','ezarpenak','gorde'],
    ca: ['els','les','una','per','amb','servidor','llengua','configuració','desa'],
    gl: ['unha','que','para','con','servidor','lingua','configuración','gardar'],
    ro: ['și','este','pentru','cu','nu','server','limba','setări','salvează'],
    cs: ['pro','který','není','server','jazyk','nastavení','uložit','vyberte'],
    sk: ['pre','ktorý','nie','server','jazyk','nastavenia','uložiť','vyberte'],
    fi: ['ja','että','ole','kanssa','palvelin','kieli','asetukset','tallenna'],
    et: ['ja','ning','pole','server','keel','seaded','salvesta','vali'],
    lv: ['un','ir','nav','serveris','valoda','iestatījumi','saglabāt','izvēlieties'],
    lt: ['ir','kad','yra','serveris','kalba','nustatymai','išsaugoti','pasirinkite'],
    hu: ['és','hogy','nem','szerver','nyelv','beállítások','mentés','válasszon'],
    hr: ['i','za','nije','poslužitelj','jezik','postavke','spremi','odaberite'],
    bs: ['i','za','nije','server','jezik','postavke','sačuvaj','izaberite'],
    sl: ['in','za','ni','strežnik','jezik','nastavitve','shrani','izberite'],
    sr: ['и','за','није','server','jezik','podešavanja','sačuvaj','izaberite'],
    cy: ['a','yn','gyda','ddim','gweinydd','iaith','gosodiadau','cadw'],
    sw: ['na','kwa','katika','hii','seva','lugha','mipangilio','hifadhi'],
    ms: ['dan','yang','untuk','dengan','tidak','pelayan','bahasa','tetapan','simpan'],
    fil: ['ang','ng','para','hindi','server','wika','mga','setting','i-save'],
    uz: ['va','uchun','bilan','emas','server','til','sozlamalar','saqlash'],
    eo: ['kaj','por','kun','estas','servilo','lingvo','agordoj','konservi'],
    la: ['et','cum','non','est','servus','lingua','configuratio','serva'],
    fy: ['en','foar','mei','net','tsjinner','taal','ynstellings','bewarje'],
    gd: ['agus','airson','le','chan','frithealaiche','cànan','roghainnean','sàbhail'],
    mi: ['me','ki','ngā','kāore','tūmau','reo','tautuhinga','tiakina'],
    zu: ['futhi','ukuze','nge','cha','iseva','ulimi','izilungiselelo','gcina'],
    xh: ['kunye','ukuze','nge','hayi','iseva','ulwimi','izicwangciso','gcina'],
    yo: ['ati','fun','pẹlu','kii','olupin','ede','eto','fipamọ'],
    ha: ['da','don','cikin','ba','uwar','harshe','saituna','ajiye'],
    ig: ['na','maka','nke','ọ bụghị','sava','asụsụ','ntọala','chekwaa'],
    jv: ['lan','kanggo','karo','ora','server','basa','setelan','simpen'],
    su: ['jeung','pikeun','kalayan','henteu','server','basa','setélan','simpen'],
    ceb: ['ug','alang','uban','dili','server','pinulongan','setting','tipigi'],
    ht: ['ak','pou','avèk','pa','sèvè','lang','paramèt','sove'],
    haw: ['a me','no ka','ʻaʻole','kikowaena','ʻōlelo','hoʻonohonoho','mālama'],
    lb: ['an','fir','mat','net','server','sprooch','astellungen','späicheren'],
    mt: ['u','għal','ma','mhux','server','lingwa','settings','issejvja'],
    ga: ['agus','le haghaidh','nach','freastalaí','teanga','socruithe','sábháil'],
    is: ['og','fyrir','ekki','þjónn','tungumál','stillingar','vista','veldu']
  };
  let best = { language: 'en', score: 0 };
  for (const [language, hints] of Object.entries(signatures)) {
    const matches = words.filter(word => hints.includes(word)).length;
    const score = matches / Math.max(words.length, 1);
    if (matches >= 2 && score >= 0.18 && score > best.score) best = { language, score };
  }
  return best.language;
}
function needsTranslationSegment(value, lang) {
  const segment = String(value ?? '');
  if (!segment.trim() || !/[\p{L}\p{N}]/u.test(segment)) return false;
  if (/^(?:https?:\/\/\S+|\d{5,}|<[^>]+>)$/u.test(segment.trim())) return false;
  const source = detectSourceLanguage(segment);
  if (source === lang) return false;
  return !(lang !== 'en' && looksAlreadyLocalized(segment, lang));
}
function splitMixedText(text) {
  // Split common bilingual patterns without splitting URLs (which have no surrounding spaces).
  return String(text).split(/(\n+|\s+\/\s+|\s+•\s+)/u);
}
function shouldTranslateRuntimeText(value, target) {
  const text = String(value ?? '');
  const lang = normalizeLanguage(target) || 'en';
  if (!text.trim() || !/[\p{L}\p{N}]/u.test(text)) return false;
  if (/^(?:https?:\/\/[^\s<>]+|\d{5,}|<@!?\d+>|<@&\d+>|<#\d+>)$/u.test(text.trim())) return false;
  const { protectedText } = protectRuntimeTokens(text);
  const parts = splitMixedText(protectedText);
  if (parts.length > 1 && parts.some((part, index) => index % 2 === 0 && needsTranslationSegment(part, lang))) return true;
  return needsTranslationSegment(protectedText, lang);
}
async function translateRuntimeTextUnshared(value, target) {
  const text = String(value ?? '');
  const lang = normalizeLanguage(target) || 'en';
  if (!shouldTranslateRuntimeText(text, lang)) return text;
  const key = runtimeCacheKey(lang, text);
  if (runtimeTranslationCache.has(key)) return runtimeTranslationCache.get(key);
  const persisted = readPersistentTranslation(lang, text);
  if (persisted) { runtimeTranslationCache.set(key, persisted); return persisted; }
  // Keep URLs, mentions, code, markdown emphasis and placeholders intact.
  const { protectedText, tokens } = protectRuntimeTokens(text);
  // User-facing Discord payloads must never contain provider diagnostics. On failure,
  // preserve the original text and log the technical reason only in the host console.
  const markUntranslated = (part, reason='service unavailable') => String(part ?? text);
  try {
    const parts = splitMixedText(protectedText);
    let translated;
    if (parts.length > 1 && parts.some((part, index) => index % 2 === 0 && needsTranslationSegment(part, lang))) {
      const localizedParts = await Promise.all(parts.map(async (part, index) => {
        if (index % 2 === 1 || !needsTranslationSegment(part, lang)) return part;
        try { return await translateText(part, detectSourceLanguage(part), lang, 8000); }
        catch (error) {
          console.warn(`[i18n] Translation failed (${detectSourceLanguage(part)} -> ${lang}): ${error.message}`);
          return markUntranslated(part);
        }
      }));
      translated = localizedParts.join('');
    } else {
      translated = await translateText(protectedText, detectSourceLanguage(protectedText), lang, 1600);
    }
    // Do not risk damaging mentions/URLs if a provider removes protected markers.
    if (tokens.some(([marker]) => !translated.includes(marker))) {
      console.error(`[i18n] Translation provider altered protected tokens for ${lang}; source text shown explicitly.`);
      return text;
    }
    for (const [marker, token] of tokens) translated = translated.split(marker).join(token);
    if (runtimeTranslationCache.size >= RUNTIME_CACHE_LIMIT) runtimeTranslationCache.delete(runtimeTranslationCache.keys().next().value);
    runtimeTranslationCache.set(key, translated);
    writePersistentTranslation(lang, detectSourceLanguage(protectedText), text, translated);
    return translated;
  } catch (error) {
    console.warn(`[i18n] Translation failed (${detectSourceLanguage(protectedText)} -> ${lang}): ${error.message}`);
    // Keep the Discord UI clean; report the failure only in server logs.
    const visible = text;
    if (runtimeTranslationCache.size >= RUNTIME_CACHE_LIMIT) runtimeTranslationCache.delete(runtimeTranslationCache.keys().next().value);
    runtimeTranslationCache.set(key, visible);
    return visible;
  }
}
// Coalesce simultaneous requests for the same text/language. Without this single-flight
// cache, one embed with repeated labels or several simultaneous commands could fan out
// many identical HTTP requests and trigger provider HTTP 429 responses.
const runtimeTranslationInFlight = new Map();
const runtimeTranslationQueue = [];
let runtimeTranslationActive = 0;
const RUNTIME_TRANSLATION_CONCURRENCY = 3;
async function runRuntimeTranslationLimited(text, lang) {
  if (runtimeTranslationActive < RUNTIME_TRANSLATION_CONCURRENCY) runtimeTranslationActive++;
  else await new Promise(resolve => runtimeTranslationQueue.push(resolve));
  try { return await translateRuntimeTextUnshared(text, lang); }
  finally {
    const next = runtimeTranslationQueue.shift();
    if (next) next();
    else runtimeTranslationActive--;
  }
}
async function translateRuntimeText(value, target) {
  const text = String(value ?? '');
  const lang = normalizeLanguage(target) || 'en';
  if (!shouldTranslateRuntimeText(text, lang)) return text;
  const key = runtimeCacheKey(lang, text);
  if (runtimeTranslationCache.has(key)) return runtimeTranslationCache.get(key);
  if (runtimeTranslationInFlight.has(key)) return runtimeTranslationInFlight.get(key);
  const pending = runRuntimeTranslationLimited(text, lang);
  runtimeTranslationInFlight.set(key, pending);
  try { return await pending; }
  finally { if (runtimeTranslationInFlight.get(key) === pending) runtimeTranslationInFlight.delete(key); }
}
const TRANSLATABLE_KEYS = new Set(['content','title','description','name','text','placeholder','label','footer','author']);
async function localizePayloadNode(node, target, parentKey='') {
  if (node == null || Buffer.isBuffer(node) || node instanceof ArrayBuffer || ArrayBuffer.isView(node)) return node;
  if (typeof node === 'string') {
    if (TRANSLATABLE_KEYS.has(parentKey) || ['fieldName','fieldValue'].includes(parentKey)) return translateRuntimeText(node, target);
    return node;
  }
  if (Array.isArray(node)) return Promise.all(node.map(item => localizePayloadNode(item, target, parentKey)));
  if (typeof node !== 'object') return node;
  let source = node;
  if (typeof node.toJSON === 'function') {
    try { source = node.toJSON(); } catch { source = node; }
  }
  const entries = await Promise.all(Object.entries(source).map(async ([key, value]) => {
    if (key === 'custom_id' || key === 'customId' || key === 'url' || key === 'icon_url' || key === 'proxy_url' || key === 'id' || key === 'type' || key === 'style' || key === 'emoji' || key === 'allowed_mentions' || key === 'allowedMentions' || key === 'files' || key === 'attachments' || key === 'poll' || key === 'stickers' || key === 'value') {
      return [key, value];
    }
    // Embed fields use name/value; button/select labels and placeholders are localized.
    const shouldTranslate = TRANSLATABLE_KEYS.has(key) && typeof value === 'string';
    if (shouldTranslate) {
      const translated = await translateRuntimeText(value, target);
      // Discord select-menu option descriptions have a strict 100-character
      // maximum. Translation can expand text beyond the source limit.
      if (key === 'description' && parentKey === 'options') return [key, translated.slice(0, 100)];
      // Keep other interactive component labels/placeholders within Discord's
      // corresponding 100-character component limits as well.
      if (['label', 'placeholder'].includes(key)) return [key, translated.slice(0, 100)];
      return [key, translated];
    }
    if (key === 'fields' && Array.isArray(value)) {
      return [key, await Promise.all(value.map(async field => ({
        ...field,
        name: typeof field.name === 'string' ? await translateRuntimeText(field.name, target) : field.name,
        value: typeof field.value === 'string' ? await translateRuntimeText(field.value, target) : field.value
      })))];
    }
    return [key, await localizePayloadNode(value, target, key)];
  }));
  return Object.fromEntries(entries);
}
async function localizePayload(payload, target) {
  if (typeof payload === 'string') return translateRuntimeText(payload, target);
  return localizePayloadNode(payload, target);
}

function message(interaction,key,vars={}){
  const lang=languageFor(interaction), template=(MESSAGES[lang]||MESSAGES.en)[key]||MESSAGES.en[key]||key;
  return template.replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??''));
}
module.exports={LANGUAGES,CHOICES,languageAutocomplete,normalizeLanguage,getUserLanguage,setUserLanguage,getServerLanguage,setServerLanguage,clearServerLanguage,languageFor,languageName,translateText,translateRuntimeText,shouldTranslateRuntimeText,localizePayload,message,localizeCommandPayload,looksAlreadyLocalized,detectSourceLanguage};
