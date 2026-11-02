'use strict';
// Immutable catalog only. Runtime balances, inventory, game state and history live in SQLite.
const list = [
  { key: 'link', name: 'ربط', price: 8, emoji: '🔗', desc: 'تربط لاعبين؛ إذا خرج أحدهما يخرج الآخر أيضًا.' },
  { key: 'revive', name: 'إنعاش', price: 25, emoji: '💉', desc: 'إعادة لاعب خرج سابقًا إلى الجولة الحالية.' },
  { key: 'hack', name: 'تهكير', price: 18, emoji: '💻', desc: 'منع لاعب من استخدام الخصائص في هذه اللعبة.' },
  { key: 'ban', name: 'منع', price: 9, emoji: '⛔', desc: 'منع لاعب من استخدام الخصائص في هذه اللعبة.' },
  { key: 'hide', name: 'إخفاء', price: 10, emoji: '🎭', desc: 'إخفاء اسمك على العجلة للدورة التالية.' },
  { key: 'swap', name: 'تبديل', price: 8, emoji: '🔄', desc: 'تبديل ترتيبك مع لاعب آخر.' },
  { key: 'nuke', name: 'نووي', price: 200, emoji: '☢️', desc: 'إخراج بقية اللاعبين من الجولة.' },
  { key: 'snipe', name: 'قنص', price: 30, emoji: '🎯', desc: 'إخراج لاعب واحد تختاره من الجولة.' },
  { key: 'counter', name: 'هجمة مرتدة', price: 25, emoji: '🪞', desc: 'حماية من الإخراج في دورة العجلة التالية.' },
  { key: 'bomb', name: 'قنبلة', price: 15, emoji: '💣', desc: 'إخراج ما يصل إلى ثلاثة لاعبين عشوائيًا.' },
  { key: 'shield', name: 'حماية', price: 20, emoji: '🛡️', desc: 'حماية من الإخراج في دورة العجلة التالية.' },
  { key: 'reverse', name: 'عكس', price: 12, emoji: '🌀', desc: 'عكس ترتيب أسماء العجلة في الدورة التالية.' }
];
module.exports = { list, active: () => list.slice() };
