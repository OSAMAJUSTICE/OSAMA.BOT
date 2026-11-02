'use strict';
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('./db');
const i18n = require('./i18n');
const { randomInt } = require('node:crypto');
const rouletteService = require('./roulette/service');
const rouletteItems = require('./roulette/items').list;

db.exec(`
CREATE TABLE IF NOT EXISTS game_wallets(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,coins INTEGER NOT NULL DEFAULT 100,xp INTEGER NOT NULL DEFAULT 0,streak INTEGER NOT NULL DEFAULT 0,last_daily TEXT,last_streak_day TEXT,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS game_stats(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,games INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS game_sessions(id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,host_id TEXT NOT NULL,type TEXT NOT NULL,state_json TEXT NOT NULL,created_at INTEGER NOT NULL);
`);
const actions=[['daily','Daily reward / المكافأة اليومية'],['profile','Profile / ملفك'],['leaderboard','Leaderboard / المتصدرون'],['streak','Streak / الاستريك'],['roulette','Roulette / الروليت'],['shop','Roulette item shop / متجر الروليت'],['bag','Roulette inventory / الحقيبة'],['history','Roulette history / السجل'],['settings','Roulette settings / الإعدادات'],['buy','Buy a roulette item / شراء خاصية'],['use','Use a roulette item / استخدام خاصية'],['points','Roulette points / النقاط'],['roulette-daily','Roulette daily points / نقاط يومية'],['chairs','Musical chairs / الكراسي'],['mafia','Mafia / المافيا'],['xo','Tic-tac-toe / XO'],['quiz','Quiz / مسابقة'],['would-you-rather','Would you rather / لو خيروك']];
const commands=[
 new SlashCommandBuilder().setName('games').setDescription('Games, virtual coins, streaks and leaderboards').addStringOption(o=>o.setName('action').setDescription('Choose a game or profile action').setRequired(true).addChoices(...actions.map(([value,name])=>({name,value})))).addUserOption(o=>o.setName('opponent').setDescription('Opponent for XO')).addIntegerOption(o=>o.setName('bet').setDescription('Virtual coin wager for classic roulette (0-500)').setMinValue(0).setMaxValue(500)).addStringOption(o=>o.setName('item').setDescription('Roulette item for buy/use').addChoices(...rouletteItems.map(x=>({name:`${x.emoji} ${x.name} (${x.price})`,value:x.key})))).addUserOption(o=>o.setName('target').setDescription('Target player for an item'))];
const dailyStmt=db.prepare('SELECT * FROM game_wallets WHERE guild_id=? AND user_id=?');
function wallet(g,u){db.prepare('INSERT OR IGNORE INTO game_wallets(guild_id,user_id) VALUES(?,?)').run(g,u);return dailyStmt.get(g,u);}
function stats(g,u){db.prepare('INSERT OR IGNORE INTO game_stats(guild_id,user_id) VALUES(?,?)').run(g,u);return db.prepare('SELECT * FROM game_stats WHERE guild_id=? AND user_id=?').get(g,u);}
function level(xp){return Math.floor(Math.sqrt(Math.max(0,xp)/100));}
function xpAdd(g,u,n){wallet(g,u);db.prepare('UPDATE game_wallets SET xp=xp+? WHERE guild_id=? AND user_id=?').run(n,g,u);}
function coins(g,u,n){wallet(g,u);db.prepare('UPDATE game_wallets SET coins=MAX(0,coins+?) WHERE guild_id=? AND user_id=?').run(n,g,u);}
function record(g,u,won){stats(g,u);db.prepare('UPDATE game_stats SET games=games+1,wins=wins+?,losses=losses+? WHERE guild_id=? AND user_id=?').run(won?1:0,won?0:1,g,u);xpAdd(g,u,won?25:10);if(won)coins(g,u,15);}
function btn(id,label,style=ButtonStyle.Primary){return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);}
function session(i,type,state){const id=randomInt(1,0x7fffffff).toString(36);db.prepare('INSERT INTO game_sessions(id,guild_id,channel_id,host_id,type,state_json,created_at) VALUES(?,?,?,?,?,?,?)').run(id,i.guildId,i.channelId,i.user.id,type,JSON.stringify(state),Date.now());return id;}
function getSession(id){return db.prepare('SELECT * FROM game_sessions WHERE id=?').get(id);}
function finish(id){db.prepare('DELETE FROM game_sessions WHERE id=?').run(id);}
function getQuiz(){const q=[{q:'How many sides does a hexagon have? / كم ضلعًا للسداسي؟',a:['5','6','7','8'],correct:1},{q:'Which planet is known as the Red Planet? / ما الكوكب الأحمر؟',a:['Venus','Jupiter','Mars','Mercury'],correct:2},{q:'What is 9 × 7? / حاصل ٩ × ٧؟',a:['56','63','72','69'],correct:1},{q:'Which is the largest ocean? / ما أكبر محيط؟',a:['Atlantic','Indian','Arctic','Pacific'],correct:3}];return q[randomInt(q.length)];}
async function handle(i){
 if(i.isChatInputCommand()&&i.commandName==='games'){const rouletteHandled=await rouletteService.handle(i);if(rouletteHandled!==false)return rouletteHandled;
  if(!i.guild)return i.reply({content:'Games work inside a server / الألعاب تعمل داخل السيرفر.',flags:MessageFlags.Ephemeral});
  const action=i.options.getString('action'),g=i.guildId,u=i.user.id,w=wallet(g,u),s=stats(g,u);
  if(action==='would-you-rather'){
   const scenarios=[
    {a:'تسافر للماضي',b:'تسافر للمستقبل'},
    {a:'تقرأ أفكار الناس',b:'تتحكم في الوقت'},
    {a:'تعيش بدون هاتف',b:'تعيش بدون إنترنت'},
    {a:'تكون مشهورًا ومكروهًا',b:'تكون مجهولًا ومحبوبًا'},
    {a:'تتكلم كل اللغات',b:'تعزف كل الآلات الموسيقية'},
    {a:'تعرف المستقبل',b:'تقدر تغيّر الماضي'},
    {a:'تعيش قرب البحر',b:'تعيش وسط الجبال'},
    {a:'تأكل حلو فقط لمدة شهر',b:'تأكل مالح فقط لمدة شهر'},
    {a:'تكون ذكيًا جدًا',b:'تكون قويًا جدًا'},
    {a:'تعيش بدون موسيقى',b:'تعيش بدون أفلام'},
    {a:'تقدر تطير',b:'تقدر تختفي'},
    {a:'رحلة مجانية حول العالم',b:'بيت أحلامك مجانًا'},
    {a:'تشتغل 4 أيام في الأسبوع',b:'تشتغل ساعتين يوميًا'},
    {a:'تفتكر كل شيء',b:'تتعلم أي مهارة بسرعة'},
    {a:'تعيش في عالم ألعاب',b:'تعيش في عالم أفلام'}
   ];
   const item=scenarios[randomInt(scenarios.length)],votes={a:0,b:0},voters=new Set(),pollKey=randomInt(1,0x7fffffff).toString(36);
   const row=new ActionRowBuilder().addComponents(
    btn(`wyr:${pollKey}:a`,'🅰️ '+item.a.slice(0,70),ButtonStyle.Primary),
    btn(`wyr:${pollKey}:b`,'🅱️ '+item.b.slice(0,70),ButtonStyle.Secondary)
   );
   await i.reply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle('🤔 لو خيروك | Would you rather?').setDescription(`**A:** ${item.a}\n\n**B:** ${item.b}\n\nصوّت مرة واحدة خلال 20 ثانية! • Vote once within 20 seconds.`)],components:[row]});
   const poll=await i.fetchReply();
   const collector=poll.createMessageComponentCollector({time:20000,filter:x=>[`wyr:${pollKey}:a`,`wyr:${pollKey}:b`].includes(x.customId)&&!x.user.bot});
   collector.on('collect',async x=>{
    if(voters.has(x.user.id))return x.reply({content:'صوّت مرة واحدة فقط. • You have already voted.',flags:MessageFlags.Ephemeral});
    voters.add(x.user.id);votes[x.customId.endsWith(':a')?'a':'b']++;
    return x.reply({content:'تم تسجيل صوتك! • Vote recorded.',flags:MessageFlags.Ephemeral});
   });
   collector.on('end',async()=>{
    const total=votes.a+votes.b;
    const pa=total?Math.round(votes.a/total*100):0,pb=total?100-pa:0;
    const result=new EmbedBuilder().setColor(0x9b59b6).setTitle('📊 نتيجة لو خيروك | Poll results')
     .setDescription(`**A:** ${item.a}\n${'█'.repeat(Math.round(pa/10))}${'░'.repeat(10-Math.round(pa/10))} ${pa}% (${votes.a})\n\n**B:** ${item.b}\n${'█'.repeat(Math.round(pb/10))}${'░'.repeat(10-Math.round(pb/10))} ${pb}% (${votes.b})`)
     .setFooter({text:`${total} vote(s) • انتهى التصويت`});
    await poll.edit({embeds:[result],components:[]}).catch(()=>{});
   });
   return;
  }

  if(action==='daily'){const today=new Date().toISOString().slice(0,10);if(w.last_daily===today)return i.reply({content:`You already claimed today's reward. / استلمت مكافأتك اليوم.\n🔥 Streak: ${w.streak} days`,flags:MessageFlags.Ephemeral});const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10),streak=w.last_daily===yesterday?w.streak+1:1,reward=100+Math.min(streak,30)*5;db.prepare('UPDATE game_wallets SET coins=coins+?,xp=xp+30,streak=?,last_daily=?,last_streak_day=? WHERE guild_id=? AND user_id=?').run(reward,streak,today,today,g,u);return i.reply({embeds:[new EmbedBuilder().setColor(0x2ecc71).setTitle('🎁 Daily reward / المكافأة اليومية').setDescription(`You received **${reward}** 🪙 and **30 XP**.\nاستلمت **${reward}** عملة و**30 XP**.\n🔥 Streak: **${streak}**`).setTimestamp()]});}
  if(action==='profile'||action==='streak'){const fresh=wallet(g,u),ss=stats(g,u);return i.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle(`🎮 ${i.user.username} • Game profile`).setThumbnail(i.user.displayAvatarURL()).addFields({name:'🪙 Coins / العملات',value:String(fresh.coins),inline:true},{name:'✨ XP',value:String(fresh.xp),inline:true},{name:'🏅 Level / المستوى',value:String(level(fresh.xp)),inline:true},{name:'🔥 Daily streak / الاستريك',value:`${fresh.streak} days`,inline:true},{name:'🏆 Wins / الانتصارات',value:String(ss.wins),inline:true},{name:'🎲 Games / الألعاب',value:String(ss.games),inline:true}).setFooter({text:'Virtual coins only • عملات افتراضية فقط'})]});}
  if(action==='leaderboard'){const rows=db.prepare('SELECT user_id,coins,xp,streak FROM game_wallets WHERE guild_id=? ORDER BY xp DESC,coins DESC LIMIT 10').all(g);const desc=rows.length?rows.map((r,n)=>`**${n+1}.** <@${r.user_id}> — Level ${level(r.xp)} • ${r.xp} XP • 🪙 ${r.coins} • 🔥 ${r.streak}`).join('\n'):'No players yet / لا يوجد لاعبون بعد';return i.reply({embeds:[new EmbedBuilder().setColor(0xf1c40f).setTitle('🏆 Games leaderboard / ترتيب اللاعبين').setDescription(desc)]});}
  if(action==='roulette'){const bet=i.options.getInteger('bet')||0;if(bet>w.coins)return i.reply({content:`Not enough coins. You have ${w.coins}. / رصيدك غير كافٍ.`,flags:MessageFlags.Ephemeral});if(bet>0)coins(g,u,-bet);const color=randomInt(0,37),won=color===0?'green':color%2?'red':'black';const row=new ActionRowBuilder().addComponents(btn(`roulette:${g}:${u}:${bet}:red`,'🔴 Red'),btn(`roulette:${g}:${u}:${bet}:black`,'⚫ Black'),btn(`roulette:${g}:${u}:${bet}:green`,'🟢 Green'));return i.reply({embeds:[new EmbedBuilder().setColor(0x8e44ad).setTitle('🎡 Roulette / الروليت').setDescription(`Choose a color. Bet: **${bet}** coins.\nاختر لونًا. الرهان: **${bet}** عملة.\n\nResult is revealed after you choose. / تظهر النتيجة بعد اختيارك.`)],components:row.components.length?[row]:[]}).then(async()=>{const msg=await i.fetchReply();const data={color,won,bet,userId:u,paid:bet>0};db.prepare('INSERT OR REPLACE INTO game_sessions(id,guild_id,channel_id,host_id,type,state_json,created_at) VALUES(?,?,?,?,?,?,?)').run(`roulette-${msg.id}`,g,i.channelId,u,'roulette',JSON.stringify(data),Date.now());});}
  if(action==='quiz'){const q=getQuiz(),correct=String.fromCharCode(65+q.correct);{const row=new ActionRowBuilder().addComponents(...q.a.map((a,n)=>btn(`quiz:${g}:${u}:${correct}:${String.fromCharCode(65+n)}`,`${String.fromCharCode(65+n)}. ${a}`)));return i.reply({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle('🧠 Quiz / مسابقة').setDescription(q.q+'\n\n'+q.a.map((a,n)=>`**${String.fromCharCode(65+n)}.** ${a}`).join('\n'))],components:[row]});}return i.reply({content:'Start a new quiz without the answer option and choose a button. / ابدأ المسابقة بدون تحديد الإجابة ثم اختر زرًا.',flags:MessageFlags.Ephemeral});}
  if(action==='chairs'||action==='mafia'){const id=session(i,action,{players:[u],round:1,status:'open'});const title=action==='chairs'?'🪑 Musical chairs / الكراسي الموسيقية':'🕵️ Mafia / المافيا';const row=new ActionRowBuilder().addComponents(btn(`join:${id}`,'Join / انضم',ButtonStyle.Success),btn(`start:${id}`, 'Start round / بدء الجولة',ButtonStyle.Primary));return i.reply({embeds:[new EmbedBuilder().setColor(0xe84393).setTitle(title).setDescription(action==='chairs'?'Press Join to enter. Host starts the round; each round randomly removes one player until one remains.\nاضغط انضم للمشاركة. يزيل المنظم لاعبًا عشوائيًا كل جولة حتى يبقى فائز.':'Join the lobby. The host can start when at least 4 players joined. Role assignments and voting run in this lobby.\nانضم للغرفة؛ يحتاج المنظم إلى 4 لاعبين على الأقل.')],components:[row]});}
  if(action==='xo'){const opp=i.options.getUser('opponent');if(!opp||opp.bot||opp.id===u)return i.reply({content:'Choose another human member as opponent. / اختر عضوًا آخر للعب.',flags:MessageFlags.Ephemeral});const id=session(i,'xo',{players:[u,opp.id],turn:0,board:Array(9).fill(null),symbols:{[u]:'X',[opp.id]:'O'}});const rows=xoRows(id,Array(9).fill(null));return i.reply({content:`Tic-tac-toe / XO: ${i.user} vs ${opp}. ${i.user} starts.`,components:rows});}
 }
 if(!i.isButton())return false;
 const id=i.customId;
 if(id.startsWith('roulette:')){const [,g,u,betS,choice]=id.split(':'),s=db.prepare('SELECT * FROM game_sessions WHERE id=?').get(`roulette-${i.message.id}`);if(!s)return i.reply({content:'This roulette round has expired.',flags:MessageFlags.Ephemeral});const d=JSON.parse(s.state_json);if(i.user.id!==u)return i.reply({content:'Only the player who started this round can choose. / هذا الرهان لصاحبه فقط.',flags:MessageFlags.Ephemeral});finish(s.id);const win=choice===d.won,payout=d.won==='green'?14:2;if(win){coins(g,u,Number(betS)*payout);record(g,u,true);}else record(g,u,false);return i.update({embeds:[new EmbedBuilder().setColor(win?0x2ecc71:0xe74c3c).setTitle('🎡 Roulette result / نتيجة الروليت').setDescription(`Result: **${d.color} (${d.won})**. You ${win?'won':'lost'} ${betS} coins. / النتيجة: **${d.color} (${d.won})**. ${win?'فزت':'خسرت'} ${betS} عملة.\nBalance: **${wallet(g,u).coins}** 🪙`)],components:[]});}
 if(id.startsWith('quiz:')){const [,g,u,correct,chosen]=id.split(':');if(i.user.id!==u)return i.reply({content:'This quiz belongs to the player who started it.',flags:MessageFlags.Ephemeral});const win=chosen===correct;if(win){coins(g,u,30);xpAdd(g,u,35);record(g,u,true);}else record(g,u,false);return i.update({content:`${win?'✅ Correct! +30 coins and XP. / إجابة صحيحة!':'❌ Incorrect. / إجابة خاطئة.'} Correct answer: **${correct}**.`,components:[]});}
 if(id.startsWith('join:')){const sid=id.slice(5),s=getSession(sid);if(!s)return i.reply({content:'Game lobby expired.',flags:MessageFlags.Ephemeral});const d=JSON.parse(s.state_json);if(d.status!=='open')return i.reply({content:'This game has already started.',flags:MessageFlags.Ephemeral});if(!d.players.includes(i.user.id))d.players.push(i.user.id);db.prepare('UPDATE game_sessions SET state_json=? WHERE id=?').run(JSON.stringify(d),sid);return i.reply({content:`Joined! Players: ${d.players.length}. / تم الانضمام! عدد اللاعبين: ${d.players.length}.`,flags:MessageFlags.Ephemeral});}
 if(id.startsWith('start:')){const sid=id.slice(6),s=getSession(sid);if(!s)return i.reply({content:'Game lobby expired.',flags:MessageFlags.Ephemeral});if(i.user.id!==s.host_id)return i.reply({content:'Only the host can start this game.',flags:MessageFlags.Ephemeral});const d=JSON.parse(s.state_json);if(s.type==='mafia'){if(d.players.length<4)return i.reply({content:'Mafia needs at least 4 players. / المافيا تحتاج 4 لاعبين على الأقل.',flags:MessageFlags.Ephemeral});const mafia=d.players[randomInt(d.players.length)];for(const p of d.players){const member=await i.guild.members.fetch(p).catch(()=>null);if(member){const privateRole=`🕵️ Mafia game role: ${p===mafia?'MAFIA':'CITIZEN'} / دورك في المافيا: ${p===mafia?'مافيا':'مواطن'}`;i18n.localizePayload(privateRole,i18n.languageFor(i)).then(text=>member.send(text)).catch(()=>{});}}d.status='started';d.mafia=mafia;db.prepare('UPDATE game_sessions SET state_json=? WHERE id=?').run(JSON.stringify(d),sid);return i.update({embeds:[new EmbedBuilder().setTitle('🕵️ Mafia started / بدأت المافيا').setDescription('Roles sent privately when DMs are open. Use group discussion and vote in chat; host moderates rounds.\nتم إرسال الأدوار خاصًا إذا كانت الرسائل الخاصة مفتوحة. التصويت يديره المنظم.')],components:[]});}
 if(s.type==='chairs'){if(d.players.length<2)return i.reply({content:'Need at least 2 players. / نحتاج لاعبين على الأقل.',flags:MessageFlags.Ephemeral});const out=d.players.splice(randomInt(d.players.length),1)[0];if(d.players.length===1){record(s.guild_id,d.players[0],true);record(s.guild_id,out,false);finish(sid);return i.update({embeds:[new EmbedBuilder().setTitle('🪑 Musical chairs winner / فائز الكراسي').setDescription(`🏆 Winner: <@${d.players[0]}>\nEliminated: <@${out}>\nWinner received 15 coins and XP. / حصل الفائز على مكافأة.`)],components:[]});}d.round++;db.prepare('UPDATE game_sessions SET state_json=? WHERE id=?').run(JSON.stringify(d),sid);return i.update({embeds:[new EmbedBuilder().setTitle(`🪑 Round ${d.round} / الجولة ${d.round}`).setDescription(`Out this round: <@${out}>\nStill playing: ${d.players.map(p=>`<@${p}>`).join(', ')}\nHost presses Start Round for the next round.`)],components:[new ActionRowBuilder().addComponents(btn(`start:${sid}`,'Next round / الجولة التالية'))]});}}
 if(id.startsWith('xo:')){const [,sid,pos]=id.split(':');const s=getSession(sid);if(!s)return i.reply({content:'Game expired.',flags:MessageFlags.Ephemeral});const d=JSON.parse(s.state_json);if(!d.players.includes(i.user.id)||d.players[d.turn%2]!==i.user.id)return i.reply({content:'Not your turn. / ليس دورك.',flags:MessageFlags.Ephemeral});if(d.board[Number(pos)]!==null)return i.reply({content:'That square is taken.',flags:MessageFlags.Ephemeral});d.board[Number(pos)]=d.symbols[i.user.id];d.turn++;const win=winner(d.board);if(win||d.turn===9){finish(sid);if(win)record(s.guild_id,i.user.id,true);else{record(s.guild_id,d.players[0],false);record(s.guild_id,d.players[1],false);}return i.update({content:win?`🏆 <@${i.user.id}> wins! / فاز اللاعب!`:'Draw! / تعادل!',components:xoRows(sid,d.board,true)});}db.prepare('UPDATE game_sessions SET state_json=? WHERE id=?').run(JSON.stringify(d),sid);return i.update({content:`XO • Next turn: <@${d.players[d.turn%2]}>`,components:xoRows(sid,d.board)});}
 return false;
}
function xoRows(id,board,disabled=false){return [0,1,2].map(r=>new ActionRowBuilder().addComponents(...board.slice(r*3,r*3+3).map((v,j)=>{const n=r*3+j;return new ButtonBuilder().setCustomId(`xo:${id}:${n}`).setLabel(v||'·').setStyle(v==='X'?ButtonStyle.Primary:v==='O'?ButtonStyle.Danger:ButtonStyle.Secondary).setDisabled(disabled||Boolean(v));})));}
function winner(b){for(const [a,c,d] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return null;}
module.exports={commands,handle,rouletteService};
