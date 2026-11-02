require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { installLogRedaction, createLimiter, checkEnvironment, printEnvironmentReport } = require('./security');
const fs=require('node:fs'),path=require('node:path');
const {Client,GatewayIntentBits,Partials,REST,Routes,PermissionFlagsBits,ChannelType,EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,AttachmentBuilder,StringSelectMenuBuilder,ChannelSelectMenuBuilder,RoleSelectMenuBuilder}=require('discord.js');
const db=require('./db');
const extras=require('./extras');
const games=require('./games');
const communityTools=require('./community-tools');
const automod=require('./automod');
const imageLinkCollector=require('./image-link-collector');
const imageFeeds=require('./image-feeds');
const transferTax=require('./transfer-tax');
const quranFeatures=require('./quran/events');
const islamicAutopost=require('./islamic-autopost');
const commands=require('./commands').concat(extras.commands,games.commands,communityTools.commands,automod.commands,transferTax.commands,[islamicAutopost.command],islamicAutopost.commands||[]);
const commandLocales=require('./command-locales');
const extrasCtx={admin:m=>admin(m),audit:(...a)=>audit(...a),settings:g=>settings(g)};
const i18n=require('./i18n');
const { BADGE_LABELS, createBadgeRoleSync } = require('./badge-role-sync');
const badgeRoleManager = createBadgeRoleSync({ delayMs: Math.max(500, Number(process.env.BADGE_ROLE_DELAY_MS) || 750) });
const { createActivityRoleSync } = require('./activity-role-sync');
const activityRoleManager = createActivityRoleSync({ delayMs: Math.max(500, Number(process.env.ACTIVITY_ROLE_DELAY_MS) || 900) });
const { accountAgeDays, shouldRejectNewAccount } = require('./account-age-protection');
const {startDashboard}=require('./dashboard');
const crypto=require('node:crypto');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'..','config.json'),'utf8'));
const token=process.env.DISCORD_TOKEN,clientId=process.env.CLIENT_ID,guildId=process.env.GUILD_ID;
if(!token||token==='PUT_BOT_TOKEN_HERE'||!clientId||clientId==='PUT_APPLICATION_ID_HERE'){console.error('Set DISCORD_TOKEN and CLIENT_ID in .env');process.exit(1);}
if(token!==token.trim()||/\s/.test(token)||!validSnowflake(clientId)){console.error('DISCORD_TOKEN must not contain whitespace and CLIENT_ID must be a valid Discord application ID.');process.exit(1);}
if(guildId && !validSnowflake(guildId)){console.error('GUILD_ID must be a valid 17–20 digit Discord server ID when set. Automatic slash-command sync still covers every joined server.');process.exit(1);}
// ── Runtime security setup ─────────────────────────────────────────────────
const { ok: envOk, issues: envIssues } = checkEnvironment(process.env);
printEnvironmentReport(envIssues);
if (!envOk) { console.error('[security] Fatal configuration errors above. Fix them and restart.'); process.exit(1); }
installLogRedaction([token, process.env.CLIENT_SECRET, process.env.SESSION_SECRET, process.env.ANTHROPIC_API_KEY].filter(Boolean));
const cmdLimiter = createLimiter({ max: 8, windowMs: 10_000, penaltyMs: 30_000 });
// ────────────────────────────────────────────────────────────────────────────
function validSnowflake(value){return typeof value==='string'&&/^\d{17,20}$/.test(value);}
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.GuildVoiceStates,GatewayIntentBits.GuildMessageReactions,GatewayIntentBits.GuildPresences],partials:[Partials.Channel,Partials.Message,Partials.Reaction]});
const validId=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
const { polishEmbedPayload } = require('./embed-style');

function mergeDeep(base, override) {
 if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
 const out = { ...base };
 for (const [key, value] of Object.entries(override)) out[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergeDeep(base?.[key] || {}, value) : value;
 return out;
}
function settings(guildId){const row=db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(guildId);let saved={};try{saved=row?JSON.parse(row.settings_json):{};}catch(e){console.error('Invalid stored guild settings:',guildId,e.message);}return mergeDeep(config,saved);}
function roleHas(member,ids){return Array.isArray(ids)&&ids.some(id=>validId(id)&&member.roles?.cache?.has(id));}
function admin(member){return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator)||roleHas(member,config.moderation?.adminRoleIds));}
function moderator(member){return admin(member)||roleHas(member,config.moderation?.moderatorRoleIds)||Boolean(member?.permissions?.has(PermissionFlagsBits.ModerateMembers));}
// Staff configured in config.json moderation.moderatorRoleIds may publish and manage public panels.
function canManagePanels(member){return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));}
// Panel publishing/configuration is intentionally restricted to members with Discord's Administrator permission; no manually configured role IDs are required.
const ACTION_PERMISSIONS={kick:PermissionFlagsBits.KickMembers,ban:PermissionFlagsBits.BanMembers,unban:PermissionFlagsBits.BanMembers,timeout:PermissionFlagsBits.ModerateMembers,warn:PermissionFlagsBits.ModerateMembers,warnings:PermissionFlagsBits.ModerateMembers,clear:PermissionFlagsBits.ManageMessages,lock:PermissionFlagsBits.ManageChannels,unlock:PermissionFlagsBits.ManageChannels,slowmode:PermissionFlagsBits.ManageChannels,'ticket-panel':PermissionFlagsBits.ManageChannels,'server-backup':PermissionFlagsBits.Administrator,'server-restore':PermissionFlagsBits.Administrator};
function canDo(member,action){const permission=ACTION_PERMISSIONS[action];return admin(member)||roleHas(member,config.moderation?.moderatorRoleIds)||Boolean(permission&&member?.permissions?.has(permission));}
function audit(guildId,actorId,action,targetId=null,details=''){try{db.prepare('INSERT INTO audit_logs(guild_id,actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)').run(guildId,actorId,action,targetId,String(details).slice(0,1000),Date.now());}catch(e){console.error('Audit write failed:',e.message);}}
// Patch guild text channels so automated posts, panels and welcome messages follow the server's default language.
// Personal language overrides are intentionally limited to replies directed to that user.
const localizedSendChannels=new WeakSet();
const localizedGuildFetchManagers=new WeakSet();
const localizedClientFetchManagers=new WeakSet();
function patchGuildChannelFetch(guild){
 if(!guild?.channels||localizedGuildFetchManagers.has(guild.channels)||typeof guild.channels.fetch!=='function')return;
 try{
  const manager=guild.channels,original=manager.fetch.bind(manager);
  manager.fetch=async (...args)=>{
   const result=await original(...args);
   if(result&&typeof result.values==='function'&&!result.guild){
    for(const channel of result.values())patchChannelLocalization(channel);
   }else if(result&&typeof result==='object')patchChannelLocalization(result);
   return result;
  };
  localizedGuildFetchManagers.add(manager);
 }catch(error){console.warn('Could not enable fetched-channel localization:',error.message);}
}
function patchClientChannelFetch(){
 if(!client?.channels||localizedClientFetchManagers.has(client.channels)||typeof client.channels.fetch!=='function')return;
 try{
  const manager=client.channels,original=manager.fetch.bind(manager);
  manager.fetch=async (...args)=>{
   const result=await original(...args);
   if(result&&typeof result==='object'&&typeof result.values==='function'&&!result.guild){
    for(const channel of result.values())patchChannelLocalization(channel);
   }else if(result&&typeof result==='object')patchChannelLocalization(result);
   return result;
  };
  localizedClientFetchManagers.add(manager);
 }catch(error){console.warn('Could not enable global fetched-channel localization:',error.message);}
}
function patchChannelLocalization(channel){
 if(!channel||!channel.guild||typeof channel.send!=='function'||localizedSendChannels.has(channel))return;
 try{
  const original=channel.send.bind(channel);
  channel.send=async (...args)=>{
const payload=args[0];
   // Message.reply() can pass a discord.js MessagePayload wrapper; its send fields are in .options.
   // Inspect the underlying options or valid embeds/Components V2 replies are falsely blocked as empty.
   const contentPayload=payload&&typeof payload==='object'&&payload.options&&typeof payload.options==='object'?payload.options:payload;
   const hasText=typeof contentPayload==='string'?Boolean(contentPayload.trim()):Boolean(contentPayload&&typeof contentPayload==='object'&&(
    (typeof contentPayload.content==='string'&&contentPayload.content.trim()) ||
    (Array.isArray(contentPayload.embeds)&&contentPayload.embeds.length) ||
    (Array.isArray(contentPayload.files)&&contentPayload.files.length) ||
    (Array.isArray(contentPayload.attachments)&&contentPayload.attachments.length) ||
    (Array.isArray(contentPayload.components)&&contentPayload.components.length) || contentPayload.poll || contentPayload.stickers
   ));
   if(!hasText){
    console.error(`[DiscordSendGuard] Blocked empty message in guild ${channel.guild.id}, channel ${channel.id}.`);
    throw new TypeError('Blocked empty Discord message before API request (50006).');
   }
   const guildLanguage=i18n.getServerLanguage(channel.guild.id)||i18n.normalizeLanguage(settings(channel.guild.id).logs?.language)||'en';
   try{
    if(contentPayload!==payload){
     const localizedOptions=await i18n.localizePayload(contentPayload,guildLanguage);
     payload.options=localizedOptions&&typeof localizedOptions==='object'?localizedOptions:contentPayload;
     args[0]=payload;
    }else args[0]=await i18n.localizePayload(payload,guildLanguage);
   }catch(error){console.warn('Channel message localization fallback:',error.message);args[0]=payload;}
   // If localization unexpectedly strips all visible content, send the original payload.
   const localized=args[0];
   const localizedContent=localized&&typeof localized==='object'&&localized.options&&typeof localized.options==='object'?localized.options:localized;
   const localizedHasText=typeof localizedContent==='string'?Boolean(localizedContent.trim()):Boolean(localizedContent&&typeof localizedContent==='object'&&((typeof localizedContent.content==='string'&&localizedContent.content.trim())||(Array.isArray(localizedContent.embeds)&&localizedContent.embeds.length)||(Array.isArray(localizedContent.files)&&localizedContent.files.length)||(Array.isArray(localizedContent.attachments)&&localizedContent.attachments.length)||(Array.isArray(localizedContent.components)&&localizedContent.components.length)||localizedContent.poll||localizedContent.stickers));
   if(!localizedHasText)args[0]=payload;
   try{args[0]=polishEmbedPayload(args[0],channel.guild.id,channel.guild.name);}catch(error){console.warn('Embed styling fallback:',error.message);args[0]=payload;}
   return original(...args);
  };
  localizedSendChannels.add(channel);
 }catch(error){console.warn('Could not enable channel localization:',error.message);}
}
function updateGuildSettings(guildId, patch){
 let saved={};try{const row=db.prepare('SELECT settings_json FROM guild_settings WHERE guild_id=?').get(guildId);if(row)saved=JSON.parse(row.settings_json)||{};}catch(e){console.error('Could not read guild settings before update:',e.message);}
 const next={...saved};for(const [key,value] of Object.entries(patch)){next[key]={...(next[key]&&typeof next[key]==='object'?next[key]:{}),...value};}
 db.prepare('INSERT INTO guild_settings(guild_id,settings_json) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET settings_json=excluded.settings_json').run(guildId,JSON.stringify(next));return next;
}
const CONTROL_PANELS={
 welcome:{label:'Welcome',emoji:'👋',channelPath:'welcome.channelId',rolePath:null,enabledPath:'welcome.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 goodbye:{label:'Goodbye',emoji:'🚪',channelPath:'goodbye.channelId',rolePath:null,enabledPath:'goodbye.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 logs:{label:'Event logs',emoji:'📋',channelPath:'logs.channelId',rolePath:null,enabledPath:'logs.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 autorole:{label:'Automatic role',emoji:'🎭',channelPath:null,rolePath:'autorole.roleId',enabledPath:'autorole.enabled'},
 verification:{label:'Member verification',emoji:'🛡️',channelPath:'verification.channelId',rolePath:'verification.roleId',enabledPath:'verification.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 tempVoice:{label:'Temporary voice rooms',emoji:'🔊',channelPath:'tempVoice.createChannelId',rolePath:null,enabledPath:'tempVoice.enabled',channelTypes:[ChannelType.GuildVoice],categoryPath:'tempVoice.categoryId'},
 tickets:{label:'Tickets',emoji:'🎫',channelPath:'tickets.categoryId',rolePath:'tickets.supportRoleId',enabledPath:'tickets.enabled',channelTypes:[ChannelType.GuildCategory]},
 suggestions:{label:'Suggestions',emoji:'💡',channelPath:'suggestions.channelId',rolePath:null,enabledPath:'suggestions.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 antiRaid:{label:'Anti-raid',emoji:'🚨',channelPath:'antiRaid.alertChannelId',rolePath:null,enabledPath:'antiRaid.enabled',channelTypes:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
 backups:{label:'Backups',emoji:'💾',channelPath:null,rolePath:null,enabledPath:null},
 stickers:{label:'Sticker & Emoji Tools',emoji:'🧩',channelPath:null,rolePath:null,enabledPath:null},
 serverClone:{label:'Server Clone',emoji:'🧬',channelPath:null,rolePath:null,enabledPath:null}
};
function getPath(obj,path){return path?path.split('.').reduce((v,k)=>v?.[k],obj):null;}
function setPathPatch(path,value){const parts=path.split('.'),out={};let node=out;for(let i=0;i<parts.length-1;i++)node=node[parts[i]]={};node[parts.at(-1)]=value;return out;}
function controlPayload(guild,system='welcome'){
 const selected=CONTROL_PANELS[system]?system:'welcome',panel=CONTROL_PANELS[selected],cfg=settings(guild.id);
 const currentChannel=getPath(cfg,panel.channelPath),currentRole=getPath(cfg,panel.rolePath);
 const currentEnabled=panel.enabledPath?Boolean(getPath(cfg,panel.enabledPath)):null;
 const description=[`**${panel.emoji} ${panel.label}**`,panel.channelPath?`Channel: ${validId(currentChannel)?`<#${currentChannel}>`:'Not configured'}`:'Channel: not required',panel.rolePath?`Role: ${validId(currentRole)?`<@&${currentRole}>`:'Not configured'}`:'Role: not required',currentEnabled===null?'Status: configured by its own requirements':`Status: ${currentEnabled?'🟢 Enabled':'🔴 Disabled'}`,selected==='tempVoice'?'Select the voice lobby below; category can be set through the selector when shown.':selected==='backups'?'Use the button below to download a JSON template of roles, channels and permission overwrites.':'Choose a channel or role below to save it immediately.'];
 const rows=[];
 const sysMenu=new StringSelectMenuBuilder().setCustomId('ctl:system').setPlaceholder('Choose a system to configure').addOptions(Object.entries(CONTROL_PANELS).map(([value,x])=>({label:x.label, value, emoji:x.emoji, default:value===selected})));
 rows.push(new ActionRowBuilder().addComponents(sysMenu));
 if(panel.channelPath){let channelTypes=panel.channelTypes||[ChannelType.GuildText,ChannelType.GuildAnnouncement];rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`ctl:channel:${selected}`).setPlaceholder(panel.categoryPath?'Choose voice lobby channel':'Choose channel/category').setChannelTypes(...channelTypes).setMinValues(1).setMaxValues(1)));}
 if(panel.rolePath)rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`ctl:role:${selected}`).setPlaceholder('Choose role').setMinValues(1).setMaxValues(1)));
 if(panel.categoryPath)rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`ctl:category:${selected}`).setPlaceholder('Choose temporary-room category (optional)').setChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)));
 const buttons=[];
 if(panel.enabledPath)buttons.push(new ButtonBuilder().setCustomId(`ctl:toggle:${selected}`).setLabel(currentEnabled?'Disable system':'Enable system').setStyle(currentEnabled?ButtonStyle.Danger:ButtonStyle.Success));
 if(selected==='verification')buttons.push(new ButtonBuilder().setCustomId('ctl:post-verification').setLabel('Publish verification panel').setStyle(ButtonStyle.Primary));
 if(selected==='backups')buttons.push(new ButtonBuilder().setCustomId('ctl:backup').setLabel('Download server template').setStyle(ButtonStyle.Primary));
 buttons.push(new ButtonBuilder().setCustomId(`ctl:refresh:${selected}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary));
 if(buttons.length)rows.push(new ActionRowBuilder().addComponents(buttons.slice(0,5)));
 return {embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle('『♔𝙄𝙈 𝐘𝙊𝐔𝐑 𝐃𝘼𝐃𝐃𝐘♔』 • Control Center').setDescription(description.join('\n\n')).setFooter({text:`Server: ${guild.name} • Settings are saved per server`}).setTimestamp()],components:rows};
}
const PANEL_ART={welcome:['Welcome & Onboarding','Configure the channel where new members are greeted.',0x4D64FF],goodbye:['Goodbye Messages','Choose where member departure messages are posted.',0xE25870],logs:['Event Logs','Route timestamped member, profile, voice and stream events to a dedicated channel.',0x4A90E2],autorole:['Automatic Role','Choose the role members receive when they join the server.',0x9F5FFF],verification:['Member Verification','Set the verification room and role, then publish the member verification prompt.',0x2ECC71],tempVoice:['Temporary Voice Rooms','Choose the voice lobby and category used for temporary rooms.',0x00B8A9],tickets:['Support Tickets','Choose the ticket category and staff support role.',0x3446A8],suggestions:['Suggestions','Choose the channel where community suggestions are collected.',0xFFC43D],antiRaid:['Anti-Raid Alerts','Choose where join-spike security alerts are posted.',0xEB5757],backups:['Server Backups','Export a JSON template of server roles, channels and permission overwrites. This does not copy messages or members.',0x788296],stickers:['Sticker & Emoji Tools','Review sticker and emoji tools. Use /server-clone to copy supported stickers and emojis between servers when the bot has the required permissions.',0x9B59B6],serverClone:['Server Clone','Clone supported server structure, roles, channels, emojis and stickers with /server-clone. Existing target content is preserved; review warnings after each run.',0x16A085]};
function dedicatedPanelEmbed(guild,system,imageUrl=null,actor=null){
 const meta=PANEL_ART[system]||PANEL_ART.welcome,panel=CONTROL_PANELS[system],cfg=settings(guild.id);
 const channel=getPath(cfg,panel.channelPath),role=getPath(cfg,panel.rolePath),enabled=panel.enabledPath?Boolean(getPath(cfg,panel.enabledPath)):null;
 const lines=[`**${meta[0]}**`,meta[1]];
 if(panel.channelPath)lines.push(`**Target:** ${validId(channel)?`<#${channel}>`:'Not configured yet'}`);else
 if(panel.rolePath)lines.push(`**Role:** ${validId(role)?`<@&${role}>`:'Not configured yet'}`);
 if(enabled!==null)lines.push(`**Status:** ${enabled?'🟢 Enabled':'🔴 Disabled'}`);
 lines.push('Use the controls below to change this system. Settings are saved immediately for this server.');
 const saved=settings(guild.id).controlPanels?.[system]||{},style=saved.style||'premium';
 const palette={premium:{color:meta[2],title:`✦ ${meta[0]} ✦`,footer:`${guild.name} • Dedicated system panel`},minimal:{color:0x2B2D31,title:meta[0],footer:`${guild.name} • ${system}`},neon:{color:0x00F5D4,title:`◈ ${meta[0].toUpperCase()} ◈`,footer:`${guild.name} • NEON CONTROL`},classic:{color:0x5865F2,title:`『 ${meta[0]} 』`,footer:`${guild.name} • Classic panel`},compact:{color:0x5865F2,title:`${meta[0]} • Status`,footer:`${guild.name} • Compact`},elegant:{color:0x9B59B6,title:`❖ ${meta[0]} ❖`,footer:`${guild.name} • Elegant panel`}};
 const theme=palette[style]||palette.premium;
 let body;
 if(style==='compact') body=[`${enabled===null?'⚙️ Configuration':enabled?'🟢 ENABLED':'🔴 DISABLED'}`,validId(channel)?`📍 Channel: <#${channel}>`:'📍 Channel: not configured',validId(role)?`🏷️ Role: <@&${role}>`:null].filter(Boolean).join('\n');
 else if(style==='minimal') body=`${meta[1]}\n\n${lines.slice(2).join('\n')}`;
 else if(style==='neon') body=`╭━━━━━━━━━━━━━━━━━━╮\n**${meta[0]}**\n╰━━━━━━━━━━━━━━━━━━╯\n\n${meta[1]}\n\n${lines.slice(2).join('\n\n')}\n\n> ⚡ Changes are saved per server.`;
 else if(style==='classic') body=`**━━━━━━━━ ${meta[0]} ━━━━━━━━**\n\n${meta[1]}\n\n${lines.slice(2).join('\n\n')}\n\n*Use the controls below to configure this panel.*`;
 else if(style==='elegant') body=`**❖ ${meta[0]}**\n*${meta[1]}*\n\n${lines.slice(2).join('\n\n')}\n\n୨୧ Settings are saved automatically`;
 else body=`**${meta[0]}**\n${meta[1]}\n\n${lines.slice(2).join('\n\n')}\n\n✦ Configure this system using the controls below.`;
 const embed=new EmbedBuilder().setColor(theme.color).setTitle(`『♔𝙄𝙈 𝐘𝙊𝐔𝐑 𝐃𝘼𝐃𝐃𝐘♔』 • ${theme.title}`).setDescription(body.slice(0,4000)).setFooter({text:theme.footer}).setTimestamp();
 if(actor)embed.setAuthor({name:`Published by ${actor.tag||actor.username}`,iconURL:actor.displayAvatarURL({size:128})});
 if(imageUrl)embed.setImage(imageUrl);else embed.setImage(`attachment://panel-${system}.png`);return embed;
}
function dedicatedPanelComponents(system){
 const panel=CONTROL_PANELS[system],rows=[];
 if(panel.channelPath){const types=panel.channelTypes||[ChannelType.GuildText,ChannelType.GuildAnnouncement];rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`sp:channel:${system}`).setPlaceholder(panel.categoryPath?'Select voice lobby':'Select target channel').setChannelTypes(...types).setMinValues(1).setMaxValues(1)));}
 if(panel.rolePath)rows.push(new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`sp:role:${system}`).setPlaceholder('Select role').setMinValues(1).setMaxValues(1)));
 if(panel.categoryPath)rows.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`sp:category:${system}`).setPlaceholder('Select temporary-room category').setChannelTypes(ChannelType.GuildCategory).setMinValues(1).setMaxValues(1)));
 const buttons=[];
 if(panel.enabledPath)buttons.push(new ButtonBuilder().setCustomId(`sp:toggle:${system}`).setLabel('Enable / Disable').setEmoji('⚙️').setStyle(ButtonStyle.Secondary));
 if(system==='verification')buttons.push(new ButtonBuilder().setCustomId('sp:verify:verification').setLabel('Publish Verify Prompt').setEmoji('🛡️').setStyle(ButtonStyle.Success));
 if(system==='backups')buttons.push(new ButtonBuilder().setCustomId('sp:backup:backups').setLabel('Download Backup').setEmoji('💾').setStyle(ButtonStyle.Primary));
 if(system==='stickers')buttons.push(new ButtonBuilder().setCustomId('sp:tools:stickers').setLabel('Sticker & Emoji Help').setEmoji('🧩').setStyle(ButtonStyle.Primary));
 if(system==='serverClone')buttons.push(new ButtonBuilder().setCustomId('sp:tools:serverClone').setLabel('Clone Server Guide').setEmoji('🧬').setStyle(ButtonStyle.Primary));
 buttons.push(new ButtonBuilder().setCustomId(`sp:refresh:${system}`).setLabel('Refresh Panel').setEmoji('🔄').setStyle(ButtonStyle.Secondary));
 for(let i=0;i<buttons.length;i+=5)rows.push(new ActionRowBuilder().addComponents(buttons.slice(i,i+5)));
 return rows;
}
function dedicatedPanelPayload(guild,system,imageUrl=null,actor=null){return {embeds:[dedicatedPanelEmbed(guild,system,imageUrl,actor)],components:dedicatedPanelComponents(system)};}
function saveDedicatedPanel(guildId,system,channelId,messageId,extra={}){const current=settings(guildId).controlPanels||{};updateGuildSettings(guildId,{controlPanels:{...current,[system]:{...(current[system]||{}),...extra,channelId,messageId,updatedAt:Date.now()}}});}
function panelImageChoice(guild,system,saved){const mode=saved?.imageMode||'default';if(mode==='custom'&&saved?.imageUrl)return {url:saved.imageUrl,files:[]};if(mode==='server'){const url=guild.iconURL({extension:'png',size:1024});if(url)return {url,files:[]};}const imagePath=path.join(__dirname,'..','assets','panels',`${system}.png`);if(!fs.existsSync(imagePath))throw new Error(`Missing panel artwork: ${system}`);return {url:null,files:[new AttachmentBuilder(imagePath,{name:`panel-${system}.png`})]};}
async function replaceDedicatedPanel(guild,system,actor){const saved=settings(guild.id).controlPanels?.[system]||{};if(!saved.channelId||!saved.messageId)throw new Error('Publish this panel with /publish-panel first.');const channel=guild.channels.cache.get(saved.channelId)||await guild.channels.fetch(saved.channelId).catch(()=>null);if(!channel?.isTextBased())throw new Error('Saved panel channel is unavailable; run /publish-panel again.');const perms=channel.permissionsFor(guild.members.me);if(!perms?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory]))throw new Error('The bot is missing required permissions in the panel channel.');const old=await channel.messages.fetch(saved.messageId).catch(()=>null);const art=panelImageChoice(guild,system,saved);const message=await channel.send({...dedicatedPanelPayload(guild,system,art.url,actor),files:art.files,allowedMentions:{parse:[]}});let pinned=false;if(perms.has(PermissionFlagsBits.ManageMessages)){try{await message.pin('Persistent public system panel');pinned=true;}catch(e){console.warn(`Could not pin ${system} panel:`,e.message);}}saveDedicatedPanel(guild.id,system,channel.id,message.id,{imageMode:saved.imageMode||'default',imageUrl:saved.imageUrl||null});if(old?.author?.id===client.user.id)await old.delete().catch(e=>console.warn(`Could not remove replaced ${system} panel:`,e.message));return {channel,message,pinned};}
const LOG_CHANNEL_GROUPS={
 members:{en:{name:'member-join-leave',label:'Members'},ar:{name:'دخول-وخروج-الأعضاء',label:'الأعضاء'}},
 messages:{en:{name:'chat-logs',label:'Chat Messages'},ar:{name:'سجل-الشات',label:'الرسائل'}},
 voice:{en:{name:'voice-logs',label:'Voice Activity'},ar:{name:'سجل-الفويس',label:'نشاط الصوت'}},
 camera:{en:{name:'camera-stream-logs',label:'Camera and Stream'},ar:{name:'سجل-الكاميرا-والاستريم',label:'الكاميرا والاستريم'}},
 moderation:{en:{name:'moderation-logs',label:'Moderation'},ar:{name:'سجل-الإدارة',label:'الإدارة'}},
 roles:{en:{name:'role-logs',label:'Role Changes'},ar:{name:'سجل-الرتب',label:'تغييرات الرتب'}},
 channels:{en:{name:'channel-logs',label:'Channel Changes'},ar:{name:'سجل-القنوات',label:'تغييرات القنوات'}},
 server:{en:{name:'server-settings-logs',label:'Server Settings'},ar:{name:'سجل-إعدادات-السيرفر',label:'إعدادات السيرفر'}},
 invites:{en:{name:'invite-logs',label:'Invites'},ar:{name:'سجل-الدعوات',label:'الدعوات'}},
 joins:{en:{name:'member-joins',label:'Member Joins'},ar:{name:'دخول-الأعضاء',label:'دخول الأعضاء'}},
 leaves:{en:{name:'member-leaves',label:'Member Leaves'},ar:{name:'خروج-الأعضاء',label:'خروج الأعضاء'}},
 edits:{en:{name:'message-edits',label:'Message Edits'},ar:{name:'تعديل-الرسائل',label:'تعديل الرسائل'}},
 deletions:{en:{name:'deletion-logs',label:'Message Deletions'},ar:{name:'حذف-الرسائل',label:'حذف الرسائل'}},
 bans:{en:{name:'member-bans',label:'Bans'},ar:{name:'حظر-الأعضاء',label:'حظر الأعضاء'}},
 kicks:{en:{name:'member-kicks',label:'Kicks'},ar:{name:'طرد-الأعضاء',label:'طرد الأعضاء'}},
 timeouts:{en:{name:'member-timeouts',label:'Timeouts'},ar:{name:'تايم-آوت',label:'التايم آوت'}},
 warnings:{en:{name:'member-warnings',label:'Warnings'},ar:{name:'تحذيرات-الأعضاء',label:'التحذيرات'}},
 nicknames:{en:{name:'nickname-changes',label:'Nickname Changes'},ar:{name:'تغيير-الألقاب',label:'تغيير الألقاب'}},
 usernames:{en:{name:'username-changes',label:'Username Changes'},ar:{name:'تغيير-أسماء-المستخدمين',label:'أسماء المستخدمين'}},
 avatars:{en:{name:'avatar-changes',label:'Avatar Changes'},ar:{name:'تغيير-الصور',label:'صور الأعضاء'}},
 boosts:{en:{name:'boost-updates',label:'Boost Updates'},ar:{name:'تعزيزات-السيرفر',label:'تعزيزات السيرفر'}},
 webhooks:{en:{name:'webhook-logs',label:'Webhooks'},ar:{name:'سجل-الويب-هوك',label:'الويب هوك'}},
 emojis:{en:{name:'emoji-logs',label:'Emoji Changes'},ar:{name:'سجل-الإيموجي',label:'الإيموجي'}},
 stickers:{en:{name:'sticker-logs',label:'Sticker Changes'},ar:{name:'سجل-الستيكرز',label:'الستيكرز'}},
 reactions:{en:{name:'reaction-logs',label:'Reactions'},ar:{name:'سجل-التفاعلات',label:'التفاعلات'}},
 threads:{en:{name:'thread-logs',label:'Threads'},ar:{name:'سجل-الثريدات',label:'الثريدات'}},
 stages:{en:{name:'stage-logs',label:'Stage Events'},ar:{name:'سجل-الستيج',label:'الستيج'}},
 integrations:{en:{name:'integration-logs',label:'Integrations'},ar:{name:'سجل-التكاملات',label:'التكاملات'}},
 automod:{en:{name:'automod-logs',label:'AutoMod'},ar:{name:'سجل-الحماية-التلقائية',label:'الحماية التلقائية'}},
 permissions:{en:{name:'permission-logs',label:'Permission Changes'},ar:{name:'سجل-الصلاحيات',label:'الصلاحيات'}},
 attachments:{en:{name:'attachment-logs',label:'Attachments'},ar:{name:'سجل-المرفقات',label:'المرفقات'}},
 mentions:{en:{name:'mention-logs',label:'Mentions'},ar:{name:'سجل-المنشنات',label:'المنشنات'}},
 links:{en:{name:'link-logs',label:'Links'},ar:{name:'سجل-الروابط',label:'الروابط'}},
 voiceDetails:{en:{name:'voice-detailed',label:'Detailed Voice Sessions'},ar:{name:'تفاصيل-جلسات-الفويس',label:'تفاصيل جلسات الصوت'}},
 streamDetails:{en:{name:'stream-detailed',label:'Stream Details'},ar:{name:'تفاصيل-الاستريم',label:'تفاصيل الاستريم'}},
 channelDetails:{en:{name:'channel-update-detailed',label:'Detailed Channel Changes'},ar:{name:'تفاصيل-تغييرات-القنوات',label:'تفاصيل تغييرات القنوات'}},
 roleDetails:{en:{name:'role-assign-detailed',label:'Detailed Role Assignments'},ar:{name:'تفاصيل-تعيين-الرتب',label:'تفاصيل تعيين الرتب'}},
 slash:{en:{name:'slash-commands',label:'Slash Commands'},ar:{name:'أوامر-السلاش',label:'أوامر السلاش'}},
 botCommands:{en:{name:'bot-commands',label:'Bot Commands'},ar:{name:'أوامر-البوت',label:'أوامر البوت'}},
 activity:{en:{name:'activity-tracker',label:'Activity Tracker'},ar:{name:'تتبع-النشاط',label:'تتبع النشاط'}},
 automodConfig:{en:{name:'automod-config',label:'AutoMod Configuration'},ar:{name:'إعدادات-الحماية',label:'إعدادات الحماية'}},
 memberLifetime:{en:{name:'member-lifetime',label:'Member Lifetime'},ar:{name:'مدة-بقاء-الأعضاء',label:'مدة بقاء الأعضاء'}},
 poll:{en:{name:'poll-logs',label:'Polls'},ar:{name:'سجل-الاستطلاعات',label:'الاستطلاعات'}},
 forum:{en:{name:'forum-posts',label:'Forum Posts'},ar:{name:'منشورات-المنتدى',label:'منشورات المنتدى'}},
 voiceRequests:{en:{name:'voice-requests',label:'Voice Requests'},ar:{name:'طلبات-الفويس',label:'طلبات الصوت'}},
 subscriptions:{en:{name:'subscription-logs',label:'Subscriptions'},ar:{name:'سجل-الاشتراكات',label:'الاشتراكات'}},
 onboarding:{en:{name:'onboarding-logs',label:'Onboarding'},ar:{name:'سجل-الانضمام',label:'إعدادات الانضمام'}},
 screening:{en:{name:'screening-logs',label:'Member Screening'},ar:{name:'سجل-التحقق',label:'التحقق من الأعضاء'}},
 safety:{en:{name:'safety-alerts',label:'Safety Alerts'},ar:{name:'تنبيهات-الأمان',label:'تنبيهات الأمان'}},
 botActivity:{en:{name:'bot-activity-logs',label:'Bot Activity'},ar:{name:'نشاط-البوتات',label:'نشاط البوتات'}},
 chat:{en:{name:'chat-message-details',label:'Chat Message Details'},ar:{name:'تفاصيل-رسائل-الشات',label:'تفاصيل رسائل الشات'}},
 leaderboard:{en:{name:'stream-leaderboard',label:'Stream Leaderboard'},ar:{name:'ترتيب-الاستريم',label:'ترتيب الاستريم'}},
 modDetails:{en:{name:'mod-details',label:'Moderation Details'},ar:{name:'تفاصيل-الإدارة',label:'تفاصيل الإدارة'}},
 memberMoves:{en:{name:'member-move-logs',label:'Member Moves'},ar:{name:'تنقلات-الأعضاء',label:'تنقلات الأعضاء'}},
 joinDetails:{en:{name:'join-details',label:'Join Details'},ar:{name:'تفاصيل-الدخول',label:'تفاصيل الدخول'}},
 voiceSessions:{en:{name:'voice-sessions',label:'Voice Sessions'},ar:{name:'جلسات-الفويس',label:'جلسات الفويس'}},
 everyoneMentions:{en:{name:'everyone-mentions',label:'Everyone Mentions'},ar:{name:'منشن-الجميع',label:'منشن الجميع'}},
 linkCategories:{en:{name:'link-categories',label:'Link Categories'},ar:{name:'تصنيفات-الروابط',label:'تصنيفات الروابط'}},
 kickDetails:{en:{name:'kick-details',label:'Kick Details'},ar:{name:'تفاصيل-الطرد',label:'تفاصيل الطرد'}},
 cameraDetails:{en:{name:'camera-details',label:'Camera Details'},ar:{name:'تفاصيل-الكاميرا',label:'تفاصيل الكاميرا'}},
 permRoleDetails:{en:{name:'perm-role-detailed',label:'Permission Role Details'},ar:{name:'تفاصيل-صلاحيات-الرتب',label:'تفاصيل صلاحيات الرتب'}},
 eventAttendance:{en:{name:'event-attendance',label:'Event Attendance'},ar:{name:'حضور-الفعاليات',label:'حضور الفعاليات'}},
 pinLogs:{en:{name:'pin-logs',label:'Pin Logs'},ar:{name:'سجل-التثبيت',label:'سجل التثبيت'}},
 voiceServer:{en:{name:'voice-server-logs',label:'Voice Server Logs'},ar:{name:'سجل-سيرفر-الصوت',label:'سجل سيرفر الصوت'}},
 antiSpam:{en:{name:'anti-spam-alerts',label:'Anti Spam Alerts'},ar:{name:'تنبيهات-مكافحة-السبام',label:'تنبيهات مكافحة السبام'}},
 keyword:{en:{name:'keyword-tracker',label:'Keyword Tracker'},ar:{name:'تتبع-الكلمات',label:'تتبع الكلمات'}},
 bulkDelete:{en:{name:'bulk-deletes',label:'Bulk Deletes'},ar:{name:'الحذف-الجماعي',label:'الحذف الجماعي'}},
 pollVotes:{en:{name:'poll-votes',label:'Poll Votes'},ar:{name:'تصويت-الاستطلاعات',label:'تصويت الاستطلاعات'}},
 soundboard:{en:{name:'soundboard-logs',label:'Soundboard'},ar:{name:'سجل-لوحة-الأصوات',label:'لوحة الأصوات'}},
 voiceRequestsDetailed:{en:{name:'voice-requests-detailed',label:'Detailed Voice Requests'},ar:{name:'تفاصيل-طلبات-الفويس',label:'تفاصيل طلبات الفويس'}},
 voiceSubcriptions:{en:{name:'voice-subscription-logs',label:'Voice Subscriptions'},ar:{name:'اشتراكات-الصوت',label:'اشتراكات الصوت'}},
 entitlement:{en:{name:'entitlement-logs',label:'Entitlements'},ar:{name:'سجل-الاستحقاقات',label:'الاستحقاقات'}},
 appCommands:{en:{name:'application-cmd-logs',label:'Application Commands'},ar:{name:'أوامر-التطبيقات',label:'أوامر التطبيقات'}},
 vanity:{en:{name:'vanity-updates',label:'Vanity Updates'},ar:{name:'تحديثات-الرابط-المخصص',label:'تحديثات الرابط المخصص'}},
 onboardingDetails:{en:{name:'onboarding-logs',label:'Onboarding Logs'},ar:{name:'سجل-تهيئة-الأعضاء',label:'تهيئة الأعضاء'}},
 discovery:{en:{name:'discovery-updates',label:'Discovery Updates'},ar:{name:'تحديثات-الاكتشاف',label:'تحديثات الاكتشاف'}},
 community:{en:{name:'community-updates',label:'Community Updates'},ar:{name:'تحديثات-المجتمع',label:'تحديثات المجتمع'}},
 monetization:{en:{name:'monetization-logs',label:'Monetization'},ar:{name:'سجل-تحقيق-الدخل',label:'تحقيق الدخل'}},
 guildSecurity:{en:{name:'guild-security-logs',label:'Guild Security'},ar:{name:'سجل-أمان-السيرفر',label:'أمان السيرفر'}},
 pollDetails:{en:{name:'poll-details',label:'Poll Details'},ar:{name:'تفاصيل-الاستطلاعات',label:'تفاصيل الاستطلاعات'}},
 voiceAdvanced:{en:{name:'voice-advanced',label:'Advanced Voice'},ar:{name:'الفويس-المتقدم',label:'الفويس المتقدم'}},
 moderationActions:{en:{name:'moderation-actions',label:'Moderation Actions'},ar:{name:'إجراءات-الإدارة',label:'إجراءات الإدارة'}},
 messageMentions:{en:{name:'message-mentions',label:'Message Mentions'},ar:{name:'منشنات-الرسائل',label:'منشنات الرسائل'}},
 memberScreening:{en:{name:'member-screening',label:'Member Screening'},ar:{name:'فحص-الأعضاء',label:'فحص الأعضاء'}},
 auditTrail:{en:{name:'audit-trail',label:'Audit Trail'},ar:{name:'سجل-التدقيق',label:'سجل التدقيق'}}
};
function logGroupForAction(action){
 if(!action)return 'server';
 if(action==='member_join')return 'joins'; if(action==='member_leave')return 'leaves';
 if(action==='message_edit')return 'edits'; if(action==='message_delete')return 'deletions';
 if(/^message_/.test(action))return 'messages'; if(/^voice_/.test(action))return /camera|video|stream/i.test(action)?'camera':'voice';
 if(/^stream_|camera|video/.test(action))return 'streamDetails'; if(/ban|banned|unbanned/.test(action))return 'bans';
 if(/kick/.test(action))return 'kicks'; if(/timeout/.test(action))return 'timeouts'; if(/warn/.test(action))return 'warnings';
 if(/nickname/.test(action))return 'nicknames'; if(/username/.test(action))return 'usernames'; if(/avatar|profile_image/.test(action))return 'avatars';
 if(/^member_role_/.test(action))return 'roleDetails'; if(/^role_/.test(action))return 'roles';
 if(/^channel_/.test(action))return 'channelDetails'; if(/invite/.test(action))return 'invites'; if(/webhook/.test(action))return 'webhooks';
 if(/reaction/.test(action))return 'reactions'; if(/thread/.test(action))return 'threads'; if(/stage/.test(action))return 'stages';
 if(/automod/.test(action))return 'automod'; if(/permission/.test(action))return 'permissions'; if(/attachment/.test(action))return 'attachments';
 if(/slash/.test(action))return 'slash'; if(/bot_command/.test(action))return 'botCommands'; if(/bot_message/.test(action))return 'botActivity';
 if(/presence_|profile_|guild_update|log_channel_/.test(action))return 'server'; return 'moderation';
}
async function sendGuildLog(guild, {title,description,color=0x3446A8,userId=null,action=null,details='',thumbnail=null}){
 try{
  const c=settings(guild.id);if(!c.logs?.enabled)return false;
  const group=logGroupForAction(action),channelId=c.logs?.channels?.[group]||c.logs?.channelId;
  if(!validId(channelId))return false;
  const channel=guild.channels.cache.get(channelId)||await guild.channels.fetch(channelId).catch(()=>null);
  if(!channel?.isTextBased()||!channel.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))return false;
  patchChannelLocalization(channel);
  const embed=new EmbedBuilder().setColor(color).setTitle(String(title).slice(0,256)).setDescription(String(description||'').slice(0,4000)).setTimestamp(new Date());
  if(userId)embed.addFields({name:'Member',value:`<@${userId}> (\`${userId}\`)`,inline:false});
  if(details)embed.addFields({name:'Details',value:String(details).slice(0,1000),inline:false});
  if(thumbnail)embed.setThumbnail(thumbnail);
  await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
  if(action)audit(guild.id,client.user?.id||'0',action,userId,details||description||title);
  return true;
 }catch(e){console.warn('Guild event log failed:',e.message);return false;}
}
async function renameManagedLogCatalog(guild, language){
 const lang=i18n.normalizeLanguage(language)||'en';
 const cfg=settings(guild.id),logs=cfg.logs||{},savedChannels=logs.channels||{};
 if(!Object.keys(savedChannels).length)return {renamed:0,categories:0,language:lang};
 const me=guild.members.me;
 if(!me?.permissions.has(PermissionFlagsBits.ManageChannels))throw new Error('The bot needs Manage Channels permission to rename existing log channels.');
 await guild.channels.fetch();
 let renamed=0,categoriesRenamed=0;
 const categoryGroups=[
  {id:'chat',ar:'📁・لوج-الشات',en:'📁・CHAT-LOGS',keys:['messages','edits','deletions','attachments','mentions','everyoneMentions','messageMentions','links','linkCategories','chat','botCommands','slash','appCommands','poll','pollVotes','pollDetails','pinLogs','bulkDelete']},
  {id:'voice',ar:'📁・لوج-الفويسات',en:'📁・VOICE-LOGS',keys:['voice','camera','voiceDetails','streamDetails','voiceRequests','voiceSessions','memberMoves','cameraDetails','voiceServer','soundboard','voiceRequestsDetailed','voiceSubcriptions','voiceAdvanced']},
  {id:'members',ar:'📁・لوج-الأعضاء',en:'📁・MEMBER-LOGS',keys:['members','joins','leaves','nicknames','usernames','avatars','boosts','memberLifetime','joinDetails','memberScreening','screening','onboarding','onboardingDetails','eventAttendance','leaderboard']},
  {id:'moderation',ar:'📁・لوج-الإدارة',en:'📁・MODERATION-LOGS',keys:['moderation','bans','kicks','timeouts','warnings','automod','automodConfig','antiSpam','keyword','moderationActions','modDetails','kickDetails','safety','guildSecurity','auditTrail']},
  {id:'rolesChannels',ar:'📁・لوج-الرتب-والشانلات',en:'📁・ROLE-CHANNEL-LOGS',keys:['roles','channels','channelDetails','roleDetails','permissions','permRoleDetails','webhooks','threads','stages','integrations']},
  {id:'server',ar:'📁・لوج-السيرفر',en:'📁・SERVER-LOGS',keys:['server','invites','vanity','discovery','community','subscriptions','entitlement','monetization']},
  {id:'community',ar:'📁・لوج-التفاعل',en:'📁・COMMUNITY-LOGS',keys:['reactions','emojis','stickers','forum','activity','poll','pollVotes','pollDetails','eventAttendance']},
  {id:'apps',ar:'📁・لوج-البوتات-والتطبيقات',en:'📁・BOT-APP-LOGS',keys:['botActivity','integrations','appCommands','slash','botCommands']}
 ];
 const keyToGroup=new Map();for(const group of categoryGroups)for(const key of group.keys)if(!keyToGroup.has(key))keyToGroup.set(key,group.id);
 const parentGroups=new Map();
 for(const [key,id] of Object.entries(savedChannels)){
  if(!validId(id))continue;
  const ch=guild.channels.cache.get(id)||await guild.channels.fetch(id).catch(()=>null);
  if(!ch||ch.type!==ChannelType.GuildText)continue;
  const definition=LOG_CHANNEL_GROUPS[key];
  if(!definition)continue;
  const target=lang==='ar'?definition.ar.name:lang==='en'?definition.en.name:safeLogChannelName(await i18n.translateRuntimeText(definition.en.name,lang));
  const topicBase=lang==='ar'?`سجلات ${definition.ar.label} التلقائية`:`Automatic ${definition.en.label} logs`;
  const topic=lang==='ar'||lang==='en'?topicBase:await i18n.translateRuntimeText(topicBase,lang);
  const edit={};if(ch.name!==target)edit.name=target;if(ch.topic!==topic)edit.topic=topic;
  if(Object.keys(edit).length){await ch.edit({...edit,reason:`Update managed log language to ${lang}; preserve channel and message history`});renamed++;}
  const groupId=keyToGroup.get(key)||'server';if(ch.parentId){if(!parentGroups.has(ch.parentId))parentGroups.set(ch.parentId,groupId);}
 }
 const safeCategoryName=value=>String(value||'logs').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'logs';
 for(const [categoryId,groupId] of parentGroups){
  const category=guild.channels.cache.get(categoryId)||await guild.channels.fetch(categoryId).catch(()=>null);
  const group=categoryGroups.find(x=>x.id===groupId);if(!category||category.type!==ChannelType.GuildCategory||!group)continue;
  const target=lang==='ar'?group.ar:lang==='en'?group.en:safeCategoryName(await i18n.translateRuntimeText(group.en,lang));
  if(category.name!==target){await category.edit({name:target,reason:`Update managed log category language to ${lang}; preserve contents`});categoriesRenamed++;}
 }
 updateGuildSettings(guild.id,{logs:{...logs,enabled:logs.enabled!==false,language:lang,lastLanguageRenameAt:Date.now()}});
 return {renamed,categories:categoriesRenamed,language:lang};
}
function safeLogChannelName(value){return String(value||'logs').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'logs';}
async function setupLogCatalog(guild, language, actorId){
 const lang=i18n.getServerLanguage(guild.id)||i18n.normalizeLanguage(language)||'en',baseLang=lang==='ar'?'ar':'en',me=guild.members.me;
 const safeChannelName=value=>String(value||'logs').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'logs';
 if(!me?.permissions.has(PermissionFlagsBits.ManageChannels))throw new Error('The bot needs Manage Channels permission to replace the managed log catalog.');
 const cfg=settings(guild.id),savedLogs=cfg.logs||{};
 if(Object.keys(savedLogs.channels||{}).length){
  const result=await renameManagedLogCatalog(guild,lang);
  const fresh=settings(guild.id).logs||savedLogs;
  const existingChannels={};for(const [key,id] of Object.entries(fresh.channels||{})){const ch=guild.channels.cache.get(id)||await guild.channels.fetch(id).catch(()=>null);if(ch)existingChannels[key]=ch;}
  const categories=[...new Set(Object.values(existingChannels).map(ch=>ch.parentId).filter(Boolean))].map(id=>guild.channels.cache.get(id)).filter(Boolean);
  const firstCategory=categories[0]||guild.channels.cache.get(fresh.categoryId)||null;
  return {category:firstCategory,categories,channels:existingChannels,language:lang,removed:[],renamed:result.renamed,categoriesRenamed:result.categories};
 }
 const baseOverwrites=[
  {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
  {id:me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]},
  {id:actorId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]}
 ];
 // Only retire channels/categories whose IDs were saved by this bot. Matching a name alone
 // is not proof of ownership and could otherwise delete a user's unrelated category.
 await guild.channels.fetch();
 const managedCategoryIds=new Set();
 for(const id of [savedLogs.categoryId,...(Array.isArray(savedLogs.categoryIds)?savedLogs.categoryIds:[])])if(validId(id))managedCategoryIds.add(id);
 const oldChannelIds=new Set(Object.values(savedLogs.channels||{}).filter(validId));
 // Build the replacement catalog before touching existing channels. This preserves the
 // working log destination if Discord rejects a create request or the server hits its limit.
 const removed=[];
 const categoryGroups=[
  {id:'chat',ar:'📁・لوج-الشات',en:'📁・CHAT-LOGS',keys:['messages','edits','deletions','attachments','mentions','everyoneMentions','messageMentions','links','linkCategories','chat','botCommands','slash','appCommands','poll','pollVotes','pollDetails','pinLogs','bulkDelete']},
  {id:'voice',ar:'📁・لوج-الفويسات',en:'📁・VOICE-LOGS',keys:['voice','camera','voiceDetails','streamDetails','voiceRequests','voiceSessions','memberMoves','cameraDetails','voiceServer','soundboard','voiceRequestsDetailed','voiceSubcriptions','voiceAdvanced']},
  {id:'members',ar:'📁・لوج-الأعضاء',en:'📁・MEMBER-LOGS',keys:['members','joins','leaves','nicknames','usernames','avatars','boosts','memberLifetime','joinDetails','joinDetails','memberScreening','screening','onboarding','onboardingDetails','eventAttendance','leaderboard']},
  {id:'moderation',ar:'📁・لوج-الإدارة',en:'📁・MODERATION-LOGS',keys:['moderation','bans','kicks','timeouts','warnings','automod','automodConfig','antiSpam','keyword','moderationActions','modDetails','kickDetails','safety','guildSecurity','auditTrail']},
  {id:'rolesChannels',ar:'📁・لوج-الرتب-والشانلات',en:'📁・ROLE-CHANNEL-LOGS',keys:['roles','channels','channelDetails','roleDetails','permissions','permRoleDetails','webhooks','threads','stages','integrations']},
  {id:'server',ar:'📁・لوج-السيرفر',en:'📁・SERVER-LOGS',keys:['server','invites','vanity','discovery','community','subscriptions','entitlement','monetization']},
  {id:'community',ar:'📁・لوج-التفاعل',en:'📁・COMMUNITY-LOGS',keys:['reactions','emojis','stickers','forum','activity','poll','pollVotes','pollDetails','eventAttendance']},
  {id:'apps',ar:'📁・لوج-البوتات-والتطبيقات',en:'📁・BOT-APP-LOGS',keys:['botActivity','integrations','appCommands','slash','botCommands']}
 ];
 const keyToCategory=new Map();for(const group of categoryGroups)for(const key of group.keys)if(!keyToCategory.has(key))keyToCategory.set(key,group.id);
 // Route any future/new log types into a safe general server category instead of leaving them unconfigured.
 for(const key of Object.keys(LOG_CHANNEL_GROUPS))if(!keyToCategory.has(key))keyToCategory.set(key,'server');
 const localizedCategoryNames=new Map(await Promise.all(categoryGroups.map(async group=>[group.id,lang==='ar'?group.ar:lang==='en'?group.en:safeChannelName(await i18n.translateRuntimeText(group.en,lang))])));
 const localizedLogDefinitions=new Map(await Promise.all(Object.entries(LOG_CHANNEL_GROUPS).map(async ([key,definition])=>{
  const base=definition[baseLang]||definition.en;
  const name=lang==='ar'?definition.ar.name:lang==='en'?definition.en.name:safeChannelName(await i18n.translateRuntimeText(definition.en.name,lang));
  const baseTopic=lang==='ar'?`سجلات ${definition.ar.label} التلقائية`:`Automatic ${definition.en.label} logs`;
  const topic=lang==='ar'||lang==='en'?baseTopic:await i18n.translateRuntimeText(baseTopic,lang);
  return [key,{name,topic,base}];
 })));
 const categories=[],channels={},categoryById=new Map();
 try{
  for(const group of categoryGroups){
   const categoryName=localizedCategoryNames.get(group.id);
   const category=await guild.channels.create({name:categoryName,type:ChannelType.GuildCategory,permissionOverwrites:baseOverwrites,reason:'Create organized per-topic log categories within Discord limits'});
   categories.push(category);categoryById.set(group.id,category);
  }
  for(const [key,definition] of Object.entries(LOG_CHANNEL_GROUPS)){
   const groupId=keyToCategory.get(key)||'server';const parent=categoryById.get(groupId)||categories[0];
   const localizedDefinition=localizedLogDefinitions.get(key)||{};
   const channelName=localizedDefinition.name||definition[baseLang]?.name||definition.en.name;
   const topic=localizedDefinition.topic||`Automatic ${definition.en.label} logs`;
   const channelOverwrites=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:me.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.ReadMessageHistory]},
    {id:actorId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory]}
   ];
   const channel=await guild.channels.create({name:channelName,type:ChannelType.GuildText,parent:parent.id,permissionOverwrites:channelOverwrites,topic,reason:'Create log channel under its dedicated topic category'});
   channels[key]=channel.id;
  }
 }catch(error){
  // Roll back only newly-created resources; the previous catalog/settings are left intact.
  for(const id of Object.values(channels).reverse()){const ch=guild.channels.cache.get(id);if(ch)await ch.delete('Rollback incomplete managed log catalog rebuild').catch(()=>{});}
  for(const category of categories.reverse())await category.delete('Rollback incomplete managed log catalog rebuild').catch(()=>{});
  throw new Error(`${error.message||'Log catalog creation failed'}; newly created log channels/categories were rolled back where Discord allowed it. The previous catalog was preserved if it existed; logging remains on its prior configuration unless the new catalog was saved.`);
 }
 updateGuildSettings(guild.id,{logs:{enabled:true,language:lang,categoryId:categories[0].id,categoryIds:categories.map(c=>c.id),channels,channelId:channels.server,trackPresence:true,trackProfileImages:true,trackVoice:true,trackStreams:true,trackMessages:true,trackModeration:true,trackChannels:true,trackRoles:true,trackInvites:true,trackReactions:true,trackThreads:true,trackStages:true,trackIntegrations:true,trackAttachments:true,trackMentions:true,trackLinks:true,catalogVersion:5,categoryLayout:'topic-categories',lastSetupAt:Date.now(),lastSetupBy:actorId}});
 // Retire the old catalog only after the replacement has been saved and enabled.
 for(const id of oldChannelIds){
  const ch=guild.channels.cache.get(id)||await guild.channels.fetch(id).catch(()=>null);
  if(!ch||ch.type===ChannelType.GuildCategory)continue;
  if(!managedCategoryIds.has(ch.parentId)&&!oldChannelIds.has(ch.id))continue;
  try{await ch.delete('Retire previous managed log catalog after successful replacement');removed.push(ch.name);}catch(error){console.warn(`Could not remove old log channel ${ch.id}:`,error.message);}
 }
 for(const id of managedCategoryIds){
  const oldCategory=guild.channels.cache.get(id)||await guild.channels.fetch(id).catch(()=>null);
  if(!oldCategory||oldCategory.type!==ChannelType.GuildCategory)continue;
  const children=guild.channels.cache.filter(ch=>ch.parentId===id);
  for(const child of children.values()){
   try{await child.delete('Retire child from previous managed log catalog');removed.push(child.name);}catch(error){console.warn(`Could not remove old log child ${child.id}:`,error.message);}
  }
  try{await oldCategory.delete('Retire previous managed log category after successful replacement');}catch(error){console.warn(`Could not remove old log category ${oldCategory.id}:`,error.message);}
 }
 return {category:categories[0],categories,channels:Object.fromEntries(Object.entries(channels).map(([key,id])=>[key,guild.channels.cache.get(id)])),language:lang,removed};
}
function activityStream(presence){return (presence?.activities||[]).find(a=>a.type===1)||null;}

const ticketCreationLocks=new Set();
const recentJoins=new Map(),raidAlertAt=new Map();
const accountAgeProtectedMembers = new Set();
const accountAgeKickQueues = new Map();
const accountAgeLastKickAt = new Map();
async function rateLimitedAccountAgeKick(member, reason) {
 const guildId = member.guild.id;
 const previous = accountAgeKickQueues.get(guildId) || Promise.resolve();
 const current = previous.catch(() => {}).then(async () => {
  const delay = Math.max(1000, Number(process.env.ACCOUNT_AGE_KICK_DELAY_MS) || 1500);
  const elapsed = Date.now() - (accountAgeLastKickAt.get(guildId) || 0);
  if (elapsed < delay) await new Promise(resolve => setTimeout(resolve, delay - elapsed));
  await member.kick(reason);
  accountAgeLastKickAt.set(guildId, Date.now());
 });
 accountAgeKickQueues.set(guildId, current);
 try { await current; } finally { if (accountAgeKickQueues.get(guildId) === current) accountAgeKickQueues.delete(guildId); }
}
// In-memory voice session tracking. Sessions are intentionally marked unknown after a restart.
const voiceSessionStarts=new Map();
const inviteSnapshots=new Map();
function voiceSessionKey(guildId,userId){return `${guildId}:${userId}`;}
function formatDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000));const days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60),secs=seconds%60;return [days?`${days}d`:null,hours?`${hours}h`:null,minutes?`${minutes}m`:null,`${secs}s`].filter(Boolean).join(' ');}
async function refreshInviteSnapshot(guild){try{const invites=await guild.invites.fetch();inviteSnapshots.set(guild.id,new Map(invites.map(inv=>[inv.code,{uses:inv.uses||0,inviterId:inv.inviter?.id||null,channelId:inv.channelId||null,maxUses:inv.maxUses||0}])));}catch(e){console.warn(`Invite snapshot unavailable for ${guild.id}:`,e.message);}}
async function resolveJoiningInvite(guild){try{const before=inviteSnapshots.get(guild.id),fresh=await guild.invites.fetch();let used=null;if(before){for(const invite of fresh.values()){const old=before.get(invite.code);if(old&&Number(invite.uses||0)>Number(old.uses||0)){used=invite;break;}}}inviteSnapshots.set(guild.id,new Map(fresh.map(inv=>[inv.code,{uses:inv.uses||0,inviterId:inv.inviter?.id||null,channelId:inv.channelId||null,maxUses:inv.maxUses||0}])));return used;}catch(e){console.warn('Welcome invite attribution unavailable:',e.message);return null;}}
function welcomeCardSvg(member,invite){const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));const name=esc(member.displayName||member.user.username).slice(0,32),server=esc(member.guild.name).slice(0,40),avatar=member.user.displayAvatarURL({extension:'png',size:256});const date=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});const inviter=invite?.inviter?esc(invite.inviter.username):'Unknown / غير معروف';return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#101522"/><stop offset=".55" stop-color="#28233b"/><stop offset="1" stop-color="#090d18"/></linearGradient><linearGradient id="edge"><stop stop-color="#ff68b4"/><stop offset="1" stop-color="#ffc4d7"/></linearGradient><radialGradient id="glow"><stop stop-color="#11d7e9" stop-opacity=".55"/><stop offset="1" stop-color="#11d7e9" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="420" rx="38" fill="url(#bg)"/><rect x="9" y="9" width="1182" height="402" rx="32" fill="none" stroke="url(#edge)" stroke-width="10"/><circle cx="110" cy="85" r="220" fill="url(#glow)"/><image href="${avatar}" x="55" y="75" width="270" height="270" preserveAspectRatio="xMidYMid slice"/><rect x="55" y="75" width="270" height="270" rx="34" fill="none" stroke="#42e6ed" stroke-width="5"/><text x="370" y="112" font-family="Arial,sans-serif" font-size="30" fill="#f9a8d4">WELCOME • أهلاً وسهلاً</text><text x="365" y="195" font-family="Arial,sans-serif" font-size="58" font-weight="700" fill="#ffffff">${name}</text><text x="370" y="245" font-family="Arial,sans-serif" font-size="29" fill="#d7dbea">${server}</text><rect x="365" y="278" width="760" height="54" rx="18" fill="#ffffff" fill-opacity=".09"/><text x="390" y="313" font-family="Arial,sans-serif" font-size="22" fill="#ffffff">Invited by / دعا بواسطة: ${inviter.slice(0,36)}</text><text x="370" y="375" font-family="Arial,sans-serif" font-size="21" fill="#c4cada">Member #${member.guild.memberCount} • ${date}</text></svg>`;}

function coins(n){return `${Number(n).toLocaleString('en-US')} coins`;}
function acct(gid,id){db.prepare('INSERT OR IGNORE INTO economy(guild_id,user_id,balance,last_daily) VALUES(?,?,?,0)').run(gid,id,Number(config.economy?.startingBalance||0));return db.prepare('SELECT * FROM economy WHERE guild_id=? AND user_id=?').get(gid,id);}
async function apiJson(url){const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`API returned ${r.status}`);return r.json();}
function snapshotChannel(ch){
 const allowedTypes=new Set([ChannelType.GuildCategory,ChannelType.GuildText,ChannelType.GuildVoice,ChannelType.GuildAnnouncement,ChannelType.GuildForum,ChannelType.GuildStageVoice,ChannelType.GuildMedia]);
 if(!allowedTypes.has(ch.type))return null;
 const overwrites=[...ch.permissionOverwrites.cache.values()].filter(o=>o.type===0).map(o=>({id:o.id,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}));
 return {id:ch.id,name:ch.name,type:ch.type,position:ch.rawPosition,parentId:ch.parentId||null,topic:ch.topic||null,nsfw:Boolean(ch.nsfw),rateLimitPerUser:Number(ch.rateLimitPerUser||0),bitrate:ch.bitrate||null,userLimit:ch.userLimit||0,overwrites,availableTags:Array.isArray(ch.availableTags)?ch.availableTags.map(t=>({name:t.name,moderated:Boolean(t.moderated),emojiName:t.emojiName||null})):[],defaultSortOrder:ch.defaultSortOrder??null,defaultForumLayout:ch.defaultForumLayout??null};
}
async function makeServerBackup(guild){
 await guild.roles.fetch();await guild.channels.fetch();
 return {format:'im-your-daddy-server-template',version:1,createdAt:new Date().toISOString(),sourceGuild:{id:guild.id,name:guild.name},roles:[...guild.roles.cache.values()].filter(r=>r.id!==guild.id&&!r.managed).sort((a,b)=>a.position-b.position).map(r=>({id:r.id,name:r.name,color:r.color,hoist:r.hoist,mentionable:r.mentionable,permissions:r.permissions.bitfield.toString(),position:r.position})),channels:[...guild.channels.cache.values()].map(snapshotChannel).filter(Boolean).sort((a,b)=>a.position-b.position)};
}
async function restoreServerTemplate(guild,data,options={}){
 if(!['im-your-daddy-server-template','kshk-server-template'].includes(data?.format)||data?.version!==1||!Array.isArray(data.roles)||!Array.isArray(data.channels))throw new Error('Unsupported or invalid backup template.');
 if(data.roles.length>250||data.channels.length>500)throw new Error('Template exceeds safe restore limits (250 roles / 500 channels).');
 if(!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)||!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels))throw new Error('The bot needs Manage Roles and Manage Channels permissions.');
 const roleMap=new Map([[String(data.sourceGuild?.id||''),guild.id]]),categoryMap=new Map(),channelMap=new Map(),createdRoles=[],createdChannels=[];
 try{
  for(const role of [...data.roles].sort((a,b)=>Number(b.position)-Number(a.position))){
   if(!role||typeof role.name!=='string'||!role.name.trim())continue;
   const rawPermissions=BigInt(role.permissions||'0');const permissions=(options.preserveAdministrator?rawPermissions:(rawPermissions & ~BigInt(PermissionFlagsBits.Administrator))).toString();
   const created=await guild.roles.create({name:role.name.slice(0,100),color:Number(role.color)||0,hoist:Boolean(role.hoist),mentionable:Boolean(role.mentionable),permissions,reason:`bot template restore by ${guild.client.user.tag}`});createdRoles.push(created);roleMap.set(String(role.id),created.id);
  }
  const channels=[...data.channels].sort((a,b)=>Number(a.type===ChannelType.GuildCategory?0:1)-Number(b.type===ChannelType.GuildCategory?0:1)||Number(a.position)-Number(b.position));
  for(const channel of channels){
   if(!channel||typeof channel.name!=='string'||!Number.isInteger(channel.type))continue;
   const supported=new Set([ChannelType.GuildCategory,ChannelType.GuildText,ChannelType.GuildVoice,ChannelType.GuildAnnouncement,ChannelType.GuildForum,ChannelType.GuildStageVoice,ChannelType.GuildMedia]);if(!supported.has(channel.type))continue;
   const permissionOverwrites=(Array.isArray(channel.overwrites)?channel.overwrites:[]).flatMap(o=>{const target=roleMap.get(String(o.id));if(!target)return[];return[{id:target,type:0,allow:BigInt(o.allow||'0'),deny:BigInt(o.deny||'0')}];});
   const opts={name:channel.name.slice(0,100),type:channel.type,permissionOverwrites,reason:`bot template restore by ${guild.client.user.tag}`};
   if(channel.type!==ChannelType.GuildCategory){if(channel.parentId&&categoryMap.has(String(channel.parentId)))opts.parent=categoryMap.get(String(channel.parentId));if([ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildForum,ChannelType.GuildMedia].includes(channel.type)){if(channel.topic)opts.topic=String(channel.topic).slice(0,1024);opts.nsfw=Boolean(channel.nsfw);if(channel.type===ChannelType.GuildForum){opts.defaultThreadRateLimitPerUser=Math.max(0,Math.min(21600,Number(channel.rateLimitPerUser)||0));if(Array.isArray(channel.availableTags)&&channel.availableTags.length)opts.availableTags=channel.availableTags.slice(0,20).map(t=>({name:String(t.name).slice(0,20),moderated:Boolean(t.moderated),emojiName:t.emojiName||undefined}));if(channel.defaultSortOrder!=null)opts.defaultSortOrder=channel.defaultSortOrder;if(channel.defaultForumLayout!=null)opts.defaultForumLayout=channel.defaultForumLayout;}else opts.rateLimitPerUser=Math.max(0,Math.min(21600,Number(channel.rateLimitPerUser)||0));}if([ChannelType.GuildVoice,ChannelType.GuildStageVoice].includes(channel.type)){if(Number(channel.bitrate)>0)opts.bitrate=Math.max(8000,Math.min(Number(channel.bitrate),Number(guild.maximumBitrate)||96000));opts.userLimit=Math.max(0,Math.min(99,Number(channel.userLimit)||0));}}
   const created=await guild.channels.create(opts);createdChannels.push(created);channelMap.set(String(channel.id),created.id);if(channel.type===ChannelType.GuildCategory)categoryMap.set(String(channel.id),created.id);
  }
  return {rolesMade:createdRoles.length,channelsMade:createdChannels.length,roleMap,channelMap};
 }catch(error){
  for(const channel of createdChannels.reverse())await channel.delete('Rollback incomplete bot template restore').catch(()=>{});
  for(const role of createdRoles.reverse())await role.delete('Rollback incomplete bot template restore').catch(()=>{});
  throw new Error(`${error.message||'Restore failed'}; newly created items were rolled back where Discord allowed it.`);
 }
}

async function fetchAssetBuffer(url, maxBytes=8*1024*1024){
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw new Error(`Asset download failed (${response.status})`);
 const declared=Number(response.headers.get('content-length')||0);if(declared>maxBytes)throw new Error('Asset exceeds the configured size limit.');
 const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>maxBytes)throw new Error('Asset exceeds the configured size limit.');return buffer;
}
async function cloneGuildSettings(source,target,channelMap,warnings){
 const options={name:source.name,verificationLevel:source.verificationLevel,explicitContentFilter:source.explicitContentFilter,defaultMessageNotifications:source.defaultMessageNotifications,afkTimeout:source.afkTimeout,preferredLocale:source.preferredLocale,premiumProgressBarEnabled:source.premiumProgressBarEnabled,systemChannelFlags:source.systemChannelFlags?.bitfield};
 if(typeof source.description==='string')options.description=source.description;
 if(source.systemChannelId&&channelMap.has(source.systemChannelId))options.systemChannelId=channelMap.get(source.systemChannelId);
 if(source.afkChannelId&&channelMap.has(source.afkChannelId))options.afkChannelId=channelMap.get(source.afkChannelId);
 if(source.rulesChannelId&&channelMap.has(source.rulesChannelId))options.rulesChannelId=channelMap.get(source.rulesChannelId);
 if(source.publicUpdatesChannelId&&channelMap.has(source.publicUpdatesChannelId))options.publicUpdatesChannelId=channelMap.get(source.publicUpdatesChannelId);
 if(source.iconURL({extension:'png',size:1024}))try{options.icon=await fetchAssetBuffer(source.iconURL({extension:'png',size:1024}));}catch(e){warnings.push(`Server icon not copied: ${e.message}`);}
 if(source.bannerURL({extension:'png',size:1024}))try{options.banner=await fetchAssetBuffer(source.bannerURL({extension:'png',size:1024}));}catch(e){warnings.push(`Server banner not copied: ${e.message}`);}
 try{await target.edit(options,{reason:`Server clone from ${source.id} requested by authorized administrator`});}catch(e){warnings.push(`Some server-level settings were not copied (community/verification restrictions may apply): ${e.message}`);}
}
async function cloneGuildExpressions(source,target,warnings){
 try{await source.emojis.fetch();}catch(e){warnings.push(`Could not read source emojis: ${e.message}`);}
 for(const emoji of source.emojis.cache.values()){
  if(emoji.managed)continue;
  try{const url=emoji.imageURL({extension:emoji.animated?'gif':'png',size:256});const buffer=await fetchAssetBuffer(url,1024*1024);await target.emojis.create({attachment:buffer,name:emoji.name,reason:`Clone emoji from ${source.id}`});}
  catch(e){warnings.push(`Emoji ${emoji.name} skipped: ${e.message}`);}
 }
 try{await source.stickers.fetch();}catch(e){warnings.push(`Could not read source stickers: ${e.message}`);}
 for(const sticker of source.stickers.cache.values()){
  try{const buffer=await fetchAssetBuffer(sticker.url,512*1024);await target.stickers.create({file:buffer,name:sticker.name,tags:sticker.tags||'✨',description:sticker.description||`Copied from ${source.id}`.slice(0,100),reason:`Clone sticker from ${source.id}`});}
  catch(e){warnings.push(`Sticker ${sticker.name} skipped: ${e.message}`);}
 }
}
async function cloneGuildStructure(source,target){
 await Promise.all([source.roles.fetch(),source.channels.fetch(),target.roles.fetch(),target.channels.fetch()]);
 const sourceData=await makeServerBackup(source);
 const communityRequired=new Set([ChannelType.GuildForum,ChannelType.GuildMedia,ChannelType.GuildStageVoice]);
 const targetIsCommunity=target.features?.includes('COMMUNITY');
 const skippedTypes=sourceData.channels.filter(c=>communityRequired.has(c.type)&&!targetIsCommunity);
 const warnings=[];
 if(skippedTypes.length){const skipIds=new Set(skippedTypes.map(c=>c.id));sourceData.channels=sourceData.channels.filter(c=>!skipIds.has(c.id));warnings.push(`${skippedTypes.length} forum/media/stage channel(s) were skipped because the target server is not configured as a Community server.`);}
 // A clone is additive: it never deletes target content. Refuse to accidentally clone into itself.
 if(source.id===target.id)throw new Error('Source and target server IDs must be different.');
 if(!target.members.me?.permissions.has([PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageChannels]))throw new Error('The bot needs Administrator, Manage Roles, and Manage Channels in the target server.');
 const result=await restoreServerTemplate(target,sourceData,{preserveAdministrator:true});
 // Restore source role ordering after all roles exist; Discord may clamp positions below the bot role.
 try{const rolePositions=sourceData.roles.filter(r=>result.roleMap.has(String(r.id))).map(r=>({role:result.roleMap.get(String(r.id)),position:r.position}));if(rolePositions.length)await target.roles.setPositions(rolePositions);}catch(e){warnings.push(`Role positions could not be fully matched: ${e.message}`);}
 try{const channelPositions=sourceData.channels.filter(c=>result.channelMap.has(String(c.id))).map(c=>({channel:result.channelMap.get(String(c.id)),position:c.position}));if(channelPositions.length)await target.channels.setPositions(channelPositions);}catch(e){warnings.push(`Channel ordering could not be fully matched: ${e.message}`);}
 await cloneGuildSettings(source,target,result.channelMap,warnings);
 for(const role of sourceData.roles){try{const sourceRole=source.roles.cache.get(String(role.id)),targetRole=target.roles.cache.get(result.roleMap.get(String(role.id)));if(sourceRole?.iconURL()&&targetRole){const icon=await fetchAssetBuffer(sourceRole.iconURL({extension:'png',size:128}),512*1024);await targetRole.edit({icon,reason:`Clone role icon from ${source.id}`});}}catch(e){warnings.push(`Role icon for ${role.name} was not copied: ${e.message}`);}}
 await cloneGuildExpressions(source,target,warnings);
 return {...result,warnings};
}
async function syncGuildSlashCommands(guild, language) {
 const rest = new REST({ version: '10' }).setToken(token);
 // A REST request should never leave startup looking frozen indefinitely.
 if (typeof rest.setTimeoutTime === 'function') rest.setTimeoutTime(30000);
 const route = Routes.applicationGuildCommands(clientId, guild.id);
 console.log(`[Commands] Preparing ${commands.length} command definitions for guild ${guild.id}.`);
 const body = commands.map(command => i18n.localizeCommandPayload(command.toJSON()));
 const localizedBody = body.map(commandBody => commandLocales.localizeCommandNames(commandBody, language));
 body.splice(0, body.length, ...localizedBody);
 const chatInputBody = body.filter(command => Number(command.type || 1) === 1);
 // The image-source manager is a required user-facing command. Fail loudly before
 // registration if a future refactor accidentally drops it from the assembled list.
 const imageSourceCommandName = 'image-source';
 const requiredImageCommandNames = language === 'ar'
  ? ['image-source', 'image-collect', 'مصادر_الصور_الإضافية', 'جمع_الصور_الإضافي']
  : ['image-source', 'image-collect', 'image-sources', 'collect-images'];
 const hasImageSourceDefinition = chatInputBody.some(command => command.name === imageSourceCommandName);
 if (!hasImageSourceDefinition) throw new Error(`Required image-source slash command is missing from assembled definitions (expected /${imageSourceCommandName}).`);
 const missingRequiredImageDefinitions = requiredImageCommandNames.filter(name => !chatInputBody.some(command => command.name === name));
 if (missingRequiredImageDefinitions.length) throw new Error(`Required image commands missing from assembled definitions: ${missingRequiredImageDefinitions.map(name => `/${name}`).join(', ')}`);
 console.log(`[Commands] Required image commands are present for guild ${guild.id}: ${requiredImageCommandNames.map(name => `/${name}`).join(', ')}.`);
 const duplicateNames = chatInputBody.map(command => command.name).filter((name, index, all) => all.indexOf(name) !== index);
 if (duplicateNames.length) throw new Error(`Duplicate slash command names after localization: ${[...new Set(duplicateNames)].join(', ')}`);
 console.log(`[Commands] Requesting existing guild commands from Discord (${chatInputBody.length} desired).`);
 let existingResponse;
 try {
  existingResponse = await rest.get(route);
  console.log(`[Commands] Existing-command request completed for guild ${guild.id}.`);
 } catch (error) {
  console.error(`[Commands] Could not fetch existing commands for guild ${guild.id}:`, error?.message || error);
  if (error?.rawError) console.error('[Commands] Discord API details:', JSON.stringify(error.rawError));
  throw error;
 }
 const existing = Array.isArray(existingResponse) ? existingResponse : [];
 const chatInput = existing.filter(command => Number(command.type || 1) === 1);
 const wantedNames = new Set(chatInputBody.map(command => command.name));
 const byName = new Map(chatInput.map(command => [command.name, command]));
 const stale = chatInput.filter(command => !wantedNames.has(command.name));
 let created = 0, updated = 0, removed = 0;
 // Compare semantic command data, not JSON property insertion order or API-added defaults.
 // Discord may return the same command with keys ordered differently and nullable/default fields.
 function normalizeCommandValue(value) {
  if (Array.isArray(value)) return value.map(item => normalizeCommandValue(item)).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of Object.keys(value).sort()) {
   const item = value[key];
   if (item === undefined || item === null) continue;
   if (key === 'dm_permission' && item === true) continue;
   if (key === 'nsfw' && item === false) continue;
   const normalized = normalizeCommandValue(item);
   if (normalized === undefined) continue;
   if (Array.isArray(normalized) && normalized.length === 0) continue;
   result[key] = normalized;
  }
  return result;
 }
 const comparable = value => JSON.stringify(normalizeCommandValue({
  name:value.name,
  description:value.description,
  options:value.options,
  default_member_permissions:value.default_member_permissions,
  dm_permission:value.dm_permission,
  nsfw:value.nsfw,
  contexts:value.contexts,
  integration_types:value.integration_types
 }));
 // Discord caps guild chat-input commands at 100. Validate the complete desired set
 // before making one atomic bulk-overwrite request, so new servers do not wait through
 // dozens of sequential POST requests before their slash commands appear.
 if (chatInputBody.length > 100) {
  throw new Error(`Discord allows at most 100 guild chat-input commands; this bot defines ${chatInputBody.length}.`);
 }
 created = 0; updated = 0; removed = 0;
 for (const commandBody of chatInputBody) {
  const current = byName.get(commandBody.name);
  if (!current) created++;
  else if (comparable(current) !== comparable(commandBody)) updated++;
 }
 removed = stale.length;
 // If Discord already has the exact desired command definitions, do not issue a
 // needless bulk overwrite. This avoids repeatedly rewriting every guild's commands
 // on each restart and keeps already-working commands available during startup.
 if (created === 0 && updated === 0 && removed === 0) {
  if (requiredImageCommandNames.some(name => !byName.has(name))) throw new Error(`Discord existing-command response is missing required image commands for guild ${guild.id}: ${requiredImageCommandNames.filter(name => !byName.has(name)).join(', ')}.`);
  console.log(`[Commands] Guild ${guild.name} (${guild.id}) already has all ${chatInputBody.length} desired slash commands, including /${imageSourceCommandName}; no overwrite needed.`);
  return {created:0,updated:0,removed:0,unchanged:chatInputBody.length};
 }
 // Preserve any existing user/message context-menu commands while replacing the
 // bot's chat-input command set in one API request. Discord applies this atomically.
 const nonChatInputCommands = existing.filter(command => Number(command.type || 1) !== 1);
 const bulkBody = [...chatInputBody, ...nonChatInputCommands.map(command => {
  const copy = { ...command };
  delete copy.id;
  delete copy.application_id;
  delete copy.guild_id;
  delete copy.version;
  delete copy.permissions;
  return copy;
 })];
 const syncStartedAt = Date.now();
 console.log(`[Commands] Bulk-registering ${chatInputBody.length} slash commands for guild ${guild.id} in one request (created=${created}, updated=${updated}, stale=${removed}).`);
 let registeredResponse;
 try {
  // Discord applies this bulk overwrite atomically. Log the response boundary so a
  // stalled request can be distinguished from a successful registration.
  registeredResponse = await rest.put(route, { body: bulkBody });
  console.log(`[Commands] Bulk registration response received for guild ${guild.id}; starting independent Discord read-back verification.`);
 } catch (error) {
  console.error(`[Commands] Bulk slash registration failed for guild ${guild.id}:`, error?.message || error);
  if (error?.rawError) console.error('[Commands] Discord API details:', JSON.stringify(error.rawError));
  throw error;
 }
 const registeredCommands = Array.isArray(registeredResponse) ? registeredResponse : [];
 const registeredSlashCommands = registeredCommands.filter(command => Number(command.type || 1) === 1);
 const registeredNames = new Set(registeredSlashCommands.map(command => command.name));
 const missingAfterSync = chatInputBody.map(command => command.name).filter(name => !registeredNames.has(name));
 const missingImageSource = requiredImageCommandNames.some(name => !registeredNames.has(name));
 const duplicateReturnedNames = registeredSlashCommands.map(command => command.name).filter((name, index, all) => all.indexOf(name) !== index);
 if (!Array.isArray(registeredResponse) || registeredSlashCommands.length !== chatInputBody.length || missingAfterSync.length || duplicateReturnedNames.length || missingImageSource) {
  const details = [
   `expected ${chatInputBody.length} slash commands`,
   `Discord returned ${registeredSlashCommands.length}`,
   missingAfterSync.length ? `missing: ${missingAfterSync.join(', ')}` : '',
   duplicateReturnedNames.length ? `duplicate: ${[...new Set(duplicateReturnedNames)].join(', ')}` : '',
   missingImageSource ? `required image commands missing from Discord response: ${requiredImageCommandNames.filter(name => !registeredNames.has(name)).join(', ')}` : ''
  ].filter(Boolean).join('; ');
  throw new Error(`Discord accepted the bulk request but the returned command set failed verification for guild ${guild.id}: ${details}`);
 }
 console.log(`[Commands] Bulk response contains ${registeredSlashCommands.length}/${chatInputBody.length} slash commands for guild ${guild.id}; independently reading commands back from Discord.`);
 let readBackResponse;
 try {
  readBackResponse = await rest.get(route);
 } catch (error) {
  console.error(`[Commands] Independent read-back failed for guild ${guild.id}:`, error?.message || error);
  throw new Error(`Bulk registration response was received, but independent verification GET failed for guild ${guild.id}: ${error?.message || error}`);
 }
 const readBackCommands = Array.isArray(readBackResponse) ? readBackResponse.filter(command => Number(command.type || 1) === 1) : [];
 const readBackNames = new Set(readBackCommands.map(command => command.name));
 const readBackMissing = chatInputBody.map(command => command.name).filter(name => !readBackNames.has(name));
 const missingRequiredImageCommands = requiredImageCommandNames.filter(name => !readBackNames.has(name));
 if (!Array.isArray(readBackResponse) || readBackCommands.length !== chatInputBody.length || readBackMissing.length || missingRequiredImageCommands.length) {
  throw new Error(`Independent Discord read-back verification failed for guild ${guild.id}: expected ${chatInputBody.length}, found ${readBackCommands.length}; missing: ${readBackMissing.join(', ') || 'none'}; missing image commands: ${missingRequiredImageCommands.join(', ') || 'none'}.`);
 }
 console.log(`[Commands] INDEPENDENT READ-BACK VERIFIED: ${readBackCommands.length}/${chatInputBody.length} commands exist on Discord for guild ${guild.id}; image commands verified: ${requiredImageCommandNames.map(name => `/${name}`).join(', ')} (${Date.now()-syncStartedAt} ms total).`);
 // Save desired-definition fingerprints only after Discord independently confirms the command set.
 const saveFingerprint = db.prepare('INSERT INTO bot_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 for (const commandBody of chatInputBody) {
  const fingerprint = crypto.createHash('sha256').update(comparable(commandBody)).digest('hex');
  saveFingerprint.run(`slash-command-definition:${guild.id}:${commandBody.name}`, fingerprint, Date.now());
 }
 console.log(`[Commands] Guild ${guild.name} (${guild.id}) language=${language}: ${created} created, ${updated} updated, ${removed} stale removed (atomic bulk sync).`);
 return {created,updated,removed};
}

// Serialize per-guild slash synchronization so startup registration and guildCreate
// cannot race and attempt to create the same commands at the same time.
const guildSlashSyncInFlight = new Map();
async function syncGuildSlashCommandsOnce(guild, language) {
 const active = guildSlashSyncInFlight.get(guild.id);
 if (active) return active;
 const task = syncGuildSlashCommands(guild, language);
 guildSlashSyncInFlight.set(guild.id, task);
 try {
  return await task;
 } finally {
  if (guildSlashSyncInFlight.get(guild.id) === task) guildSlashSyncInFlight.delete(guild.id);
 }
}

async function registerSlashCommands() {
 if (!clientId) throw new Error('CLIENT_ID is required to register slash commands.');
 // Always refresh and sync every guild the bot belongs to. GUILD_ID is retained
 // as a validated legacy setting, but must not silently leave other existing servers
 // without slash commands after a restart.
 let targetGuilds = [];
 try {
  const fetched = await client.guilds.fetch();
  targetGuilds = [...fetched.values()];
 } catch (error) {
  console.error('[Commands] Guild-list fetch failed; using cached guilds without global-command cleanup:', error?.message || error);
  targetGuilds = [...client.guilds.cache.values()];
 }
 if (!targetGuilds.length) throw new Error(`No accessible guilds found for slash-command registration. Check bot guild access and invite. Cached guilds=${client.guilds.cache.size}.`);
 let successful = 0;
 let failed = 0;
 for (const guild of targetGuilds) {
  try {
   const language = i18n.getServerLanguage(guild.id) || 'en';
   console.log(`[Commands] Sync started for ${guild.name} (${guild.id}), language=${language}.`);
   console.log(`[Commands] Starting sync operation for guild ${guild.id}.`);
   await syncGuildSlashCommandsOnce(guild, language);
   successful++;
   console.log(`[Commands] Guild ${guild.id} sync operation returned successfully.`);
  } catch (error) {
   failed++;
   console.error(`[Commands] Failed to sync guild ${guild.id} (${guild.name}):`, error?.message || error);
   if (error?.rawError) console.error('[Commands] Discord API details:', JSON.stringify(error.rawError));
  }
 }
 // Per-guild command sets must be authoritative; remove this bot's old global chat-input commands
 // only after at least one guild has been synced, preventing duplicate English + localized entries.
 if (successful === targetGuilds.length && !validId(guildId) && targetGuilds.length > 0) {
  const rest = new REST({ version: '10' }).setToken(token);
  if (typeof rest.setTimeoutTime === 'function') rest.setTimeoutTime(60000);
  const route = Routes.applicationCommands(clientId);
  console.log('[Commands] Fetching legacy global commands before cleanup.');
  const globalResponse = await rest.get(route);
  const globalCommands = Array.isArray(globalResponse) ? globalResponse : [];
  let removedGlobal = 0;
  for (const current of globalCommands.filter(command => Number(command.type || 1) === 1)) {
   await rest.delete(Routes.applicationCommand(clientId, current.id));
   removedGlobal++;
  }
  console.log(`[Commands] Removed ${removedGlobal} legacy global chat-input commands after per-guild registration.`);
 }
 console.log(`[Commands] Per-guild command registration complete: ${successful}/${targetGuilds.length} guilds synced; ${failed} failed.`);
}
client.once('clientReady', async () => {
 console.log(`Logged in as ${client.user.tag}`);

 // Restore saved bot activity without allowing an old/malformed preference to block startup.
 try {
  const saved = db.prepare('SELECT value FROM bot_preferences WHERE key=?').get('status')?.value;
  if (saved) {
   const data = JSON.parse(saved);
   const { ActivityType } = require('discord.js');
   const types = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing };
   if (types[data.type] !== undefined && data.text) client.user.setPresence({ activities: [{ name: String(data.text).slice(0, 128), type: types[data.type] }], status: 'online' });
  }
 } catch (error) { console.warn('Could not restore saved bot activity:', error.message); }

 try { db.prepare('UPDATE giveaways SET ending=0 WHERE ended=0').run(); }
 catch (error) { console.error('Could not recover pending giveaways:', error.message); }

 // Start independent services immediately. A slow Discord command sync or optional integration
 // must not prevent extras or the dashboard from starting.
 try {
  dashboardServer = startDashboard(client, config);
  if (dashboardServer) console.log('[Startup] Dashboard started.');
 } catch (error) { console.error('[Startup] Dashboard failed to start:', error?.message || error); }

 

 try { extras.start(client, extrasCtx); console.log('[Startup] Extra systems started.'); }
 catch (error) { console.error('[Startup] Extra systems failed to start:', error?.message || error); }


 try { quranFeatures.registerEvents(client); console.log('[Startup] Quran audio features started.'); }
 catch (error) { console.error('[Startup] Quran audio features failed to start:', error?.message || error); }
 try { islamicAutopost.start(client); } catch (error) { console.error('[Startup] Islamic auto-post failed:', error?.message || error); }

 

 // Command registration is intentionally asynchronous; progress and per-guild failures are logged
 // by registerSlashCommands so a long sync does not block the rest of the bot.
 console.log('[Startup] Starting slash command registration.');
 void registerSlashCommands().then(() => {
  console.log('[Startup] Slash command registration finished.');
 }).catch(error => {
  console.error('[Startup] Slash registration failed:', error?.message || error);
  if (error?.rawError) console.error('[Startup] Discord API details:', JSON.stringify(error.rawError));
 });

 // Giveaway scheduler: claim each due giveaway transactionally so overlapping ticks cannot end it twice.
 setInterval(async () => {
  try {
   const due = db.prepare('SELECT * FROM giveaways WHERE ended=0 AND ending=0 AND ends_at<=?').all(Date.now());
   for (const gw of due) {
    const claim = db.prepare('UPDATE giveaways SET ending=1 WHERE id=? AND ended=0 AND ending=0').run(gw.id);
    if (!claim.changes) continue;
    try {
     const channel = await client.channels.fetch(gw.channel_id);
     const message = await channel.messages.fetch(gw.message_id);
     const reaction = message.reactions.cache.get('🎉');
     const users = reaction ? await reaction.users.fetch() : null;
     const entrants = users ? [...users.values()].filter(user => !user.bot) : [];
     const winner = entrants.length ? entrants[crypto.randomInt(0, entrants.length)] : null;
     const resultText = winner
      ? `🎉 Giveaway ended! Prize: **${gw.prize}** — winner: ${winner}!`
      : `Giveaway ended for **${gw.prize}**, but there were no eligible entries.`;
     const fallbackPayload = { embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('🎉 Giveaway ended').setDescription(resultText)], components: [] };
     const finalPayload = await i18n.localizePayload(fallbackPayload, i18n.getServerLanguage(channel.guildId) || 'en').catch(() => fallbackPayload);
     await message.edit(finalPayload);
     db.prepare('UPDATE giveaways SET ended=1,ending=0 WHERE id=?').run(gw.id);
    } catch (error) {
     try { db.prepare('UPDATE giveaways SET ending=0 WHERE id=? AND ended=0').run(gw.id); }
     catch (dbError) { console.error('Could not reset giveaway state:', dbError.message); }
     console.error('Could not finalize giveaway; it will retry:', error.message);
    }
   }
  } catch (error) { console.error('Giveaway scheduler:', error); }
 }, 15000).unref?.();
});
client.on('error',console.error);
process.on('unhandledRejection',e=>console.error('Unhandled rejection:',e));
let shuttingDown=false;let dashboardServer=null;
async function shutdown(signal){if(shuttingDown)return;shuttingDown=true;console.log(`Received ${signal}; shutting down cleanly.`);try{if(dashboardServer)await new Promise(resolve=>dashboardServer.close(resolve));}catch{}try{client.destroy();}catch{}try{db.close();}catch{}process.exit(0);}
process.once('SIGINT',()=>shutdown('SIGINT'));
process.once('SIGTERM',()=>shutdown('SIGTERM'));
// Automatic activity roles are configured independently per guild in the dashboard.
client.on('presenceUpdate', async (oldPresence, newPresence) => {
 try {
  const member = newPresence?.member;
  if (!member || member.user?.bot || !newPresence?.guild) return;
  const activitySettings = settings(newPresence.guild.id).activityRoles || {};
  if (!activitySettings.enabled) return;
  const result = await activityRoleManager.syncMember(member, newPresence, activitySettings);
  if (result.added || result.removed || result.errors) {
   console.log(`[ActivityRoles] ${member.user.tag} in ${newPresence.guild.id}: +${result.added}, -${result.removed}, errors=${result.errors}.`);
  }
 } catch (error) { console.warn('[ActivityRoles] Presence reconciliation failed:', error.message); }
});

// Presence, profile and voice audit trail. Enable Guild Presences in the Discord Developer Portal as well.
client.on('presenceUpdate',async(oldPresence,newPresence)=>{
 try{
  const guild=newPresence?.guild||oldPresence?.guild,member=newPresence?.member||oldPresence?.member;if(!guild||!member||member.user.bot)return;
  const before=oldPresence?.status||'offline',after=newPresence?.status||'offline';
  if(before!==after){const label={online:'Online',idle:'Idle',dnd:'Do Not Disturb',offline:'Offline'};await sendGuildLog(guild,{title:'Member presence changed',description:`${member.user.tag} changed status: **${label[before]||before} → ${label[after]||after}**`,color:after==='online'?0x2ECC71:after==='dnd'?0xE74C3C:after==='idle'?0xF1C40F:0x747F8D,userId:member.id,action:'presence_change',details:`${before} -> ${after}`});}
  const oldStream=activityStream(oldPresence),newStream=activityStream(newPresence);
  const oldKey=oldStream?`${oldStream.name}|${oldStream.url||''}`:'';const newKey=newStream?`${newStream.name}|${newStream.url||''}`:'';
  if(oldKey!==newKey){if(newStream)await sendGuildLog(guild,{title:'Stream started / detected',description:`${member.user.tag} started or became visible as streaming **${newStream.name||'a stream'}**${newStream.url?`\n${newStream.url}`:''}`,color:0x9146FF,userId:member.id,action:'stream_started',details:newStream.url||newStream.name||'Streaming activity'});else if(oldStream)await sendGuildLog(guild,{title:'Stream ended / no longer visible',description:`${member.user.tag} is no longer showing the previous streaming activity **${oldStream.name||'stream'}**.`,color:0x747F8D,userId:member.id,action:'stream_ended',details:oldStream.url||oldStream.name||'Streaming activity ended'});}
 }catch(e){console.warn('Presence log handler failed:',e.message);}
});
client.on('userUpdate',async(oldUser,newUser)=>{
 try{if(oldUser.avatar===newUser.avatar&&oldUser.banner===newUser.banner)return;for(const guild of client.guilds.cache.values()){
  const member=guild.members.cache.get(newUser.id);if(!member)continue;
  const changed=[];if(oldUser.avatar!==newUser.avatar)changed.push('avatar/profile picture');if(oldUser.banner!==newUser.banner)changed.push('profile banner');
  await sendGuildLog(guild,{title:'Member profile image changed',description:`${newUser.tag} changed their ${changed.join(' and ')}.`,color:0x3498DB,userId:newUser.id,action:'profile_image_change',details:changed.join(', '),thumbnail:newUser.displayAvatarURL({size:256})});
 }}catch(e){console.warn('Profile image log handler failed:',e.message);}
});
// Account-age gate. Mark the joining member synchronously so other join handlers skip welcome/autorole if the account is rejected.
client.on('guildMemberAdd', async member => {
 const c = settings(member.guild.id);
 const protection = c.accountAgeProtection || {};
 if (!protection.enabled || member.user.bot) return;
 const minimumDays = Math.max(1, Math.min(365, Math.floor(Number(protection.minDays) || 7)));
 if (!shouldRejectNewAccount(member.user, minimumDays)) return;
 const ageDays = accountAgeDays(member.user);
 const key = `${member.guild.id}:${member.id}`;
 accountAgeProtectedMembers.add(key);
 try {
  await member.send({ content: `⚠️ Your account is ${ageDays} day(s) old. **${member.guild.name}** requires accounts to be at least ${minimumDays} days old. You may rejoin once your account meets this requirement.` }).catch(() => {});
  const reason = `Automatic account-age protection: account age ${ageDays} days; minimum ${minimumDays} days.`;
  await rateLimitedAccountAgeKick(member, reason);
  audit(member.guild.id, client.user.id, 'account_age_kick', member.id, `age_days=${ageDays}; minimum_days=${minimumDays}`);
  const channelId = validId(protection.logChannelId) ? protection.logChannelId : (c.logs?.enabled && validId(c.logs?.channelId) ? c.logs.channelId : null);
  const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
  if (channel?.isTextBased()) {
   const embed = new EmbedBuilder().setColor(0xE74C3C).setTitle('🛡️ New-account protection: member kicked')
    .setDescription(`Removed ${member.user.tag} because the account is younger than the configured minimum.`)
    .addFields(
     { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
     { name: 'Account age', value: `${ageDays} day(s)`, inline: true },
     { name: 'Minimum age', value: `${minimumDays} day(s)`, inline: true },
     { name: 'Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F> (<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>)`, inline: false }
    ).setTimestamp();
   await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(error => console.warn('[AccountAge] Log send failed:', error.message));
  }
 } catch (error) {
  console.error(`[AccountAge] Could not kick ${member.id} in ${member.guild.id}:`, error.message);
  const channelId = validId(protection.logChannelId) ? protection.logChannelId : (c.logs?.enabled && validId(c.logs?.channelId) ? c.logs.channelId : null);
  const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
  if (channel?.isTextBased()) await channel.send({ content: `⚠️ Account-age protection could not remove <@${member.id}>. Check the bot's Kick Members permission and role hierarchy.`, allowedMentions: { users: [] } }).catch(() => {});
 } finally {
  setTimeout(() => accountAgeProtectedMembers.delete(key), 60_000).unref?.();
 }
});

// Automatic badge/booster role reconciliation. Role mappings are stored independently per guild.
client.on('guildMemberAdd', async member => {
 try {
  const result = await badgeRoleManager.syncMember(member, settings(member.guild.id).badgeRoles || {});
  if (result.added || result.removed || result.errors) {
   console.log(`[BadgeRoles] Join sync for ${member.user.tag} in ${member.guild.id}: +${result.added}, -${result.removed}, errors=${result.errors}.`);
  }
 } catch (error) {
  console.error(`[BadgeRoles] Join sync failed for ${member.id} in ${member.guild.id}:`, error.message || error);
 }
});
client.on('guildMemberUpdate', async (oldMember, newMember) => {
 if (oldMember.premiumSinceTimestamp === newMember.premiumSinceTimestamp) return;
 try {
  const result = await badgeRoleManager.syncMember(newMember, settings(newMember.guild.id).badgeRoles || {});
  if (result.added || result.removed || result.errors) {
   console.log(`[BadgeRoles] Boost-change sync for ${newMember.user.tag} in ${newMember.guild.id}: +${result.added}, -${result.removed}, errors=${result.errors}.`);
  }
 } catch (error) {
  console.error(`[BadgeRoles] Boost-change sync failed for ${newMember.id} in ${newMember.guild.id}:`, error.message || error);
 }
});

client.on('guildMemberAdd',async m=>{if(accountAgeProtectedMembers.has(`${m.guild.id}:${m.id}`))return;try{const c=settings(m.guild.id);const created=Math.floor(m.user.createdTimestamp/1000),joined=Math.floor((m.joinedTimestamp||Date.now())/1000);await sendGuildLog(m.guild,{title:'Member joined server',description:`${m.user.tag} joined **${m.guild.name}**.`,color:0x2ECC71,userId:m.id,action:'member_join',details:`Username: ${m.user.username}; Display name: ${m.displayName||m.user.username}; Account created: <t:${created}:F>; Joined: <t:${joined}:F>; Member count: ${m.guild.memberCount}; Bot: ${m.user.bot}`,thumbnail:m.user.displayAvatarURL({size:256,dynamic:true})});if(c.antiRaid?.enabled){const now=Date.now(),windowMs=Math.max(5000,Number(c.antiRaid.intervalMs)||15000),key=m.guild.id;const recent=(recentJoins.get(key)||[]).filter(t=>now-t<windowMs);recent.push(now);recentJoins.set(key,recent);const threshold=Math.max(3,Number(c.antiRaid.joinThreshold)||8);if(recent.length>=threshold&&now-(raidAlertAt.get(key)||0)>windowMs){raidAlertAt.set(key,now);const alertId=validId(c.antiRaid.alertChannelId)?c.antiRaid.alertChannelId:c.logs?.channelId;const alert=alertId?m.guild.channels.cache.get(alertId):null;if(alert?.isTextBased())await alert.send({content:`⚠️ Anti-raid alert: ${recent.length} members joined within ${Math.ceil(windowMs/1000)} seconds. No automatic punishment was applied.`,allowedMentions:{parse:[]}}).catch(()=>{});audit(m.guild.id,client.user.id,'anti_raid_alert',null,`${recent.length} joins in ${windowMs}ms`);}}if(c.autorole?.enabled&&validId(c.autorole.roleId))await m.roles.add(c.autorole.roleId,'Configured autorole').catch(console.error);if(c.welcome?.enabled&&validId(c.welcome.channelId)){const ch=m.guild.channels.cache.get(c.welcome.channelId);if(ch?.isTextBased()){const created=Math.floor(m.user.createdTimestamp/1000),joined=Math.floor((m.joinedTimestamp||Date.now())/1000);const embed=new EmbedBuilder().setColor(0x4D64FF).setAuthor({name:`Welcome, ${m.user.username}`,iconURL:m.user.displayAvatarURL({size:256})}).setTitle(`👋 Welcome to ${m.guild.name}`).setDescription((c.welcome.message||'Welcome {user} to **{server}**!').replaceAll('{user}',`${m}`).replaceAll('{server}',m.guild.name)).addFields({name:'Username',value:m.user.username,inline:true},{name:'Display name',value:m.displayName||m.user.username,inline:true},{name:'Account created',value:`<t:${created}:F>\n(<t:${created}:R>)`,inline:false},{name:'Joined server',value:`<t:${joined}:F>\n(<t:${joined}:R>)`,inline:false},{name:'Member number',value:String(m.guild.memberCount),inline:true},{name:'User ID',value:m.id,inline:true}).setThumbnail(m.user.displayAvatarURL({size:512,dynamic:true})).setFooter({text:`${m.guild.name} • Member welcome`}).setTimestamp();if(m.user.bannerURL({size:1024}))embed.setImage(m.user.bannerURL({size:1024}));else embed.setImage(m.guild.iconURL({size:1024})||null);const joiningInvite=await resolveJoiningInvite(m.guild);const inviterText=joiningInvite?.inviter?`${joiningInvite.inviter} (${joiningInvite.inviter.tag})`:'Unknown / غير معروف (invite tracking unavailable)';embed.setDescription(`👋 أهلاً ${m} في **${m.guild.name}**!
Welcome ${m} to **${m.guild.name}**!\n\n👥 عدد الأعضاء / Members: **${m.guild.memberCount}**\n🎟️ الداعي / Invited by: ${inviterText}\n🔗 Invite uses / استخدامات الدعوة: **${joiningInvite?.uses??'غير متاح / N/A'}**`);const card=new AttachmentBuilder(Buffer.from(welcomeCardSvg(m,joiningInvite),'utf8'),{name:'welcome-card.svg',description:'Bilingual member welcome card'});embed.setImage('attachment://welcome-card.svg');await ch.send({embeds:[embed],files:[card],allowedMentions:{users:[m.id],roles:[],everyone:false}});}}}catch(e){console.error(e);}});
client.on('guildMemberRemove',async m=>{try{const c=settings(m.guild.id),created=Math.floor(m.user.createdTimestamp/1000),joined=Math.floor((m.joinedTimestamp||Date.now())/1000);const embed=new EmbedBuilder().setColor(0xE25870).setAuthor({name:`Goodbye, ${m.user.username}`,iconURL:m.user.displayAvatarURL({size:256})}).setTitle(`🚪 Member left ${m.guild.name}`).setDescription((c.goodbye?.message||'**{user}** has left the server.').replaceAll('{user}',m.user.tag).replaceAll('{server}',m.guild.name)).addFields({name:'Username',value:m.user.username,inline:true},{name:'Display name',value:m.displayName||m.user.username,inline:true},{name:'Account created',value:`<t:${created}:F>\n(<t:${created}:R>)`,inline:false},{name:'Joined server',value:`<t:${joined}:F>\n(<t:${joined}:R>)`,inline:false},{name:'User ID',value:m.id,inline:true},{name:'Members remaining',value:String(m.guild.memberCount),inline:true}).setThumbnail(m.user.displayAvatarURL({size:512,dynamic:true})).setFooter({text:`${m.guild.name} • Member departure`}).setTimestamp();if(m.user.bannerURL({size:1024}))embed.setImage(m.user.bannerURL({size:1024}));if(c.goodbye?.enabled&&validId(c.goodbye.channelId)){const ch=m.guild.channels.cache.get(c.goodbye.channelId);if(ch?.isTextBased())await ch.send({embeds:[embed],allowedMentions:{parse:[]}});}await sendGuildLog(m.guild,{title:'Member left server',description:`${m.user.tag} left **${m.guild.name}**.`,color:0xE25870,userId:m.id,action:'member_leave',details:`Username: ${m.user.username}; Display name: ${m.displayName||m.user.username}; Account created: <t:${created}:F>; Last known join: <t:${joined}:F>; Members remaining: ${m.guild.memberCount}`,thumbnail:m.user.displayAvatarURL({size:256,dynamic:true})});}catch(e){console.error(e);}});
client.on('clientReady',async()=>{patchClientChannelFetch();for(const guild of client.guilds.cache.values()){patchGuildChannelFetch(guild);for(const channel of guild.channels.cache.values())patchChannelLocalization(channel);await refreshInviteSnapshot(guild);}});
client.on('guildCreate',async guild=>{
 patchClientChannelFetch();
 patchGuildChannelFetch(guild);
 for(const channel of guild.channels.cache.values())patchChannelLocalization(channel);
 // Register this bot's slash commands immediately when it joins a new server.
 // This path intentionally syncs only the new guild and never removes global commands.
 try {
  if (!clientId) throw new Error('CLIENT_ID is required to register slash commands.');
  const language = i18n.getServerLanguage(guild.id) || 'en';
  console.log(`[Commands] New guild detected: ${guild.name} (${guild.id}); starting automatic slash registration, language=${language}.`);
  const result = await syncGuildSlashCommandsOnce(guild, language);
  console.log(`[Commands] Automatic slash registration finished for new guild ${guild.id}: ${result.created} created, ${result.updated} updated, ${result.removed} stale removed.`);
 } catch (error) {
  console.error(`[Commands] Automatic slash registration failed for new guild ${guild.id} (${guild.name}):`, error?.message || error);
  if (error?.rawError) console.error('[Commands] Discord API details:', JSON.stringify(error.rawError));
 }
});
client.on('inviteCreate',async invite=>{if(invite.guild){await refreshInviteSnapshot(invite.guild);await sendGuildLog(invite.guild,{title:'Invite created',description:`A new invite was created for ${invite.channel||'an unknown channel'}.`,action:'invite_create',details:`Code: ${invite.code}; Creator: ${invite.inviter?`${invite.inviter.tag} (${invite.inviter.id})`:'unknown'}; Max uses: ${invite.maxUses||'unlimited'}; Expires: ${invite.expiresAt?.toISOString?.()||'never'}`});}});
client.on('inviteDelete',async invite=>{if(invite.guild){await sendGuildLog(invite.guild,{title:'Invite deleted',description:`Invite ${invite.code} was deleted.`,action:'invite_delete',details:`Code: ${invite.code}; Channel: ${invite.channelId||'unknown'}; Creator: ${invite.inviter?.id||'unknown'}`});await refreshInviteSnapshot(invite.guild);}});
client.on('guildMemberAdd',async member=>{try{const previous=inviteSnapshots.get(member.guild.id);const current=await member.guild.invites.fetch();let used=null;if(previous){for(const invite of current.values()){const old=previous.get(invite.code);if(old&&Number(invite.uses||0)>Number(old.uses||0)){used=invite;break;}}}inviteSnapshots.set(member.guild.id,new Map(current.map(inv=>[inv.code,{uses:inv.uses||0,inviterId:inv.inviter?.id||null,channelId:inv.channelId||null,maxUses:inv.maxUses||0}])));if(used)await sendGuildLog(member.guild,{title:'Invite used by new member',description:`${member.user.tag} joined using invite ${used.code}.`,userId:member.id,action:'invite_used',details:`Inviter: ${used.inviter?`${used.inviter.tag} (${used.inviter.id})`:'unknown'}; Invite code: ${used.code}; Channel: ${used.channel||'unknown'}; Uses: ${used.uses||'unknown'}`,thumbnail:member.user.displayAvatarURL({size:256,dynamic:true})});}catch(e){console.warn('Invite attribution unavailable:',e.message);}});
setInterval(()=>{try{db.prepare('DELETE FROM audit_logs WHERE created_at<?').run(Date.now()-90*24*60*60*1000);}catch(e){console.error('Audit log retention cleanup:',e.message);}},24*60*60*1000).unref();
const spam=new Map();
setInterval(()=>{const cutoff=Date.now()-60000;for(const [key,times] of spam){const recent=times.filter(t=>t>cutoff);if(recent.length)spam.set(key,recent);else spam.delete(key);}},60000).unref();
client.on('messageCreate',async m=>{if(!m.guild)return;if(m.author.id===client.user?.id)return;try{if(await communityTools.handleMessage(m))return;}catch(error){console.error('Honeypot handler failed:',error.message);}
 // Collect multiple images when a member shares an image-search/gallery URL or explicitly asks for a matching image type.
 try{if(await imageLinkCollector.handleMessage(m))return;}catch(error){console.warn('Image link collector failed:',error.message);}
 // Prefix replies are localized by the shared channel.send wrapper above.
 // Do not localize m.reply separately: Message.reply delegates to channel.send,
 // so doing both caused duplicate provider requests and HTTP 429 rate limits.
 // Per-server, dashboard-configurable moderation triggers (e.g. #kick, #طرد).
 if(!m.author.bot){
  const c=settings(m.guild.id), mod=c.moderation||{}, aliases={kick:'#kick',ban:'#ban',unban:'#unban',...(mod.aliases||{})};
  const tokens=m.content.trim().split(/\s+/), trigger=(tokens.shift()||'').toLocaleLowerCase();
  const action=Object.keys(aliases).find(k=>String(aliases[k]||'').toLocaleLowerCase()===trigger);
  if(action){
   const lang=i18n.normalizeLanguage(mod.language)||'en', say=(en,ar)=>m.reply(lang==='ar'?ar:en).catch(()=>{});
   try{
    if(!canDo(m.member,action)) return say(`You don't have permission to ${action} members.`,`ليس لديك صلاحية ${action==='kick'?'طرد الأعضاء':action==='ban'?'حظر الأعضاء':'فك الحظر'}.`);
    const reason=tokens.join(' ').replace(/^<@!?\d{17,20}>\s*/,'').trim()|| (lang==='ar'?'لم يتم تحديد سبب':'No reason provided');
    if(action==='unban'){
      const id=(tokens[0]||'').replace(/[<@!>]/g,'');
      if(!/^\d{17,20}$/.test(id)) return say(`Usage: ${aliases.unban} USER_ID [reason]`,`طريقة الاستخدام: ${aliases.unban} USER_ID [السبب]`);
      await m.guild.bans.remove(id,reason);audit(m.guild.id,m.author.id,'unban',id,reason);
      return say(`Unbanned user ID ${id}.`,`تم فك حظر المستخدم ${id}.`);
    }
    const target=m.mentions.members.first();
    if(!target) return say(`Mention one member: ${aliases[action]} @member [reason]`,`منشن عضوًا واحدًا: ${aliases[action]} @member [السبب]`);
    if(target.id===m.author.id) return say('You cannot moderate yourself.','لا يمكنك تنفيذ الإجراء على نفسك.');
    if(target.id===client.user.id) return say('I cannot moderate myself.','لا يمكنني تنفيذ الإجراء على نفسي.');
    if(target.id===m.guild.ownerId) return say('The server owner cannot be moderated by this command.','لا يمكن تنفيذ الإجراء على مالك السيرفر.');
    if(m.guild.ownerId!==m.author.id&&m.member.roles.highest.comparePositionTo(target.roles.highest)<=0) return say('Your highest role must be above the target member.','يجب أن تكون رتبتك الأعلى أعلى من رتبة العضو المستهدف.');
    if(m.guild.members.me.roles.highest.comparePositionTo(target.roles.highest)<=0) return say('The bot highest role must be above the target member.','يجب أن تكون رتبة البوت الأعلى أعلى من رتبة العضو المستهدف.');
    if(action==='kick'){if(!target.kickable)return say('The bot lacks permission to kick this member.','البوت لا يملك صلاحية طرد هذا العضو.');await target.kick(reason);audit(m.guild.id,m.author.id,'kick',target.id,reason);return say(`Kicked ${target.user.tag}. Reason: ${reason}`,`تم طرد ${target.user.tag}. السبب: ${reason}`);}
    if(action==='ban'){if(!target.bannable)return say('The bot lacks permission to ban this member.','البوت لا يملك صلاحية حظر هذا العضو.');await target.ban({reason});audit(m.guild.id,m.author.id,'ban',target.id,reason);return say(`Banned ${target.user.tag}. Reason: ${reason}`,`تم حظر ${target.user.tag}. السبب: ${reason}`);}
   }catch(e){console.error(`Custom moderation trigger ${action} failed:`,e);return say('Action failed. Check permissions and the target member.','فشل تنفيذ الأمر. تحقق من الصلاحيات والعضو المستهدف.');}
  }
 }
 // Native prefix commands: keep Slash commands enabled and preserve legacy + and moderation aliases.
 // The default prefix is !. This first bridge exposes common, message-native commands safely.
 if(!m.author.bot && m.content.trim().startsWith('!')){
  const prefixParts=m.content.trim().slice(1).split(/\s+/), rawPrefixCommand=(prefixParts.shift()||'').toLocaleLowerCase();
  const mentionedMember=m.mentions.members.first()||null;
  try{
   // Prefix shortcuts are server-wide and can only be managed by server admins.
   // Only commands implemented by the native Prefix bridge may be shortcut targets.
   const prefixTargets=new Set(['help','commands','ping','serverinfo','userinfo','avatar','botinfo']);
   const guildSettings=settings(m.guild.id);
   const shortcuts=(guildSettings.prefixShortcuts&&typeof guildSettings.prefixShortcuts==='object'&&!Array.isArray(guildSettings.prefixShortcuts))?guildSettings.prefixShortcuts:{};
   if(rawPrefixCommand==='shortcut'||rawPrefixCommand==='shortcuts'){
    if(!admin(m.member))return m.reply('❌ إدارة الاختصارات متاحة لإدارة السيرفر فقط (Administrator أو رتبة الإدارة المضبوطة في البوت).');
    const action=(prefixParts.shift()||'list').toLowerCase();
    if(action==='list'){
     const rows=Object.entries(shortcuts).sort(([a],[b])=>a.localeCompare(b)).map(([alias,target])=>`• \`!${alias}\` → \`!${target}\``);
     return m.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle('اختصارات Prefix الخاصة بالسيرفر').setDescription(rows.join('\n')||'لا توجد اختصارات مخصصة حاليًا.').addFields({name:'إدارة الاختصارات',value:'`!shortcut add <اختصار> <أمر>` لإضافة اختصار\n`!shortcut remove <اختصار>` لحذف اختصار\n`!shortcut list` لعرض الاختصارات'}).setFooter({text:'إدارة السيرفر فقط • الاختصارات محفوظة في إعدادات السيرفر'})]});
    }
    if(action==='add'){
     const alias=(prefixParts.shift()||'').toLowerCase().replace(/^!+/,'');
     const target=(prefixParts.shift()||'').toLowerCase().replace(/^!+/,'');
     if(!/^[a-z][a-z0-9_-]{0,15}$/.test(alias))return m.reply('❌ الاختصار لازم يبدأ بحرف إنجليزي، ويسمح بالحروف والأرقام و _ و -، وبحد أقصى 16 حرفًا.');
     if(['shortcut','shortcuts','add','remove','list'].includes(alias)||prefixTargets.has(alias))return m.reply('❌ الاسم ده محجوز أو هو أمر موجود؛ اختار اختصارًا مختلفًا.');
     if(!prefixTargets.has(target))return m.reply('❌ حاليًا الاختصارات تقبل الأوامر المدعومة فعليًا بالـPrefix فقط: `help`, `ping`, `serverinfo`, `userinfo`, `avatar`, `botinfo`. ما ينفعش نربط اختصار بأمر Slash غير مربوط بالـPrefix لحد ما نضيف دعمه الحقيقي.');
     const next={...shortcuts,[alias]:target};
     updateGuildSettings(m.guild.id,{prefixShortcuts:next});
     audit(m.guild.id,m.author.id,'prefix_shortcut_add',null,`${alias} -> ${target}`);
     return m.reply(`✅ اتضاف الاختصار \`!${alias}\` للأمر \`!${target}\` على مستوى السيرفر. إدارة الاختصارات متاحة للإدارة فقط.`);
    }
    if(action==='remove'||action==='delete'){
     const alias=(prefixParts.shift()||'').toLowerCase().replace(/^!+/,'');
     if(!Object.prototype.hasOwnProperty.call(shortcuts,alias))return m.reply('❌ الاختصار ده مش موجود. استخدم `!shortcut list` لعرض الاختصارات.');
     const next={...shortcuts};delete next[alias];
     updateGuildSettings(m.guild.id,{prefixShortcuts:next});
     audit(m.guild.id,m.author.id,'prefix_shortcut_remove',null,alias);
     return m.reply(`✅ تم حذف الاختصار \`!${alias}\` من السيرفر.`);
    }
    return m.reply('استخدم: `!shortcut add <اختصار> <أمر>` أو `!shortcut remove <اختصار>` أو `!shortcut list`.');
   }
   const prefixCommand=Object.prototype.hasOwnProperty.call(shortcuts,rawPrefixCommand)?shortcuts[rawPrefixCommand]:rawPrefixCommand;
   if(prefixCommand==='help'||prefixCommand==='commands'){
    const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('♔ IM YOUR DADDY — Prefix Help')
     .setDescription('Prefix الافتراضي: `!`\nأوامر Slash `/` ما زالت شغالة كما هي. أوامر Prefix المدعومة حاليًا موضحة بالأسفل. إدارة اختصارات السيرفر: `!shortcut list` (للإدارة فقط).')
     .addFields(
      {name:'معلومات وأدوات',value:'`!help` — المساعدة\n`!ping` — سرعة استجابة البوت\n`!botinfo` — معلومات البوت\n`!serverinfo` — معلومات السيرفر\n`!userinfo [@عضو]` — معلومات عضو\n`!avatar [@عضو]` — صورة العضو'},
      {name:'أمثلة',value:'`!ping`\n`!userinfo @member`\n`!avatar`'}
     ).setFooter({text:'IM YOUR DADDY • Slash + Prefix'});
    return m.reply({embeds:[embed]});
   }
   if(prefixCommand==='ping'){
    const ws=Number.isFinite(client.ws.ping)?`${Math.round(client.ws.ping)} ms`:'غير متاح';
    return m.reply({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle('🏓 Pong!').addFields({name:'WebSocket',value:ws,inline:true},{name:'Message',value:`${Date.now()-m.createdTimestamp} ms`,inline:true})]});
   }
   if(prefixCommand==='serverinfo'){
    const g=m.guild;
    const embed=new EmbedBuilder().setColor(0x5865F2).setTitle(`معلومات السيرفر: ${g.name}`).setThumbnail(g.iconURL({size:256}))
     .addFields(
      {name:'المالك',value:`<@${g.ownerId}>`,inline:true},
      {name:'الأعضاء',value:String(g.memberCount),inline:true},
      {name:'القنوات',value:String(g.channels.cache.size),inline:true},
      {name:'الرولات',value:String(g.roles.cache.size),inline:true},
      {name:'تاريخ الإنشاء',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},
      {name:'Server ID',value:g.id,inline:true}
     );
    return m.reply({embeds:[embed]});
   }
   if(prefixCommand==='userinfo'){
    const target=mentionedMember||m.member, user=target.user;
    const embed=new EmbedBuilder().setColor(0x5865F2).setTitle(`معلومات العضو: ${user.tag}`).setThumbnail(user.displayAvatarURL({size:256}))
     .addFields(
      {name:'User ID',value:user.id,inline:true},
      {name:'انضم للسيرفر',value:target.joinedTimestamp?`<t:${Math.floor(target.joinedTimestamp/1000)}:R>`:'غير معروف',inline:true},
      {name:'أنشأ الحساب',value:`<t:${Math.floor(user.createdTimestamp/1000)}:R>`,inline:true},
      {name:'عدد الرولات',value:String(Math.max(0,target.roles.cache.size-1)),inline:true},
      {name:'Bot',value:user.bot?'نعم':'لا',inline:true}
     );
    return m.reply({embeds:[embed]});
   }
   if(prefixCommand==='avatar'){
    const user=mentionedMember?.user||m.author;
    const url=user.displayAvatarURL({size:1024,extension:'png'});
    return m.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(`Avatar — ${user.tag}`).setImage(url).setURL(url)]});
   }
   if(prefixCommand==='botinfo'){
    const user=client.user;
    const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('♔ IM YOUR DADDY ♔').setThumbnail(user.displayAvatarURL({size:256}))
     .setDescription('بوت متعدد الوظائف للإدارة والمجتمع والأدوات والقرآن الكريم.')
     .addFields({name:'السيرفرات',value:String(client.guilds.cache.size),inline:true},{name:'المستخدمون',value:String(client.guilds.cache.reduce((sum,g)=>sum+(g.memberCount||0),0)),inline:true},{name:'وقت التشغيل',value:`<t:${Math.floor((Date.now()-process.uptime()*1000)/1000)}:R>`,inline:true});
    return m.reply({embeds:[embed]});
   }
  }catch(error){console.error(`[Prefix] !${prefixCommand} failed:`,error?.stack||error);return m.reply('حصل خطأ أثناء تنفيذ الأمر. جرّب أمر Slash المقابل أو راجع سجل البوت.').catch(()=>{});}
 }
 if(!m.author.bot && m.content.trim().startsWith('+')){const [raw,...args]=m.content.trim().slice(1).split(/\s+/),cmd=(raw||'').toLowerCase();try{
  if(cmd==='help'){return m.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle('🤖 Insight Monitoring — Commands').setDescription('`+help` — Show this menu\n`+setup` — Create monitoring channels (admins only)\n`+bots` — Show bot status in the server\n`+test` — Diagnose log channels and permissions (admins only)').addFields({name:'Slash command',value:'Use `/log setup` for the localized logging catalog.'})]});}
  if(cmd==='setup'){if(!admin(m.member))return m.reply('❌ Admin permission is required.');const status=await m.reply('⏳ Setting up monitoring channels…').catch(()=>null);try{const result=await setupLogCatalog(m.guild,'en',m.author.id);const embed=new EmbedBuilder().setColor(0x2ECC71).setTitle('✅ Insight monitoring setup complete').setDescription(`Configured **${Object.keys(result.channels).length}** monitoring channel(s).\nRemoved **${result.removed.length}** obsolete channel(s).\nCategory: ${result.category}`).setFooter({text:'Some event types depend on Discord Gateway events and enabled intents.'});if(status)return status.edit({content:'',embeds:[embed]});return m.channel.send({embeds:[embed]});}catch(error){console.error('[+setup] Monitoring setup failed:',error);const msg=`❌ Setup failed: ${String(error?.message||'Unknown error').slice(0,250)}\nCheck the bot role permissions and server channel/category limits.`;if(status)return status.edit({content:msg,embeds:[]}).catch(()=>m.channel.send(msg).catch(()=>{}));return m.channel.send(msg).catch(()=>{});}}
  if(cmd==='bots'){const bots=m.guild.members.cache.filter(x=>x.user.bot);return m.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle('🤖 Bot Status').setDescription(bots.size?bots.map(b=>`${b.presence?.status==='online'?'🟢':b.presence?.status==='idle'?'🌙':b.presence?.status==='dnd'?'⛔':'⚪'} ${b.user.tag} — ${b.presence?.status||'status unavailable'}`).slice(0,40).join('\n'):'No bots found in the cached member list.')]});}
  if(cmd==='test'){if(!admin(m.member))return m.reply('❌ Admin permission is required.');const c=settings(m.guild.id),groups=Object.entries(c.logs?.channels||{}),rows=[];for(const [key,id] of groups){const ch=m.guild.channels.cache.get(id)||await m.guild.channels.fetch(id).catch(()=>null);const ok=Boolean(ch?.isTextBased()&&ch.permissionsFor(m.guild.members.me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]));rows.push(`${ok?'✅':'❌'} ${LOG_CHANNEL_GROUPS[key]?.en?.label||key}: ${!ch?'channel not found':ok?'channel & permissions OK':'missing channel permissions/type'}`);}const missing=Object.keys(LOG_CHANNEL_GROUPS).filter(k=>!c.logs?.channels?.[k]);for(const key of missing)rows.push(`❌ ${LOG_CHANNEL_GROUPS[key].en.label}: not configured`);return m.reply({embeds:[new EmbedBuilder().setColor(rows.some(x=>x.startsWith('❌'))?0xE67E22:0x2ECC71).setTitle('🧪 Log System Diagnostics').setDescription(rows.slice(0,40).join('\n').slice(0,4000)||'No log channels configured. Run +setup first.').setFooter({text:`Channel/permission checks only; ${rows.length} checks. This does not simulate every Discord event.`})]});}
 }catch(e){console.error(`Prefix command +${cmd} failed:`,e);return m.reply(`❌ Command failed: ${String(e.message||e).slice(0,300)}`).catch(()=>{});}}
 if(m.author.bot){const files=[...m.attachments.values()].map(a=>`${a.name||'attachment'} (${Math.round((a.size||0)/1024)} KB) ${a.contentType||''} ${a.url}`).join('\n');await sendGuildLog(m.guild,{title:'New bot message',description:`A bot sent a message in <#${m.channelId}>.`,color:0x3446A8,userId:m.author.id,action:'bot_message',details:`Username: ${m.author.username}; Nickname: ${m.member?.displayName||'none'}; Message ID: ${m.id}; Content: ${(m.content||'❌ No text').slice(0,700)}; Attachments: ${m.attachments.size}${files?'\n'+files:''}`,thumbnail:m.author.displayAvatarURL({size:256,dynamic:true})});return;}const c=settings(m.guild.id);
 if(c.automod?.enabled&&!moderator(m.member)){const now=Date.now(),key=`${m.guild.id}:${m.author.id}`,times=(spam.get(key)||[]).filter(t=>now-t<Number(c.automod.intervalMs||7000));times.push(now);spam.set(key,times);
 const invite=c.automod.blockInvites&&/(discord\.gg\/|discord\.com\/invite\/)/i.test(m.content);
 if(invite){await m.delete().catch(()=>{});return;}
 if(times.length>=Math.max(3,Number(c.automod.maxMessages||6))){spam.set(key,[]);if(!m.member?.moderatable)return;await m.member.timeout(Number(c.automod.timeoutMs||60000),'Automatic anti-spam').catch(e=>console.warn('Anti-spam timeout failed:',e.message));}}
 if(c.levels?.enabled){const row=db.prepare('SELECT * FROM levels WHERE guild_id=? AND user_id=?').get(m.guild.id,m.author.id);const now=Date.now(),cool=Number(c.levels.cooldownMs||60000);if(!row){db.prepare('INSERT INTO levels(guild_id,user_id,xp,level,last_xp) VALUES(?,?,?,0,?)').run(m.guild.id,m.author.id,Number(c.levels.xpPerMessage||5),now);}else if(now-row.last_xp>=cool){const xp=row.xp+Number(c.levels.xpPerMessage||5),level=Math.floor(Math.sqrt(xp/100));db.prepare('UPDATE levels SET xp=?,level=?,last_xp=? WHERE guild_id=? AND user_id=?').run(xp,level,now,m.guild.id,m.author.id);if(level>row.level)m.channel.send(`🎉 ${m.author}, you reached level ${level}!`).catch(()=>{});}}
});
client.on('messageReactionAdd',async(r,u)=>{let claimedMessageId=null;try{if(r.partial)await r.fetch();if(u.bot||r.emoji.name!=='⭐')return;const m=r.message;if(!m.guild)return;const c=settings(m.guild.id);if(!c.starboard?.enabled||!validId(c.starboard.channelId)||r.count<Number(c.starboard.threshold||3))return;if(m.channelId===c.starboard.channelId)return;const out=m.guild.channels.cache.get(c.starboard.channelId);if(!out?.isTextBased())return;const claim=db.prepare('INSERT OR IGNORE INTO starboard(message_id,guild_id,posted_at) VALUES(?,?,?)').run(m.id,m.guild.id,Date.now());if(!claim.changes)return;claimedMessageId=m.id;await out.send({embeds:[new EmbedBuilder().setColor(0xF1C40F).setAuthor({name:m.author.tag,iconURL:m.author.displayAvatarURL()}).setDescription(`${(m.content||'(attachment/embed)').slice(0,3500)}\n\n[Jump to message](${m.url})`).setFooter({text:`⭐ ${r.count} • #${m.channel.name}`})],allowedMentions:{parse:[]}});claimedMessageId=null;}catch(e){if(claimedMessageId)db.prepare('DELETE FROM starboard WHERE message_id=?').run(claimedMessageId);console.error('Starboard:',e);}});
client.on('messageDelete',async message=>{try{if(!message.guild||message.author?.bot)return;await sendGuildLog(message.guild,{title:'Message deleted',description:`A message by ${message.author?`${message.author.tag} (${message.author.id})`:'an unknown author'} was deleted in <#${message.channelId}>.`,color:0xE74C3C,userId:message.author?.id||null,action:'message_delete',details:`Channel: ${message.channelId}; Message ID: ${message.id}; Content: ${(message.content||'[no cached content]').slice(0,700)}; Attachments: ${message.attachments?.size||0}${message.attachments?.size?'\n'+[...message.attachments.values()].map(a=>`${a.name||'file'} (${Math.round((a.size||0)/1024)} KB) ${a.contentType||''} ${a.url}`).join('\n'):''}`,thumbnail:message.author?.displayAvatarURL?.({size:256})||null});}catch(e){console.warn('Message delete log failed:',e.message);}});
client.on('messageUpdate',async(before,after)=>{try{if(!after.guild||after.author?.bot||(before.content===after.content))return;await sendGuildLog(after.guild,{title:'Message edited',description:`${after.author?.tag||'Unknown user'} edited a message in <#${after.channelId}>.`,color:0xF1C40F,userId:after.author?.id||null,action:'message_edit',details:`Message ID: ${after.id}; Before: ${(before.content||'[uncached]').slice(0,450)}; After: ${(after.content||'[empty]').slice(0,450)}; Attachments: ${after.attachments?.size||0}${after.attachments?.size?'\n'+[...after.attachments.values()].map(a=>`${a.name||'file'} (${Math.round((a.size||0)/1024)} KB) ${a.url}`).join('\n'):''}`,thumbnail:after.author?.displayAvatarURL?.({size:256})||null});}catch(e){console.warn('Message edit log failed:',e.message);}});
client.on('guildBanAdd',async ban=>{await sendGuildLog(ban.guild,{title:'Member banned',description:`${ban.user.tag} was banned from **${ban.guild.name}**.`,color:0x992D22,userId:ban.user.id,action:'member_banned',details:`User ID: ${ban.user.id}; Reason: ${ban.reason||'Not supplied by Discord event'}`,thumbnail:ban.user.displayAvatarURL({size:256})});});
client.on('guildBanRemove',async ban=>{await sendGuildLog(ban.guild,{title:'Member unbanned',description:`${ban.user.tag} was unbanned from **${ban.guild.name}**.`,color:0x2ECC71,userId:ban.user.id,action:'member_unbanned',details:`User ID: ${ban.user.id}`,thumbnail:ban.user.displayAvatarURL({size:256})});});
client.on('guildMemberUpdate',async(before,after)=>{try{if(before.nickname!==after.nickname)await sendGuildLog(after.guild,{title:'Member nickname changed',description:`${after.user.tag} changed their server nickname.`,userId:after.id,action:'member_nickname_change',details:`Before: ${before.nickname||before.user.username}; After: ${after.nickname||after.user.username}`});const beforeRoles=new Set(before.roles.cache.keys()),afterRoles=new Set(after.roles.cache.keys());for(const id of afterRoles)if(id!==after.guild.id&&!beforeRoles.has(id)){const role=after.guild.roles.cache.get(id);await sendGuildLog(after.guild,{title:'Role added to member',description:`${role||id} was added to ${after.user.tag}.`,userId:after.id,action:'member_role_added',details:`Role ID: ${id}`});}for(const id of beforeRoles)if(id!==before.guild.id&&!afterRoles.has(id)){const role=before.guild.roles.cache.get(id);await sendGuildLog(after.guild,{title:'Role removed from member',description:`${role?.name||id} was removed from ${after.user.tag}.`,userId:after.id,action:'member_role_removed',details:`Role ID: ${id}`});}if(before.communicationDisabledUntilTimestamp!==after.communicationDisabledUntilTimestamp)await sendGuildLog(after.guild,{title:'Member timeout changed',description:`Timeout state changed for ${after.user.tag}.`,userId:after.id,action:'member_timeout_change',details:`Before: ${before.communicationDisabledUntil?.toISOString?.()||'none'}; After: ${after.communicationDisabledUntil?.toISOString?.()||'none'}`});}catch(e){console.warn('Member update log failed:',e.message);}});
client.on('threadCreate',thread=>{if(thread.guild)patchChannelLocalization(thread);});
client.on('channelCreate',async channel=>{if(channel.guild){patchGuildChannelFetch(channel.guild);patchChannelLocalization(channel);}if(channel.guild)await sendGuildLog(channel.guild,{title:'Channel created',description:`${channel} was created.`,action:'channel_create',details:`Name: ${channel.name}; ID: ${channel.id}; Type: ${channel.type}`});});
client.on('channelDelete',async channel=>{if(channel.guild)await sendGuildLog(channel.guild,{title:'Channel deleted',description:`Channel **${channel.name}** was deleted.`,color:0xE74C3C,action:'channel_delete',details:`Name: ${channel.name}; ID: ${channel.id}; Type: ${channel.type}`});});
client.on('channelUpdate',async(before,after)=>{if(after.guild&&(before.name!==after.name||before.parentId!==after.parentId||before.topic!==after.topic))await sendGuildLog(after.guild,{title:'Channel updated',description:`Channel <#${after.id}> settings changed.`,action:'channel_update',details:`Name: ${before.name} -> ${after.name}; Category: ${before.parentId||'none'} -> ${after.parentId||'none'}; Topic changed: ${before.topic!==after.topic}`});});
client.on('roleCreate',async role=>{await sendGuildLog(role.guild,{title:'Role created',description:`Role ${role} was created.`,action:'role_create',details:`Name: ${role.name}; ID: ${role.id}; Color: ${role.hexColor}`});});
client.on('roleDelete',async role=>{await sendGuildLog(role.guild,{title:'Role deleted',description:`Role **${role.name}** was deleted.`,color:0xE74C3C,action:'role_delete',details:`Name: ${role.name}; ID: ${role.id}`});});
client.on('roleUpdate',async(before,after)=>{if(before.name!==after.name||before.hexColor!==after.hexColor||before.permissions.bitfield!==after.permissions.bitfield||before.hoist!==after.hoist||before.mentionable!==after.mentionable)await sendGuildLog(after.guild,{title:'Role updated',description:`Role ${after} settings changed.`,action:'role_update',details:`ID: ${after.id}; Name: ${before.name} -> ${after.name}; Color: ${before.hexColor} -> ${after.hexColor}; Hoisted: ${before.hoist} -> ${after.hoist}; Mentionable: ${before.mentionable} -> ${after.mentionable}`});});
client.on('guildUpdate',async(before,after)=>{const changes=[];for(const key of ['name','verificationLevel','explicitContentFilter','preferredLocale','afkTimeout'])if(before[key]!==after[key])changes.push(`${key}: ${before[key]} -> ${after[key]}`);if(changes.length)await sendGuildLog(after,{title:'Server settings updated',description:`Settings changed for **${after.name}**.`,action:'guild_update',details:changes.join('\n')});});
client.on('voiceStateUpdate',async(oldS,newS)=>{
 const guild=newS.guild||oldS.guild,member=newS.member||oldS.member;if(!guild||!member)return;
 const userTag=member.user?.tag||member.id,oldChannel=oldS.channel,newChannel=newS.channel;
 try{
  if(oldS.channelId!==newS.channelId){
   const sessionKey=voiceSessionKey(guild.id,member.id);
   if(!oldS.channelId&&newS.channelId){voiceSessionStarts.set(sessionKey,{startedAt:Date.now(),channelId:newS.channelId});await sendGuildLog(guild,{title:'Voice channel joined',description:`${userTag} joined **${newChannel?.name||'a voice channel'}**.`,color:0x2ECC71,userId:member.id,action:'voice_join',details:`channel=${newS.channelId}; account_created=${member.user.createdAt?.toISOString?.()||'unknown'}`,thumbnail:member.user.displayAvatarURL({size:256,dynamic:true})});}
   else if(oldS.channelId&&!newS.channelId){const session=voiceSessionStarts.get(sessionKey);voiceSessionStarts.delete(sessionKey);await sendGuildLog(guild,{title:'Voice channel left',description:`${userTag} left **${oldChannel?.name||'a voice channel'}**.`,color:0xE67E22,userId:member.id,action:'voice_leave',details:`channel=${oldS.channelId}; account_created=${member.user.createdAt?.toISOString?.()||'unknown'}; session_started=${session?new Date(session.startedAt).toISOString():'unknown (bot restarted or session was not observed)'}; session_duration=${session?formatDuration(Date.now()-session.startedAt):'unknown'}`,thumbnail:member.user.displayAvatarURL({size:256,dynamic:true})});}
   else if(oldS.channelId&&newS.channelId){const session=voiceSessionStarts.get(sessionKey);if(session)session.channelId=newS.channelId;await sendGuildLog(guild,{title:'Voice channel moved',description:`${userTag} moved from **${oldChannel?.name||'unknown'}** to **${newChannel?.name||'unknown'}**.`,color:0x3498DB,userId:member.id,action:'voice_move',details:`${oldS.channelId} -> ${newS.channelId}; account_created=${member.user.createdAt?.toISOString?.()||'unknown'}; session_started=${session?new Date(session.startedAt).toISOString():'unknown'}`,thumbnail:member.user.displayAvatarURL({size:256,dynamic:true})});}
  }
  const voiceFlags=[['selfMute','Self mute'],['serverMute','Server mute'],['selfDeaf','Self deafen'],['serverDeaf','Server deafen'],['selfVideo','Camera/video']];
  for(const [key,label] of voiceFlags){if(oldS[key]!==newS[key])await sendGuildLog(guild,{title:`Voice state: ${label}`,description:`${userTag} ${newS[key]?'enabled':'disabled'} **${label.toLowerCase()}**${newS.channel?` in **${newS.channel.name}**`:''}.`,color:newS[key]?0xE74C3C:0x2ECC71,userId:member.id,action:`voice_${key.toLowerCase()}`,details:`${oldS[key]} -> ${newS[key]}; channel=${newS.channelId||'none'}`});}
 }catch(e){console.warn('Voice audit log failed:',e.message);}
 const c=settings(guild.id);if(!c.tempVoice?.enabled)return;let createdVoice=null,createdText=null;try{if(validId(c.tempVoice.createChannelId)&&newS.channelId===c.tempVoice.createChannelId&&oldS.channelId!==newS.channelId&&newS.member&&!newS.member.user.bot){const g=newS.guild,m=newS.member,opts={name:`🔊 ${m.user.username}`.slice(0,90),type:ChannelType.GuildVoice,permissionOverwrites:[{id:g.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]},{id:m.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]}]};if(validId(c.tempVoice.categoryId)&&g.channels.cache.get(c.tempVoice.categoryId)?.type===ChannelType.GuildCategory)opts.parent=c.tempVoice.categoryId;createdVoice=await g.channels.create(opts);if(c.tempVoice.createTextChannel){createdText=await g.channels.create({name:`room-${m.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90),type:ChannelType.GuildText,topic:`temp-voice:${createdVoice.id}`,permissionOverwrites:[{id:g.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:m.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}]});await createdText.send(`Private text room for ${m}.`);}await m.voice.setChannel(createdVoice);createdVoice=null;createdText=null;}}catch(e){console.error('Temp voice creation/move failed:',e);if(createdText)await createdText.delete('Rollback failed temporary voice setup').catch(()=>{});if(createdVoice)await createdVoice.delete('Rollback failed temporary voice setup').catch(()=>{});}
 if(oldS.channel&&oldS.channelId!==newS.channelId){const ch=oldS.channel;try{if(ch.type===ChannelType.GuildVoice&&ch.members.size===0&&ch.name.startsWith('🔊 ')){const t=oldS.guild.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.topic===`temp-voice:${ch.id}`);await ch.delete('Temporary room empty');if(t)await t.delete('Temporary room empty');}}catch(e){console.error('Temp voice cleanup:',e.message);}}
});
const HELP_CATEGORIES = [
 {value:'moderation',label:'الإشراف وإدارة الأعضاء',emoji:'🛡️',description:'الحظر والطرد والتحذيرات وإدارة الرسائل والصوت'},
 {value:'roles',label:'الرولات والصلاحيات',emoji:'🎭',description:'إنشاء الرتب وإدارتها ورولات التفاعل والرتب التلقائية'},
 {value:'server',label:'إعدادات السيرفر واللوحات',emoji:'⚙️',description:'إعداد القنوات والرسائل الترحيبية واللوحات والنسخ الاحتياطي'},
 {value:'protection',label:'الحماية وسجلات الأحداث',emoji:'🔐',description:'مكافحة الغارات والسبام والروابط الضارة وتسجيل الأحداث'},
 {value:'automod',label:'الإشراف التلقائي (AutoMod)',emoji:'🤖',description:'الكلمات المحظورة والروابط والاستثناءات ومكافحة الإزعاج'},
 {value:'voice',label:'الصوت والموسيقى وأدوات الأعضاء',emoji:'🔊',description:'تشغيل الصوت وإدارة القنوات وأدوات الرسائل والغياب'},
 {value:'levels',label:'المستويات والخبرة والترتيب',emoji:'🏆',description:'نقاط الخبرة ولوحات المتصدرين ومكافآت التقدم'},
 {value:'community',label:'المجتمع والاقتصاد والألعاب',emoji:'🌐',description:'الرصيد والتحويلات والمتجر والسحوبات والألعاب والتفاعل'},
 {value:'media',label:'الصور والوسائط والمحتوى',emoji:'🖼️',description:'الصور والبانرات والوسائط والموجزات ونشر المحتوى'},
 {value:'information',label:'معلومات السيرفر والأعضاء',emoji:'ℹ️',description:'عرض معلومات الأعضاء والقنوات والرولات والبوت'},
 {value:'islamic',label:'القرآن الكريم والمحتوى الإسلامي',emoji:'📖',description:'أوامر القرآن والميزات والمحتوى الإسلامي المتاح'},
 {value:'utility',label:'أدوات البوت والإعدادات العامة',emoji:'🧰',description:'المساعدة واللغة والترجمة وحالة البوت والأدوات المتنوعة'},
 {value:'all',label:'كل الأوامر',emoji:'📚',description:'عرض جميع أوامر البوت المسجلة'}
];
function helpCategoryFor(commandName){
 const n=String(commandName||'').toLowerCase();
 if(/^(serverinfo|userinfo|roleinfo|channelinfo|avatar|banner|server_icon|membercount|oldestmember|newestmember|color|palette|emojis|whois|ui|botinfo|ping|botstatus|botdescription|botnickname|profilewidget)$/.test(n))return 'information';
 if(/islam|quran|religious|hadith|prayer|adhan|hijri|ramadan|mosque/.test(n))return 'islamic';
 // Specific groups first so every registered slash command lands in the most useful section.
 if(/^(ban|unban|kick|timeout|untimeout|warn|warnings|warns|clear|purge|lock|unlock|slowmode|nick|nickname|mute|unmute|deafen|undeafen|voice-disconnect|voice-mute|voice-deafen|delete-all-channels|delete-whitelist-|audit-logs|say)$/.test(n))return 'moderation';
 if(/role|autorole|badge|reactionrole|reaction-role|selfrole|self-role|rolecondition|role-condition/.test(n))return 'roles';
 if(/^(control|publish-panel|panel-|setup-|server-backup|server-restore|server-clone|serverlanguage|serverlanguagereset|serverinfo|channel-create|channel-delete|channelinfo|ticket|welcome|goodbye|suggest|suggestion|logs?|setlogchannel|setup-status|community|share-panel)/.test(n))return 'server';
 if(/protect|antiraid|anti-raid|honeypot|security|account-age|raid|whitelist|blacklist|backup|restore|clone|log/.test(n))return 'protection';
 if(/automod|flagged-word|keyword|mention-spam|spam-message|filter|badword|blocked-word|mediachannel|linkchannel/.test(n))return 'automod';
 if(/^(voice|user-mute|user-unmute|user-deafen|user-undeafen|user-move|user-history|afk|snipe|wrapped|firstmessage)/.test(n)||/music|quran-audio/.test(n))return 'voice';
 if(/level|xp|rank|leaderboard|growthchart|activitychart|levelchart/.test(n))return 'levels';
 if(/daily|balance|transfer|coinflip|economy|shop|buy|giveaway|roulette|game|games|community|tax/.test(n))return 'community';
 if(/image|feed|postimage|banner|avatar|sticker|emoji|youtube|media|cat|dog|gif|video/.test(n))return 'media';
 // Utility is intentional for language, translation, help, image/catalog setup and other general bot tools.
 return 'utility';
}
function helpDescriptionArabic(command){
 const n=String(command?.name||'').toLowerCase();
 const known={
  help:'عرض لوحة المساعدة وأقسام أوامر البوت.',ping:'عرض زمن استجابة البوت وحالة الاتصال.',language:'تغيير لغة البوت أو اختيار اللغة المفضلة.',serverlanguage:'تحديد لغة الأوامر لهذا السيرفر.',serverlanguagereset:'إعادة إعداد لغة السيرفر إلى الوضع الافتراضي.',translate:'ترجمة النص إلى اللغة المطلوبة.',
  ban:'حظر عضو من السيرفر.',unban:'إلغاء حظر عضو والسماح له بالعودة.',kick:'طرد عضو من السيرفر.',timeout:'تقييد عضو مؤقتًا ومنعه من التفاعل.',untimeout:'إزالة التقييد المؤقت عن عضو.',warn:'إضافة تحذير إلى سجل عضو.',warnings:'عرض سجل تحذيرات العضو.',clear:'حذف عدد من الرسائل من القناة.',purge:'تنظيف الرسائل وفق الخيارات المحددة.',lock:'قفل القناة ومنع الأعضاء من إرسال الرسائل.',unlock:'فتح القناة والسماح بإرسال الرسائل.',slowmode:'تحديد الفاصل الزمني بين الرسائل في القناة.',
  'role-add':'إضافة رتبة إلى عضو.', 'role-remove':'إزالة رتبة من عضو.','role-create':'إنشاء رتبة جديدة في السيرفر.','role-delete':'حذف رتبة من السيرفر.','roleinfo':'عرض معلومات الرتبة وصلاحياتها.','autorole':'إدارة الرتب التي تُمنح تلقائيًا للأعضاء.','reactionrole':'إعداد رولات التفاعل التي يختارها الأعضاء.',
  serverinfo:'عرض معلومات السيرفر وإحصاءاته.',userinfo:'عرض معلومات العضو.',avatar:'عرض الصورة الشخصية للعضو.',banner:'عرض بانر العضو أو إعدادات البانر المتاحة.',channelinfo:'عرض معلومات القناة الحالية أو المحددة.',membercount:'عرض عدد أعضاء السيرفر.',botinfo:'عرض معلومات البوت وإصداره.',botstatus:'عرض أو تعديل حالة البوت.',botdescription:'تعديل وصف البوت.',botnickname:'تغيير اسم البوت الظاهر في السيرفر.',
  daily:'استلام المكافأة اليومية.',balance:'عرض رصيدك الحالي.',transfer:'تحويل رصيد إلى عضو آخر.',shop:'عرض عناصر المتجر المتاحة.',buy:'شراء عنصر من المتجر.',work:'كسب رصيد من خلال العمل.',leaderboard:'عرض قائمة المتصدرين.',rank:'عرض رتبتك ومستواك الحالي.',level:'عرض مستوى العضو وخبرته.',giveaway:'إعداد أو إدارة سحب الجوائز.',
  'server-backup':'إنشاء نسخة احتياطية من إعدادات السيرفر المدعومة.','server-restore':'استعادة نسخة احتياطية وفق الصلاحيات المتاحة.','server-clone':'نسخ إعدادات السيرفر المدعومة إلى وجهة أخرى.','log':'إعداد أو إدارة سجلات الأحداث.','setlogchannel':'تحديد القناة التي تستقبل سجلات البوت.',
  'voice-join':'إدخال البوت إلى قناة صوتية.','voice-play':'تشغيل محتوى صوتي في القناة الصوتية.','voice-stop':'إيقاف التشغيل الصوتي الحالي.','voice-leave':'إخراج البوت من القناة الصوتية.','voice-stay':'إدارة بقاء البوت في القناة الصوتية.',
  cat:'عرض صورة قطة.',dog:'عرض صورة كلب.','postimage':'نشر صورة في القناة المحددة.','server_icon':'عرض أيقونة السيرفر.','ticket-panel':'إعداد أو نشر لوحة التذاكر.',suggest:'إرسال اقتراح للمجتمع.','community':'فتح أدوات المجتمع والتفاعل.',games:'عرض الألعاب المتاحة.'
 };
 if(known[n]) return known[n];
 if(/^protection|^antiraid|^anti-raid|^antispam|^antiscam|^anti-link|^anti-mention|^honeypot|^whitelist|^blacklist/.test(n))return 'إعداد ميزة حماية ومراجعة خياراتها لتقليل الإساءة والأنشطة غير المرغوبة.';
 if(/automod|filter|word|keyword|spam|mediachannel|linkchannel/.test(n))return 'إعداد فلترة الرسائل والاستثناءات وقواعد الإشراف التلقائي.';
 if(/role|badge|reaction/.test(n))return 'إدارة الرتب أو شارات الأعضاء وخيارات منحها وإزالتها.';
 if(/level|xp|rank|leaderboard|growthchart|activitychart/.test(n))return 'عرض أو ضبط نظام المستويات والخبرة وترتيب الأعضاء.';
 if(/quran|islam|hadith|prayer|adhan|hijri|ramadan|mosque/.test(n))return 'إدارة أو استخدام إحدى ميزات القرآن الكريم والمحتوى الإسلامي.';
 if(/image|banner|avatar|sticker|emoji|feed|media|youtube|gif|video|catalog/.test(n))return 'إدارة الصور والوسائط أو البحث عنها ونشرها حسب خيارات الأمر.';
 if(/ticket|welcome|goodbye|suggest|panel|channel|backup|restore|clone|setup|publish/.test(n))return 'إعداد أو إدارة إحدى لوحات السيرفر أو قنواته ورسائله.';
 if(/daily|balance|transfer|coin|economy|shop|buy|giveaway|roulette|game|tax|work|pay/.test(n))return 'استخدام إحدى ميزات الاقتصاد أو الألعاب والتفاعل داخل السيرفر.';
 if(/mute|deafen|voice|afk|snipe|wrapped|firstmessage|history|move/.test(n))return 'إدارة الصوت أو استخدام إحدى أدوات الأعضاء والرسائل.';
 if(/language|translate|locale|prefix|status|cooldown|config|setting|help|ping/.test(n))return 'عرض إعدادات البوت أو تعديلها واستخدام الأدوات العامة.';
 const cat=helpCategoryFor(n);
 const fallback={moderation:'تنفيذ إجراء إشرافي على عضو أو رسالة وفق صلاحياتك.',roles:'إدارة الرتب وصلاحيات الأعضاء وفق إعدادات السيرفر.',server:'إدارة إعدادات السيرفر والقنوات واللوحات.',protection:'إعداد الحماية ومراجعة خيارات الأمان والسجلات.',automod:'ضبط قواعد الإشراف التلقائي ومراجعة الاستثناءات.',voice:'استخدام أدوات الصوت والعضوية المتاحة.',levels:'إدارة إعدادات المستويات والخبرة والترتيب.',community:'استخدام أدوات المجتمع والاقتصاد والتفاعل.',media:'إدارة المحتوى والصور والوسائط.',information:'عرض معلومات البوت أو السيرفر أو أحد الأعضاء.',islamic:'استخدام ميزة من ميزات القرآن الكريم والمحتوى الإسلامي.',utility:'استخدام أداة عامة أو تعديل أحد إعدادات البوت.'};
 return fallback[cat]||'استخدام الأمر وفق الخيارات والصلاحيات المتاحة.';
}
function buildHelpPayload(category='moderation', page=0, language='en'){
 const selected=HELP_CATEGORIES.some(x=>x.value===category)?category:'moderation';
 const categoryInfo=HELP_CATEGORIES.find(x=>x.value===selected)||HELP_CATEGORIES[0];
 const visible=(selected==='all'?commands:commands.filter(c=>helpCategoryFor(c.name)===selected)).slice().sort((a,b)=>a.name.localeCompare(b.name));
 // Six commands per page keep every description inside Discord embed limits, including the All Commands view.
 const pageSize=6, totalPages=Math.max(1,Math.ceil(visible.length/pageSize));
 const currentPage=Math.max(0,Math.min(Number.isInteger(Number(page))?Number(page):0,totalPages-1));
 const pageCommands=visible.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 const lines=pageCommands.map((c,index)=>`${['🔹','🔸','▫️','🔹','🔸','▫️'][index%6]} ` + '`' + `/${commandLocales.commandNameForLanguage(c.name,language)}` + '`' + `\n└ ${helpDescriptionArabic(c)}`);
 const embed=new EmbedBuilder()
  .setColor(0x3B82F6)
  .setAuthor({name:`${config.brand}  •  مركز المساعدة`,iconURL:client.user?.displayAvatarURL?.()})
  .setTitle(`${categoryInfo.emoji}  ${categoryInfo.label}`)
  .setDescription(`╭━━━━━━━━━━━━━━━━━━━━╮\n　**دليل أوامر البوت**\n╰━━━━━━━━━━━━━━━━━━━━╯\n${categoryInfo.description}\n\n📚 **الأوامر المسجلة:** \`${visible.length}\`\n📄 **الصفحة:** \`${currentPage+1} / ${totalPages}\`\n\nاختر قسمًا من القائمة، ثم تنقّل بين الصفحات لعرض جميع الأوامر. قد تتطلب بعض الأوامر صلاحيات إدارية أو إعدادًا مسبقًا.`)
  .addFields({name:`━━━━━━━━  ${categoryInfo.emoji} الأوامر المتاحة  ━━━━━━━━`,value:lines.length?lines.join('\n\n'):'لا توجد أوامر مسجلة في هذا القسم حاليًا.'})
  .setFooter({text:'IMYD • لوحة مساعدة تفاعلية  |  استخدم القائمة لتغيير القسم',iconURL:client.user?.displayAvatarURL?.()})
  .setTimestamp();
 const menu=new StringSelectMenuBuilder().setCustomId('help:category').setPlaceholder('اختار قسم الأوامر').setMinValues(1).setMaxValues(1).addOptions(HELP_CATEGORIES.map(c=>({label:c.label,value:c.value,emoji:c.emoji,description:c.description.slice(0,100),default:c.value===selected})));
 const rows=[new ActionRowBuilder().addComponents(menu)];
 if(totalPages>1){
  const buttons=[];
  buttons.push(new ButtonBuilder().setCustomId(`help:page:${selected}:${currentPage-1}`).setLabel('السابق').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(currentPage===0));
  buttons.push(new ButtonBuilder().setCustomId(`help:page:${selected}:${currentPage+1}`).setLabel('التالي').setEmoji('➡️').setStyle(ButtonStyle.Primary).setDisabled(currentPage>=totalPages-1));
  rows.push(new ActionRowBuilder().addComponents(buttons));
 }
 return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}

// Localize the entire help UI using the selected server language (or the user's
// language when no server default exists). Component IDs/values and slash-command
// identifiers remain unchanged so interactions keep working in every locale.
async function localizedHelpPayload(interaction, category='moderation', page=0){
 const language=i18n.languageFor(interaction);
 const payload=buildHelpPayload(category,page,language);
 try { return await i18n.localizePayload(payload,language); }
 catch(error){ console.error(`[Help] Localization failed for ${language}:`,error.message); throw error; }
}
async function showHelpForInteraction(interaction, category='moderation', page=0){
 const isComponent=interaction.isStringSelectMenu?.()||interaction.isButton?.();
 if(isComponent){
  if(!interaction.deferred&&!interaction.replied) await interaction.deferUpdate();
  const payload=await localizedHelpPayload(interaction,category,page);
  return interaction.editReply(payload);
 }
 if(!interaction.deferred&&!interaction.replied) await interaction.deferReply();
 const payload=await localizedHelpPayload(interaction,category,page);
 return interaction.editReply(payload);
}

client.on('interactionCreate',async i=>{
 let interactionAckTimer = null;
 let interactionAckPromise = null;
 const nativeDeferReply = typeof i.deferReply === 'function' ? i.deferReply.bind(i) : null;
 // If the watchdog already acknowledged the command, a handler's later deferReply must not
 // attempt a second initial response. Reuse the first acknowledgement instead.
 if (nativeDeferReply && i.isChatInputCommand?.()) {
  i.deferReply = async (...args) => {
   if (interactionAckPromise) { await interactionAckPromise; return i; }
   if (i.deferred || i.replied) return i;
   interactionAckPromise = nativeDeferReply(...args);
   return interactionAckPromise;
  };
 }
 // A slow handler must acknowledge slash commands before Discord's 3-second deadline.
 // The reply wrapper below converts a later reply() into editReply() if this watchdog fires.
 if (i.isChatInputCommand?.()) {
  interactionAckTimer = setTimeout(() => {
   if (!i.replied && !i.deferred && !interactionAckPromise && i.isRepliable()) {
    interactionAckPromise = i.deferReply().then(() => {
     console.warn(`[Interactions] Auto-deferred slow /${i.commandName} in guild ${i.guildId || 'DM'} to preserve the acknowledgement deadline.`);
    }).catch(error => {
     if (error?.code !== 10062 && error?.rawError?.code !== 10062) console.warn(`[Interactions] Could not auto-defer /${i.commandName}:`, error?.message || error);
    });
   }
  }, 1750);
  if (typeof interactionAckTimer.unref === 'function') interactionAckTimer.unref();
 }
 try{
 // Arabic guild command names are mapped back to their original handler identifiers.
 if (i.isChatInputCommand?.() || i.isAutocomplete?.()) {
  const canonicalName = commandLocales.canonicalCommandName(i.commandName);
  if (canonicalName !== i.commandName) Object.defineProperty(i, 'commandName', { configurable: true, value: canonicalName });
 }
 // Language options use autocomplete so the list can exceed Discord's 25-choice limit.
 // Handle these before the response wrapper so native language names and language codes stay untouched.
 if(i.isAutocomplete()){
  const focused=i.options.getFocused(true);
  const languageAutocomplete=(i.commandName==='language'||i.commandName==='serverlanguage')&&focused.name==='language';
  const translationAutocomplete=i.commandName==='translate'&&['target','source'].includes(focused.name);
  if(languageAutocomplete||translationAutocomplete)return i.respond(i18n.languageAutocomplete(focused.value));
  return i.respond([]);
 }
 // Apply the configured server language to every command response in a guild.
 // Personal language is a fallback for DMs or guilds without a configured default.
 // IDs, URLs and component values are preserved by the localization layer.
 if(!i.__i18nWrapped){
  Object.defineProperty(i,'__i18nWrapped',{value:true,configurable:false});
  for(const method of ['reply','editReply','followUp','update','showModal','respond']){
   if(typeof i[method]!=='function')continue;
   const original=i[method].bind(i);
   i[method]=async payload=>{
    // A slash-command reply must be acknowledged BEFORE waiting for any translation
    // provider. Remote translation can take seconds or be rate-limited, while Discord's
    // initial interaction response deadline is only 3 seconds.
    let localized=payload;
    if (method === 'reply' && i.isChatInputCommand?.() && !i.deferred && !i.replied) {
     try {
      const flags = payload && typeof payload === 'object' ? Number(payload.flags || 0) : 0;
      const ephemeral = Boolean(payload && typeof payload === 'object' && payload.ephemeral) || (flags & 64) === 64;
      const deferOptions = ephemeral ? { flags: 64 } : {};
      if (!interactionAckPromise) interactionAckPromise = i.deferReply(deferOptions);
      await interactionAckPromise;
     } catch (ackError) {
      // If another path already acknowledged the interaction, continue below and use
      // editReply/followUp as appropriate. Real acknowledgement failures are logged.
      if (!i.deferred && !i.replied) console.warn(`[Interactions] Early acknowledgement failed for /${i.commandName}:`, ackError?.message || ackError);
     }
    }
    try {
     if (method === 'update' && !i.deferred && !i.replied && typeof i.deferUpdate === 'function') {
      await i.deferUpdate();
     }
     if (method === 'showModal' || method === 'respond') {
      // Modal/autocomplete acknowledgements have stricter response semantics; do not
      // hold them on a remote provider. Their text must be supplied pre-localized.
      localized=payload;
      if (method === 'showModal') console.warn('[i18n] Modal text bypassed runtime translation; use static locale strings for modal titles/labels.');
     } else {
      localized=await i18n.localizePayload(payload,i18n.languageFor(i));
     }
    } catch(error) {
     console.error(`[i18n] Response localization failed for ${i18n.languageFor(i)}:`,error.message);
     localized=payload;
    }
    try { localized=polishEmbedPayload(localized,i.guild?.id||null,i.guild?.name||''); } catch(error) { console.warn('Embed styling fallback:',error.message); }
    if (method === 'reply' && interactionAckPromise) {
     try { await interactionAckPromise; } catch {}
    }
    if (method === 'reply' && i.deferred && typeof i.editReply === 'function') return i.editReply(localized);
    if (method === 'reply' && i.replied && typeof i.followUp === 'function') return i.followUp(localized);
    if (method === 'update' && i.deferred && typeof i.editReply === 'function') return i.editReply(localized);
    return original(localized);
   };
  }
 }
 if(i.isChatInputCommand?.()&&i.commandName==='automod')return await automod.handle(i);
 if(communityTools.handles(i)&&!i.isChatInputCommand())return await communityTools.handleInteraction(i);
 if((i.isChatInputCommand()&&i.commandName==='games')||(i.isButton()&&/^(rlt:|roulette:|quiz:|join:|start:|xo:)/.test(i.customId))){const rouletteHandled=await games.rouletteService.handle(i);if(rouletteHandled!==false)return;const handled=await games.handle(i);if(handled!==false)return;}
 // ── Per-user command rate limit ──────────────────────────────────────────────
if(i.isChatInputCommand()){
  const rl=cmdLimiter.check(`${i.guild?.id||'dm'}:${i.user.id}`);
  if(!rl.ok){
    const secs=Math.ceil(rl.retryAfterMs/1000);
    return i.reply({content:`You are sending commands too fast. Please wait ${secs} second${secs!==1?'s':''}.`,flags:64});
  }
}
// ─────────────────────────────────────────────────────────────────────────────
if(i.isChatInputCommand()&&i.commandName==='community')return await communityTools.handleInteraction(i);
 if(transferTax.handles(i)){await transferTax.handle(i);return;}
 if(islamicAutopost.handles(i)){await islamicAutopost.handle(i);return;}
if(i.isChatInputCommand()&&extras.handles(i.commandName)){await extras.handle(i,extrasCtx);return;}
 if((i.isChannelSelectMenu()||i.isRoleSelectMenu())&&i.customId.startsWith('sp:')){
  if(!i.guild||!canManagePanels(i.member))return i.reply({content:'Discord Administrator permission is required to change this panel.'});
  const [,kind,system]=i.customId.split(':'),panel=CONTROL_PANELS[system];if(!panel)return i.reply({content:'Unknown panel system.'});const id=i.values[0];
  if(kind==='channel'){audit(i.guild.id,i.user.id,`dedicated_panel_${system}_channel_set`,id);
  } else if(kind==='category'){updateGuildSettings(i.guild.id,setPathPatch(panel.categoryPath,id));audit(i.guild.id,i.user.id,'dedicated_panel_tempVoice_category_set',id);}
  else if(kind==='role'){
   const role=i.guild.roles.cache.get(id);if(!role||role.managed||role.id===i.guild.id)return i.reply({content:'Choose a regular, assignable role.'});
   if(['verification.roleId','autorole.roleId'].includes(panel.rolePath)&&role.position>=i.guild.members.me.roles.highest.position)return i.reply({content:'Move the bot role above this role before selecting it.'});audit(i.guild.id,i.user.id,`dedicated_panel_${system}_role_set`,id);
  }
  return i.reply({content:`Saved ${PANEL_ART[system][0]} settings for this server. The dedicated panel stays in place.`});
 }
 if(i.isStringSelectMenu()&&i.customId==='help:category'){
  const chosen=i.values?.[0]||'moderation';
  return showHelpForInteraction(i,chosen,0);
 }
 if(i.isButton()&&i.customId.startsWith('help:page:')){
  const [, , chosen, pageText]=i.customId.split(':');
  const page=Number.parseInt(pageText,10);
  return showHelpForInteraction(i,chosen,Number.isFinite(page)?page:0);
 }
 if(i.isStringSelectMenu()&&i.customId==='ctl:system'){
  if(!i.guild||!canManagePanels(i.member))return i.reply({content:'You need Manage Server, Administrator, or a configured staff role.'});
  return i.update(controlPayload(i.guild,i.values[0]));
 }
 if((i.isChannelSelectMenu()||i.isRoleSelectMenu())&&i.customId.startsWith('ctl:')){
  if(!i.guild||!canManagePanels(i.member))return i.reply({content:'You need Manage Server, Administrator, or a configured staff role.'});
  const [,kind,system]=i.customId.split(':');const panel=CONTROL_PANELS[system];if(!panel)return i.reply({content:'Unknown control panel. Run /control again.'});
  const id=i.values[0];
  if(kind==='channel'){
  } else if(kind==='category'){updateGuildSettings(i.guild.id,setPathPatch(panel.categoryPath,id));audit(i.guild.id,i.user.id,'control_tempvoice_category_set',id);}
  else if(kind==='role'){
   const role=i.guild.roles.cache.get(id);if(!role||role.managed||role.id===i.guild.id)return i.reply({content:'Choose a regular, assignable role.'});
  }
  return i.update(controlPayload(i.guild,system));
 }
 if(i.isButton()&&i.customId.startsWith('ctl:')){
  if(!i.guild||!canManagePanels(i.member))return i.reply({content:'You need Manage Server, Administrator, or a configured staff role.'});
  const [,action,system]=i.customId.split(':');
  if(action==='refresh')return i.update(controlPayload(i.guild,CONTROL_PANELS[system]?system:'welcome'));
  if(action==='toggle'){
   const panel=CONTROL_PANELS[system];if(!panel?.enabledPath)return i.reply({content:'This system has no on/off toggle here.'});
   const old=Boolean(getPath(settings(i.guild.id),panel.enabledPath));updateGuildSettings(i.guild.id,setPathPatch(panel.enabledPath,!old));audit(i.guild.id,i.user.id,`control_${system}_${!old?'enabled':'disabled'}`);return i.update(controlPayload(i.guild,system));
  }
  if(action==='post-verification'){
   const c=settings(i.guild.id),channelId=c.verification?.channelId,roleId=c.verification?.roleId,channel=channelId?i.guild.channels.cache.get(channelId):null;
   if(!channel?.isTextBased()||!validId(roleId))return i.reply({content:'Choose the verification channel and role first.'});
   const bot=i.guild.members.me,role=i.guild.roles.cache.get(roleId);if(!bot?.permissions.has(PermissionFlagsBits.ManageRoles)||!role||role.position>=bot.roles.highest.position)return i.reply({content:'The bot needs Manage Roles and its highest role must be above the verification role.'});
   const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('member_verify').setLabel('Verify me').setStyle(ButtonStyle.Success));await channel.send({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle('Member verification').setDescription(`Press the button below to receive ${role}.`) ],components:[row],allowedMentions:{parse:[]}});return i.reply({content:`Verification panel published in ${channel}.`});
  }
  if(action==='backup'){
   if(!i.memberPermissions?.has(PermissionFlagsBits.Administrator))return i.reply({content:'Administrator permission is required to export the server structure.'});
   await i.deferReply({flags:MessageFlags.Ephemeral});try{const data=await makeServerBackup(i.guild),buffer=Buffer.from(JSON.stringify(data,null,2));return i.editReply({content:'Server structure template ready. It includes roles, channels and permission overwrites, not messages or member data.',files:[new AttachmentBuilder(buffer,{name:`server-template-${i.guild.id}.json`})]});}catch(e){console.error('Control panel backup failed:',e);return i.editReply({content:'Could not create the backup template. Check bot permissions and logs.'});}
  }
 }
 if(i.isButton()){

  if(i.customId==='member_verify'){const g=i.guild;if(!g||!i.member)return i.reply({content:'Use verification inside the server.'});const c=settings(g.id),roleId=c.verification?.roleId;if(!c.verification?.enabled||!validId(roleId))return i.reply({content:'Verification is not configured correctly. Contact a server administrator.'});const role=g.roles.cache.get(roleId);if(!role||role.managed||!g.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)||role.position>=g.members.me.roles.highest.position)return i.reply({content:'The configured verification role cannot be assigned. Contact a server administrator.'});const member=await g.members.fetch(i.user.id).catch(()=>null);if(!member)return i.reply({content:'Could not find your server membership. Try again.'});if(member.roles.cache.has(roleId))return i.reply({content:`You are already verified and have ${role}.`});try{await member.roles.add(roleId,'Member completed verification button');audit(g.id,i.user.id,'member_verified',roleId);await sendGuildLog(g,{title:'Member verified',description:`${member.user.tag} completed the verification panel.`,userId:member.id,action:'verification_completed',details:`Role: ${role.name}`});return i.reply({content:`Verification complete. You received ${role}.`});}catch(e){console.error('Verification role assignment failed:',e.message);return i.reply({content:'Verification failed because the bot could not assign the role. Please contact an administrator.'});}}
  if(i.customId==='ticket_open'){const g=i.guild;if(!g)return i.reply({content:'Use tickets in a server.'});if(!settings(g.id).tickets?.enabled)return i.reply({content:'Tickets are disabled for this server.'});const lockKey=`${g.id}:${i.user.id}`;const existing=g.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.topic===`ticket-owner:${i.user.id}`);const trackedTicket=db.prepare('SELECT channel_id FROM tickets WHERE guild_id=? AND owner_id=?').get(g.id,i.user.id);if(trackedTicket&&!g.channels.cache.has(trackedTicket.channel_id))db.prepare('DELETE FROM tickets WHERE channel_id=?').run(trackedTicket.channel_id);if(existing||ticketCreationLocks.has(lockKey)||(trackedTicket&&g.channels.cache.has(trackedTicket.channel_id)))return i.reply({content:`You already have a ticket${existing?`: ${existing}`:''}.`});ticketCreationLocks.add(lockKey);try{const c=settings(g.id),over=[{id:g.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];if(validId(c.tickets?.supportRoleId)&&g.roles.cache.has(c.tickets.supportRoleId))over.push({id:c.tickets.supportRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});const opts={name:`ticket-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90),type:ChannelType.GuildText,topic:`ticket-owner:${i.user.id}`,permissionOverwrites:over};if(validId(c.tickets?.categoryId))opts.parent=c.tickets.categoryId;const ch=await g.channels.create(opts);try{db.prepare('INSERT INTO tickets(channel_id,guild_id,owner_id,created_at) VALUES(?,?,?,?)').run(ch.id,g.id,i.user.id,Date.now());}catch(err){await ch.delete('Ticket creation race cleanup').catch(()=>{});throw err;}const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Close ticket').setStyle(ButtonStyle.Danger));await ch.send({content:`${i.user} opened a ticket. Describe your issue here.`,components:[row]});return i.reply({content:`Ticket created: ${ch}`});}finally{ticketCreationLocks.delete(lockKey);}}
  if(i.customId==='ticket_close'){const row=db.prepare('SELECT * FROM tickets WHERE channel_id=?').get(i.channelId);if(!row)return i.reply({content:'Ticket record not found.'});const c=settings(i.guild.id),staff=moderator(i.member)||(validId(c.tickets?.supportRoleId)&&i.member.roles.cache.has(c.tickets.supportRoleId));if(i.user.id!==row.owner_id&&!staff)return i.reply({content:'Only ticket owner/support staff can close this.'});await i.reply('Ticket closing in 5 seconds.');const closingChannel=i.channel;setTimeout(async()=>{try{await closingChannel.delete('Ticket closed');db.prepare('DELETE FROM tickets WHERE channel_id=?').run(closingChannel.id);}catch(err){console.error('Ticket close failed; database record retained for recovery:',err.message);}},5000);return;}
 }
 if(!i.isChatInputCommand())return;
 const n=i.commandName,g=i.guild,u=i.user;let m=i.member;
 if(['badge-role-set','badge-role-clear','sync-badges'].includes(n)){
  if(!g||!m)return i.reply({content:'This command can only be used inside a server.',flags:64});
  const canConfigureBadgeRoles=Boolean(m.permissions?.has(PermissionFlagsBits.Administrator)||m.permissions?.has(PermissionFlagsBits.ManageGuild)||roleHas(m,config.moderation?.adminRoleIds));
  const canSyncBadgeRoles=canConfigureBadgeRoles||roleHas(m,config.moderation?.moderatorRoleIds)||Boolean(m.permissions?.has(PermissionFlagsBits.ManageRoles));
  if(n==='sync-badges'&&!canSyncBadgeRoles)return i.reply({content:'You need Administrator, Manage Server, Manage Roles, or a configured staff role to synchronize badge roles.',flags:64});
  if(n!=='sync-badges'&&!canConfigureBadgeRoles)return i.reply({content:'You need Administrator, Manage Server, or a configured admin role to change badge-role mappings.',flags:64});
  const roleMap=settings(g.id).badgeRoles||{};
  if(n==='badge-role-set'){
   const badge=i.options.getString('badge',true), role=i.options.getRole('role',true);
   if(!Object.prototype.hasOwnProperty.call(BADGE_LABELS,badge))return i.reply({content:'Unsupported badge selection.',flags:64});
   if(role.guild.id!==g.id||role.managed||!g.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)||g.members.me.roles.highest.comparePositionTo(role)<=0)
    return i.reply({content:'I cannot manage that role. Make sure it is not an integration role, give me Manage Roles, and move my highest role above the selected role.',flags:64});
   updateGuildSettings(g.id,{badgeRoles:{[badge]:role.id}});
   return i.reply({content:`✅ Mapping saved for this server: **${BADGE_LABELS[badge]}** → ${role}. On member join and server boost changes, the bot will reconcile this role automatically. Use /sync-badges to process everyone now.`,flags:64});
  }
  if(n==='badge-role-clear'){
   const badge=i.options.getString('badge',true);
   if(!Object.prototype.hasOwnProperty.call(BADGE_LABELS,badge))return i.reply({content:'Unsupported badge selection.',flags:64});
   if(!roleMap[badge])return i.reply({content:`No role mapping is configured for **${BADGE_LABELS[badge]}**.`,flags:64});
   updateGuildSettings(g.id,{badgeRoles:{[badge]:''}});
   return i.reply({content:`✅ Cleared the role mapping for **${BADGE_LABELS[badge]}** in this server. Existing roles are not removed automatically by clearing the mapping.`,flags:64});
  }
  await i.deferReply({flags:64});
  try{
   const configured=Object.entries(roleMap).some(([badge,roleId])=>Object.prototype.hasOwnProperty.call(BADGE_LABELS,badge)&&typeof roleId==='string'&&/^\d{17,20}$/.test(roleId));
   if(!configured)return i.editReply('No badge roles are configured for this server yet. Use /badge-role-set to map each badge to a role first.');
   const result=await badgeRoleManager.syncGuild(g,roleMap,async progress=>{
    if(progress.processed%100===0||progress.processed===progress.total){
     await i.editReply(`🔄 Badge-role sync in progress: ${progress.processed}/${progress.total} members · added ${progress.added} · removed ${progress.removed} · skipped ${progress.skipped} · errors ${progress.errors}`).catch(()=>{});
    }
   });
   return i.editReply(`✅ Badge-role sync finished for **${g.name}**.\nMembers processed: ${result.processed}/${result.total}\nRoles added: ${result.added}\nRoles removed: ${result.removed}\nSkipped: ${result.skipped}\nErrors: ${result.errors}\nRate-limit protection: enabled (minimum ${Math.max(500,Number(process.env.BADGE_ROLE_DELAY_MS)||750)} ms between role changes).`);
  }catch(error){
   console.error(`[BadgeRoles] Guild sync failed for ${g.id}:`,error);
   return i.editReply(`❌ Badge-role sync failed: ${String(error.message||'Unknown error').slice(0,700)}`).catch(()=>{});
  }
 }
 if(n==='profilewidget')return i.reply({content:'Discord currently does not allow new custom developer-created profile widgets from the ended experiment. Official Game Stats Widgets require an eligible claimed game, Social SDK and account linking; a regular bot cannot claim a game merely to show arbitrary bot data. An external profile page is possible, but it is not a native Discord profile widget.',flags:64});
 if(n==='delete-whitelist-add'||n==='delete-whitelist-remove'||n==='delete-whitelist-list'){
  if(!process.env.BOT_OWNER_ID||u.id!==process.env.BOT_OWNER_ID)return i.reply({content:'الأوامر دي مخصصة لأونر البوت فقط. اضبط BOT_OWNER_ID في ملف .env.',flags:64});
  if(n==='delete-whitelist-add'){const target=i.options.getUser('user',true);if(target.bot)return i.reply({content:'مينفعش تضيف بوت للوايت ليست.',flags:64});db.prepare('INSERT INTO delete_whitelist(user_id,added_by,added_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET added_by=excluded.added_by,added_at=excluded.added_at').run(target.id,u.id,Date.now());audit(g?.id||'global',u.id,'delete_whitelist_add',target.id);return i.reply({content:`تمت إضافة ${target.tag} إلى وايت ليست حذف القنوات. يقدر يستخدم /delete-all-channels داخل السيرفرات اللي البوت موجود فيها، مع كتابة التأكيد الصحيح.`,flags:64});}
  if(n==='delete-whitelist-remove'){const target=i.options.getUser('user',true);const result=db.prepare('DELETE FROM delete_whitelist WHERE user_id=?').run(target.id);if(result.changes)audit(g?.id||'global',u.id,'delete_whitelist_remove',target.id);return i.reply({content:result.changes?`تم حذف ${target.tag} من الوايت ليست.`:`${target.tag} مش موجود في الوايت ليست.`,flags:64});}
  const users=db.prepare('SELECT user_id,added_at FROM delete_whitelist ORDER BY added_at DESC').all();return i.reply({content:users.length?`**وايت ليست حذف القنوات (${users.length}):**\n${users.map((x,k)=>`${k+1}. <@${x.user_id}> — \`${x.user_id}\``).join('\n')}`:'وايت ليست حذف القنوات فارغة.',flags:64});
 }
 if(n==='delete-all-channels'){
  if(!g)return i.reply({content:'Use this command inside the server.',flags:64});
  const whitelisted=!!db.prepare('SELECT 1 FROM delete_whitelist WHERE user_id=?').get(u.id);
  if(u.id!==g.ownerId&&(!process.env.BOT_OWNER_ID||u.id!==process.env.BOT_OWNER_ID)&&!whitelisted)return i.reply({content:'مسموح فقط لمالك السيرفر أو أونر البوت أو شخص أضافه أونر البوت إلى وايت ليست الحذف.',flags:64});
  if(i.options.getString('confirm',true)!=='DELETE ALL CHANNELS')return i.reply({content:'لم يتم الحذف. اكتب DELETE ALL CHANNELS حرفيًا في خانة التأكيد.',flags:64});
  const botMember=g.members.me||await g.members.fetch(client.user.id).catch(()=>null);
  if(!botMember?.permissions.has(PermissionFlagsBits.ManageChannels))return i.reply({content:'البوت يحتاج صلاحية Manage Channels لحذف القنوات.',flags:64});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const targets=[...g.channels.cache.values()].filter(c=>c.deletable);
  const ordinary=targets.filter(c=>c.type!==ChannelType.GuildCategory),categories=targets.filter(c=>c.type===ChannelType.GuildCategory);
  let deleted=0;const failed=[];
  for(const channel of [...ordinary,...categories]){try{await channel.delete(`Bulk channel deletion requested by authorized owner ${u.id}`);deleted++;}catch(err){failed.push(`${channel.name}: ${String(err.message||'delete failed').slice(0,100)}`);}}
  audit(g.id,u.id,'delete_all_channels',g.id,`deleted=${deleted};failed=${failed.length}`);
  const details=failed.slice(0,8).join('\n');
  return i.editReply(`انتهى حذف القنوات.\nتم الحذف: **${deleted}**\nتعذر حذف: **${failed.length}**${details?`\n\n${details}`:''}\n\nملاحظة: لا يمكن التراجع عن حذف القنوات ورسائلها.`);
 }
 if(n==='botstatus'){
  if(!process.env.BOT_OWNER_ID||u.id!==process.env.BOT_OWNER_ID)return i.reply({content:'This command is restricted to the configured bot owner (BOT_OWNER_ID).',flags:64});
  const type=i.options.getString('type',true),value=i.options.getString('text')?.trim();
  if(type!=='clear'&&!value)return i.reply({content:'Enter status text, or choose Clear status.',flags:64});
  const {ActivityType}=require('discord.js');
  if(type==='clear'){client.user.setPresence({activities:[],status:'online'});db.prepare('DELETE FROM bot_preferences WHERE key=?').run('status');return i.reply({content:'Bot activity status cleared.',flags:64});}
  const types={playing:ActivityType.Playing,watching:ActivityType.Watching,listening:ActivityType.Listening,competing:ActivityType.Competing};
  client.user.setPresence({activities:[{name:value,type:types[type]}],status:'online'});
  db.prepare('INSERT INTO bot_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run('status',JSON.stringify({type,text:value}),Date.now());
  return i.reply({content:`Bot activity updated to **${type} ${value}**.`,flags:64});
 }
 if(n==='botdescription'){
  if(!process.env.BOT_OWNER_ID||u.id!==process.env.BOT_OWNER_ID)return i.reply({content:'This command is restricted to the configured bot owner (BOT_OWNER_ID).',flags:64});
  const value=i.options.getString('text',true).trim();
  db.prepare('INSERT INTO bot_preferences(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run('description',value,Date.now());
  return i.reply({content:'Saved as the description for the bot info card. Discord has no official bot API to change the Application Description field in Developer Portal.',flags:64});
 }
 if(!g)return i.reply({content:'Use this command in a server.'});if(!m?.roles?.highest)m=await g.members.fetch(u.id).catch(()=>null);if(!m)return i.reply({content:'Could not verify your server membership. Try again.'});
 if(n==='control'){if(!canManagePanels(m))return i.reply({content:'You need Manage Server, Administrator, or a configured staff role.'});return i.reply({...controlPayload(g)});}
 if(n==='publish-panel'){
  if(!canManagePanels(m))return i.reply({content:'لازم تكون عندك صلاحية Administrator في ديسكورد عشان تنشر أو تتحكم في اللوحات.'});
  const system=i.options.getString('system',true),channel=i.options.getChannel('channel',true),panel=CONTROL_PANELS[system];if(!panel||!PANEL_ART[system])return i.reply({content:'اختار لوحة نظام مدعومة.'});
  if(channel.guildId!==g.id||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(channel.type))return i.reply({content:'اختار روم نصي أو إعلانات من نفس السيرفر.'});
  const botPerms=channel.permissionsFor(g.members.me);if(!botPerms?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory]))return i.reply({content:'البوت محتاج View Channel وSend Messages وEmbed Links وAttach Files وRead Message History في الروم المختار.'});
  await i.deferReply();try{const saved=settings(g.id).controlPanels?.[system]||{};const oldChannel=saved.channelId?(g.channels.cache.get(saved.channelId)||await g.channels.fetch(saved.channelId).catch(()=>null)):null;const oldMessage=oldChannel?.isTextBased()&&saved.messageId?await oldChannel.messages.fetch(saved.messageId).catch(()=>null):null;const art=panelImageChoice(g,system,saved);const message=await channel.send({...dedicatedPanelPayload(g,system,art.url,u),files:art.files,allowedMentions:{parse:[]}});if(oldMessage?.author?.id===client.user.id)await oldMessage.delete().catch(e=>console.warn(`Could not remove replaced ${system} panel:`,e.message));saveDedicatedPanel(g.id,system,channel.id,message.id,{imageMode:saved.imageMode||'default',imageUrl:saved.imageUrl||null,style:saved.style||'premium'});let pinned=false;try{if(botPerms.has(PermissionFlagsBits.ManageMessages)){await message.pin('Dedicated persistent system control panel');pinned=true;}}catch(e){console.warn(`Could not pin ${system} panel:`,e.message);}audit(g.id,u.id,'dedicated_panel_published',message.id,`system=${system}; channel=${channel.id}; pinned=${pinned}; imageMode=${saved.imageMode||'default'}`);return i.editReply({content:`تم نشر لوحة ${PANEL_ART[system][0]} في ${channel} ${pinned?'وتثبيتها بنجاح.':'لكن تعذر تثبيتها؛ امنح البوت صلاحية Manage Messages.'} اللوحة عامة، أما التحكم في إعداداتها والصورة فمخصص لحاملي Administrator.`});}catch(e){console.error('Publish dedicated panel failed:',e);return i.editReply({content:`تعذر نشر اللوحة. راجع صلاحيات البوت وملفات الصور. التفاصيل: ${String(e.message||'خطأ غير معروف').slice(0,350)}`});}
 }
 if(n==='panel-style'){
  if(!canManagePanels(m))return i.reply({content:'لازم تكون Administrator لتغيير تصميم اللوحات.'});
  const system=i.options.getString('system',true),style=i.options.getString('style',true);
  if(!CONTROL_PANELS[system]||!PANEL_ART[system])return i.reply({content:'اختار لوحة مدعومة.'});
  const current=settings(g.id).controlPanels||{},saved=current[system]||{};
  updateGuildSettings(g.id,{controlPanels:{...current,[system]:{...saved,style}}});
  await i.deferReply({flags:64});
  try{if(saved.channelId&&saved.messageId){const result=await replaceDedicatedPanel(g,system,u);audit(g.id,u.id,'dedicated_panel_style_changed',result.message.id,`system=${system}; style=${style}`);return i.editReply({content:`تم تغيير تصميم لوحة ${PANEL_ART[system][0]} إلى ${style} وتحديثها في ${result.channel}.`});}return i.editReply({content:`تم حفظ تصميم ${style} للوحة ${PANEL_ART[system][0]}. عند نشرها بأمر /publish-panel سيظهر التصميم المختار.`});}
  catch(e){console.error('Panel style update failed:',e);return i.editReply({content:`تم حفظ التصميم، لكن تعذر تحديث اللوحة المنشورة: ${String(e.message||'خطأ').slice(0,250)}. أعد نشرها بأمر /publish-panel.`});}
 }
 if(n==='panel-image'){
  if(!canManagePanels(m))return i.reply({content:'لازم تكون عندك صلاحية Administrator في ديسكورد لتغيير صور اللوحات.'});const system=i.options.getString('system',true),mode=i.options.getString('source',true),rawUrl=i.options.getString('image_url');if(!CONTROL_PANELS[system]||!PANEL_ART[system])return i.reply({content:'اختار لوحة مدعومة.'});let imageUrl=null;if(mode==='custom'){try{const parsed=new URL(rawUrl||'');if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw new Error('invalid');imageUrl=parsed.toString();}catch{return i.reply({content:'لازم تدخل رابط صورة مباشر وصالح يبدأ بـ HTTPS. بعض روابط المواقع مش روابط صور مباشرة.'});}}
  await i.deferReply();const current=settings(g.id).controlPanels||{};updateGuildSettings(g.id,{controlPanels:{...current,[system]:{...(current[system]||{}),imageMode:mode,imageUrl:mode==='custom'?imageUrl:null}}});try{const saved=settings(g.id).controlPanels?.[system]||{};if(saved.channelId&&saved.messageId){const result=await replaceDedicatedPanel(g,system,u);audit(g.id,u.id,'dedicated_panel_image_changed',result.message.id,`system=${system}; mode=${mode}; pinned=${result.pinned}`);return i.editReply({content:`تم تغيير صورة لوحة ${PANEL_ART[system][0]} إلى ${mode==='default'?'الصورة الافتراضية':mode==='server'?'أيقونة السيرفر':'الصورة المخصصة'} وتحديث اللوحة في ${result.channel}.${result.pinned?' وتم تثبيتها من جديد.':''}`});}return i.editReply({content:`تم حفظ اختيار الصورة للوحة ${PANEL_ART[system][0]}. انشرها باستخدام /publish-panel وسيتم تطبيق الاختيار تلقائيًا.`});}catch(e){console.error('Panel image update failed:',e);return i.editReply({content:`تم حفظ اختيار الصورة، لكن تعذر تحديث الرسالة الحالية: ${String(e.message||'خطأ غير معروف').slice(0,300)}. جرّب /publish-panel بعد مراجعة الصلاحيات.`});}
 }
 if(n==='language'){
  const requested=i.options.getString('language',true),lang=i18n.setUserLanguage(u.id,requested);
  if(g&&i18n.getServerLanguage(g.id))return i.reply({content:`Personal language preference saved for DMs. This server uses ${i18n.languageName(i18n.getServerLanguage(g.id))} for all bot replies.`});
  return i.reply({content:i18n.message(i,'languageSet',{language:i18n.languageName(lang)})});
 }
 if(n==='serverlanguage'){
  if(!admin(m)&&!m.permissions.has(PermissionFlagsBits.ManageGuild))return i.reply({content:i18n.message(i,'serverAdmin')});
  const requested=i.options.getString('language',true),lang=i18n.setServerLanguage(g.id,requested);
  let commandSyncMessage='';
  try { const sync = await syncGuildSlashCommands(g, lang); commandSyncMessage = lang==='ar' ? `\n\n✅ تم تحديث أسماء أوامر السيرفر: ${sync.created} جديد، ${sync.updated} محدث.` : `\n\n✅ Server command names updated: ${sync.created} created, ${sync.updated} updated.`; }
  catch(error) { commandSyncMessage = lang==='ar' ? `\n\n⚠️ تم حفظ اللغة لكن تعذر تحديث أسماء الأوامر: ${String(error.message||'خطأ غير معروف').slice(0,220)}` : `\n\n⚠️ Language saved, but command names could not be updated: ${String(error.message||'unknown error').slice(0,220)}`; console.error('Could not sync localized guild commands:', error); }
  let logResult=null,logWarning='';
  try{if(Object.keys(settings(g.id).logs?.channels||{}).length)logResult=await renameManagedLogCatalog(g,lang);}catch(error){logWarning=`\n\n⚠️ تم تغيير لغة البوت، لكن تعذر تغيير أسماء قنوات اللوج: ${String(error.message||'خطأ غير معروف').slice(0,250)}. تأكد من صلاحية Manage Channels.`;console.warn('Could not rename log catalog after server language change:',error.message);}
  const extra=logResult?`\n\n✅ تم تحديث ${logResult.renamed} قناة لوج و${logResult.categories} تصنيفًا دون حذف القنوات أو الرسائل القديمة.`:'';
  return i.reply({content:i18n.message(i,'serverLanguageSet',{language:i18n.languageName(lang)})+commandSyncMessage+extra+logWarning});
 }
 if(n==='serverlanguagereset'){
  if(!g)return i.reply({content:'Use this command inside a server.',flags:64});
  if(!m?.permissions?.has(PermissionFlagsBits.Administrator)&&!m?.permissions?.has(PermissionFlagsBits.ManageGuild))return i.reply({content:i18n.message(i,'serverAdmin'),flags:64});
  try{
   const hadLanguage=i18n.clearServerLanguage(g.id);
   let commandSyncNote='';
   try { const sync=await syncGuildSlashCommands(g,'en'); commandSyncNote=`\n\n✅ رجعت أسماء الأوامر للإنجليزية (${sync.created} جديد، ${sync.updated} محدث).`; } catch(error) { commandSyncNote=`\n\n⚠️ تعذر تحديث أسماء الأوامر: ${String(error.message||'خطأ غير معروف').slice(0,200)}`; console.error('Could not reset guild command names:',error); }
   const message=hadLanguage
    ? `✅ تم مسح اللغة الافتراضية المحفوظة للسيرفر. رجع البوت لاختيار اللغة تلقائيًا، وتقدر تحدد لغة جديدة باستخدام \`${commandLocales.commandNameForLanguage('serverlanguage','en')}\` أو تختار العربية من جديد.`
    : `ℹ️ مفيش لغة افتراضية محفوظة للسيرفر حاليًا. تقدر تحدد لغة باستخدام \`${commandLocales.commandNameForLanguage('serverlanguage','en')}\`.`;
   return i.reply({content:message+commandSyncNote,flags:64});
  }catch(error){
   console.error('Could not reset server language:',error);
   return i.reply({content:`تعذر مسح لغة السيرفر: ${String(error.message||'خطأ غير معروف').slice(0,250)}`,flags:64});
  }
 }
 if(n==='translate'){
  const textToTranslate=i.options.getString('text',true),target=i.options.getString('target')||i18n.languageFor(i),source=i.options.getString('source')||i18n.detectSourceLanguage(textToTranslate);
  await i.deferReply();
  try{
   const translated=await i18n.translateText(textToTranslate,source,target);
   const embed=new EmbedBuilder().setColor(0x3446A8).setTitle(i18n.message(i,'translationTitle')).setDescription(translated.slice(0,4000)).setFooter({text:i18n.message(i,'translationFooter',{source:i18n.languageName(source),target:i18n.languageName(target)})});
   return i.editReply({embeds:[embed]});
  }catch(error){return i.editReply(i18n.message(i,'translationFailed',{error:String(error.message||'unknown error').slice(0,700)}));}
 }
 if(n==='server-clone'){
  const sourceId=i.options.getString('source_id',true).trim(),targetId=i.options.getString('target_id',true).trim(),confirmed=i.options.getBoolean('confirm',true);
  if(!validId(sourceId)||!validId(targetId))return i.reply({content:'Both server IDs must be valid 17–20 digit Discord IDs.'});
  if(sourceId===targetId)return i.reply({content:'Source and target IDs must be different.'});
  if(!confirmed)return i.reply({content:'Clone cancelled. Set confirm to true only after checking both server IDs.'});
  await i.deferReply();
  try{
   const source=client.guilds.cache.get(sourceId)||await client.guilds.fetch(sourceId);
   const target=client.guilds.cache.get(targetId)||await client.guilds.fetch(targetId);
   const [sourceActor,targetActor]=await Promise.all([source.members.fetch(i.user.id),target.members.fetch(i.user.id)]);
   if(!sourceActor.permissions.has(PermissionFlagsBits.Administrator)||!targetActor.permissions.has(PermissionFlagsBits.Administrator))throw new Error('For security, you must have Administrator permission in both source and target servers.');
   const sourceBot=await source.members.fetch(client.user.id),targetBot=await target.members.fetch(client.user.id);
   if(!sourceBot.permissions.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageChannels]))throw new Error('The bot needs View Channels, Manage Roles, and Manage Channels in the source server.');
   if(!targetBot.permissions.has([PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageGuild]))throw new Error('The bot needs Administrator, Manage Roles, Manage Channels, and Manage Server in the target server.');
   const originalTargetName=target.name;
   const result=await cloneGuildStructure(source,target);
   audit(target.id,i.user.id,'server_clone',source.id,`roles=${result.rolesMade};channels=${result.channelsMade};warnings=${result.warnings.length}`);
   const warningText=result.warnings.length?`\n\n**Items/settings not fully copied (${result.warnings.length}):**\n${result.warnings.slice(0,6).map(x=>`• ${String(x).slice(0,140)}`).join('\n')}${result.warnings.length>6?'\n• Additional warnings omitted.':''}`:'';
   return i.editReply(`**Server clone finished (additive).**\nSource: **${source.name}** (${source.id})\nTarget: **${originalTargetName} → ${target.name}** (${target.id})\nRoles created: ${result.rolesMade}\nChannels created: ${result.channelsMade}\nExisting target content was not deleted. Member messages, threads/messages, member-posted images, members, integrations, and webhooks were not copied.${warningText}`);
  }catch(e){console.error('Server clone failed:',e);audit(i.guildId||'0',i.user.id,'server_clone_failed',targetId,e.message);return i.editReply(`Clone could not complete: ${String(e.message||'unknown error').slice(0,700)}. Any roles/channels created before a later settings/asset failure may remain; review the target before retrying.`);}
 }
 if(n==='server-backup'){
  if(!admin(m))return i.reply({content:'Administrator permission required.'});
  await i.deferReply({flags:MessageFlags.Ephemeral});const data=await makeServerBackup(g);const file=Buffer.from(JSON.stringify(data,null,2));if(file.length>8*1024*1024)return i.editReply('Backup exceeds Discord upload limits. Use a server with fewer channels/roles or a higher upload limit.');audit(g.id,u.id,'server_backup',g.id,`roles=${data.roles.length};channels=${data.channels.length}`);return i.editReply({content:`Backup template created. It includes ${data.roles.length} roles and ${data.channels.length} channels. It does not include messages, members, integrations, webhooks, or emojis.`,files:[new AttachmentBuilder(file,{name:`im-your-daddy-server-template-${g.id}.json`})]});
 }
 if(n==='server-restore'){
  if(!admin(m))return i.reply({content:'Administrator permission required.'});
  const attachment=i.options.getAttachment('file',true);if(!attachment.name.toLowerCase().endsWith('.json')||attachment.size>2*1024*1024)return i.reply({content:'Upload a JSON backup file no larger than 2 MB.'});
  await i.deferReply();try{const r=await fetch(attachment.url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Could not download the attachment.');const buf=Buffer.from(await r.arrayBuffer());if(buf.length>2*1024*1024)throw new Error('Backup file is too large.');const data=JSON.parse(buf.toString('utf8'));const result=await restoreServerTemplate(g,data);audit(g.id,u.id,'server_restore',g.id,`roles=${result.rolesMade};channels=${result.channelsMade}`);return i.editReply(`Restore completed additively: created ${result.rolesMade} roles and ${result.channelsMade} channels. Existing server content was not deleted. Review role order and permission overwrites manually.`);}catch(e){console.error('Server restore:',e);audit(g.id,u.id,'server_restore_failed',g.id,e.message);return i.editReply(`Restore stopped: ${String(e.message||'invalid backup').slice(0,700)}. Items created before the failure were not automatically deleted; review the server before retrying.`);}
 }
 if(['daily','balance','transfer','coinflip','leaderboard'].includes(n)){
  const a=acct(g.id,u.id);
  if(n==='daily'){const now=Date.now(),left=86400000-(now-a.last_daily);if(left>0)return i.reply({content:`Daily already claimed. Try again in ${Math.ceil(left/3600000)}h.`});const amt=Number(config.economy?.dailyAmount||250);const claim=db.prepare('UPDATE economy SET balance=balance+?,last_daily=? WHERE guild_id=? AND user_id=? AND last_daily<=?').run(amt,now,g.id,u.id,now-86400000);if(!claim.changes)return i.reply({content:'Daily already claimed. Try again tomorrow.'});db.prepare('INSERT INTO economy_ledger(guild_id,user_id,delta,kind,details,created_at) VALUES(?,?,?,?,?,?)').run(g.id,u.id,amt,'daily','Daily reward',now);return i.reply(`You received ${coins(amt)}. Balance: ${coins(acct(g.id,u.id).balance)}.`);}
  if(n==='balance'){const target=i.options.getUser('member')||u;return i.reply(`${target.username}'s balance: **${coins(acct(g.id,target.id).balance)}**.`);}
  if(n==='transfer'){const target=i.options.getUser('member',true),amt=i.options.getInteger('amount',true);if(target.bot||target.id===u.id)return i.reply({content:'Choose another non-bot user.'});if(a.balance<amt)return i.reply({content:'Insufficient balance.'});acct(g.id,target.id);const transfer=db.transaction(()=>{const current=acct(g.id,u.id);if(current.balance<amt)return false;db.prepare('UPDATE economy SET balance=balance-? WHERE guild_id=? AND user_id=?').run(amt,g.id,u.id);db.prepare('UPDATE economy SET balance=balance+? WHERE guild_id=? AND user_id=?').run(amt,g.id,target.id);db.prepare('INSERT INTO economy_ledger(guild_id,user_id,delta,kind,details,created_at) VALUES(?,?,?,?,?,?)').run(g.id,u.id,-amt,'transfer_out',`to:${target.id}`,Date.now());db.prepare('INSERT INTO economy_ledger(guild_id,user_id,delta,kind,details,created_at) VALUES(?,?,?,?,?,?)').run(g.id,target.id,amt,'transfer_in',`from:${u.id}`,Date.now());return true;});if(!transfer())return i.reply({content:'Insufficient balance.'});return i.reply(`Transferred ${coins(amt)} to ${target}.`);}
  if(n==='coinflip'){const bet=i.options.getInteger('bet',true),side=i.options.getString('side',true),max=Number(config.economy?.maxCoinflipBet||10000);if(bet>max||a.balance<bet)return i.reply({content:`Bet must be ≤ ${coins(max)} and within your balance.`});const result=crypto.randomInt(0,2)===0?'heads':'tails',win=result===side;const settled=db.transaction(()=>{const current=acct(g.id,u.id);if(current.balance<bet)return false;db.prepare('UPDATE economy SET balance=balance+? WHERE guild_id=? AND user_id=?').run(win?bet:-bet,g.id,u.id);db.prepare('INSERT INTO economy_ledger(guild_id,user_id,delta,kind,details,created_at) VALUES(?,?,?,?,?,?)').run(g.id,u.id,win?bet:-bet,'coinflip',`${side}; result=${result}`,Date.now());return true;});if(!settled())return i.reply({content:'Insufficient balance. Try again.'});const newBalance=acct(g.id,u.id).balance;return i.reply(`🪙 ${result}. ${win?'You won':'You lost'} ${coins(bet)}. Balance: ${coins(newBalance)}.`);}
  if(n==='leaderboard'){const rows=db.prepare('SELECT user_id,balance FROM economy WHERE guild_id=? ORDER BY balance DESC LIMIT 10').all(g.id);return i.reply(rows.length?rows.map((x,j)=>`${j+1}. <@${x.user_id}> — ${coins(x.balance)}`).join('\n'):'No economy accounts yet.');}
 }
   if(n==='help'){
   const category=i.options.getString('category')||'moderation';
   return showHelpForInteraction(i,category,0);
  }
if(n==='banner'){
  const requested=i.options.getUser('member')||u;const target=await client.users.fetch(requested.id,{force:true}).catch(()=>requested);const url=target.bannerURL({size:1024,dynamic:true});
  if(!url)return i.reply({content:`${target.tag||target.username} has no publicly available profile banner, or Discord did not return one.`});
  return i.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle(`${target.tag||target.username} • Profile banner`).setImage(url)]});
 }
 if(n==='image-collect'){
  if(!g||!m)return i.reply({content:'استخدم الأمر داخل السيرفر.',flags:64});
  if(!m.permissions?.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'تحتاج صلاحية Manage Server لاستخدام جامع الصور.',flags:64});
  const raw=i.options.getString('url',true).trim();
  const channel=i.options.getChannel('channel',true);
  if(!channel?.isTextBased()||channel.guildId!==g.id)return i.reply({content:'اختار قناة نصية من نفس السيرفر.',flags:64});
  await i.deferReply({flags:64});
  try{
   const {results,kind,query,sourceHost}=await imageLinkCollector.collectImages(raw,raw,g.id);
   const count=await imageLinkCollector.postCollectedToChannel(channel,results,{kind,query,sourceHost,guildId:g.id});
   return i.editReply(`✅ تم إرسال ${count} صورة جديدة إلى ${channel}. يتم تجاهل الصور التي سبق نشرها. ملاحظة: بعض المواقع التي تعتمد على JavaScript أو تسجيل الدخول أو تمنع الروبوتات لا يمكن استخراج صورها مباشرة.`);
  }catch(e){return i.editReply(`⚠️ تعذر جمع الصور: ${String(e.message||'خطأ غير معروف').slice(0,300)}`);}
 }
 if(n==='image-source'){
  if(!g||!m)return i.reply({content:'استخدم إدارة مصادر الصور داخل السيرفر.',flags:64});
  if(!m.permissions?.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'تحتاج صلاحية Manage Server لإدارة مصادر الصور.',flags:64});
  const sub=i.options.getSubcommand(),name=i.options.getString('name');
  if(sub==='list'){
   const rows=imageFeeds.listFeeds(g.id);
   if(!rows.length)return i.reply({content:'لا توجد مصادر صور مضافة حاليًا. استخدم /image-catalog-add لإضافة مصدر.',flags:64});
   const body=rows.map(f=>`• **${f.name}** — ${f.category} — <#${f.channel_id}> — كل ${f.interval_min} دقيقة — ${f.enabled?'🟢 يعمل':'⏸️ متوقف'}`).join('\n');
   return i.reply({content:body.slice(0,1850),flags:64});
  }
  if(sub==='pause'||sub==='resume'){
   const changed=imageFeeds.setEnabled(g.id,name,sub==='resume');
   return i.reply({content:changed?(sub==='pause'?`تم إيقاف المصدر **${name}** مؤقتًا.`:`تم استئناف المصدر **${name}**.`):`لم أجد مصدرًا باسم **${name}**.`,flags:64});
  }
  if(sub==='remove'){
   const removed=imageFeeds.removeFeed(g.id,name);
   return i.reply({content:removed?`تم حذف المصدر **${name}**. لم يتم حذف قناة Discord.`:`لم أجد مصدرًا باسم **${name}**.`,flags:64});
  }
  if(sub==='status'){
   await i.deferReply({flags:64});
   const feed=imageFeeds.feedStatus(g.id,name);
   if(!feed)return i.editReply(`لم أجد مصدرًا باسم **${name}**.`);
   const fmt=value=>value?`<t:${Math.floor(value/1000)}:R>`:'لم يحدث بعد';
   const apiState=await require('./pinterest-api').testConnection();
   const details=[`**المصدر:** ${feed.name}`,`**التصنيف:** ${feed.category}`,`**القناة:** <#${feed.channel_id}>`,`**الحالة:** ${feed.enabled?'يعمل':'متوقف'}`,`**الفحص كل:** ${feed.interval_min} دقيقة`,`**آخر فحص:** ${fmt(feed.last_check_at)}`,`**آخر نشر:** ${fmt(feed.last_post_at)}`,`**آخر نتائج:** ${feed.last_scan_count||0} مرشح / ${feed.last_match_count||0} مطابق / ${feed.last_post_count||0} منشور`,`**صور محفوظة لمنع التكرار:** ${feed.seenCount}`,`**أخطاء متتالية:** ${feed.fail_count||0}`,`**Pinterest API:** ${apiState.ok?'متصل':apiState.message}`,feed.last_error?`**آخر خطأ:** ${String(feed.last_error).slice(0,250)}`:''].filter(Boolean).join('\n');
   return i.editReply(details.slice(0,1900));
  }
  if(sub==='edit'){
   const patch={};
   const newName=i.options.getString('new_name'),category=i.options.getString('category'),url=i.options.getString('url'),interval=i.options.getInteger('interval'),channel=i.options.getChannel('channel');
   if(channel&&(!channel.isTextBased()||channel.guildId!==g.id))return i.reply({content:'اختر قناة نصية من نفس السيرفر.',flags:64});
   if(newName!==null)patch.name=newName;
   if(category!==null)patch.category=category;
   if(interval!==null)patch.intervalMin=interval;
   if(channel)patch.channelId=channel.id;
   if(url!==null){
    await i.deferReply({flags:64});
    try{await imageFeeds.probeSource(url,category||imageFeeds.getFeed(g.id,name)?.category||'any');patch.sourceUrl=url;}
    catch(error){return i.editReply(`تعذر التحقق من المصدر الجديد: ${String(error.message||'خطأ').slice(0,250)}`);}
   }
   try{
    const updated=imageFeeds.editFeed(g.id,name,patch);
    if(!updated)return i.deferred?i.editReply(`لم أجد مصدرًا باسم **${name}**.`):i.reply({content:`لم أجد مصدرًا باسم **${name}**.`,flags:64});
    return i.deferred?i.editReply(`تم تحديث **${updated.name}** بنجاح.`):i.reply({content:`تم تحديث **${updated.name}** بنجاح.`,flags:64});
   }catch(error){return i.deferred?i.editReply(`تعذر تعديل المصدر: ${String(error.message).slice(0,250)}`):i.reply({content:`تعذر تعديل المصدر: ${String(error.message).slice(0,250)}`,flags:64});}
  }
 }
 if(['image-catalog-add','image-catalog-list','image-catalog-post','image-catalog-remove'].includes(n)){
  if(!g||!m)return i.reply({content:'Use the image catalog inside a server.',flags:64});
  if(!m.permissions?.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'Manage Server permission is required to configure the image catalog.',flags:64});
  if(n==='image-catalog-list'){
   const rows=imageFeeds.listFeeds(g.id);
   if(!rows.length)return i.reply({content:'No image catalog sources configured yet. Use /image-catalog-add to add a site.',flags:64});
   const body=rows.map(f=>`• **${f.name}** — ${f.category} → <#${f.channel_id}> — every ${f.interval_min} min — ${f.enabled?'enabled':'disabled'}${f.last_error?` — last error: ${f.last_error.slice(0,100)}`:''}`).join('\n');
   return i.reply({content:body.slice(0,1900),flags:64});
  }
  const name=i.options.getString('name',true).trim();
  if(n==='image-catalog-remove'){
   const removed=imageFeeds.removeFeed(g.id,name);
   return i.reply({content:removed?`Removed catalog source **${name}**. Its Discord channel was left untouched.`:`No catalog source named **${name}** was found.`,flags:64});
  }
  if(n==='image-catalog-post'){
   const feed=imageFeeds.getFeed(g.id,name);
   if(!feed)return i.reply({content:`No catalog source named **${name}** was found. Use /image-catalog-list.`,flags:64});
   await i.deferReply({flags:64});
   try{await imageFeeds.runFeed(client,feed);return i.editReply(`Posted new images from **${name}** in <#${feed.channel_id}> (up to 30 per automatic catalog run).`);}catch(e){return i.editReply(`Could not post from **${name}**: ${String(e.message||'unknown error').slice(0,250)}`);}
  }
  const nameRaw=i.options.getString('name',true).trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,39}$/.test(nameRaw))return i.reply({content:'Source name must be 2–40 characters using letters, numbers, spaces, underscores or hyphens.',flags:64});
  const category=i.options.getString('category',true),sourceUrl=i.options.getString('url',true),interval=i.options.getInteger('interval',true);
  let channel=i.options.getChannel('channel');
  if(channel&&(!channel.isTextBased()||channel.guildId!==g.id))return i.reply({content:'Choose a text channel from this server.',flags:64});
  await i.deferReply({flags:64});
  let createdChannel=false;
  try{
   // Verify the source is a public HTTPS page and exposes at least one image before saving it.
   await imageFeeds.probeSource(sourceUrl,category);
   if(!channel){
    const channelName=({girls:'صور-بنات',boys:'صور-شباب','girls-boys':'صور-شباب-وبنات',couples:'كبلز',banner:'بانرات',gif:'gif', 'gif-girls':'gif-girls','gif-boys':'gif-boys',anime:'anime'})[category]||category;
    channel=g.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===channelName);
    if(!channel){channel=await g.channels.create({name:channelName,type:ChannelType.GuildText,reason:`Image catalog channel for ${category}`});createdChannel=true;}
   }
   const feed=imageFeeds.addFeed({guildId:g.id,name:nameRaw,category,channelId:channel.id,sourceUrl,intervalMin:interval,createdBy:u.id});
   return i.editReply(`✅ Added **${feed.name}** to the **${category}** catalog. Channel: ${channel}. Automatic posts are scheduled every ${interval} minutes.\n\nNote: category filtering uses image URL/source clues; some sites use opaque URLs or JavaScript and may not expose enough information to classify images reliably. Wikimedia Commons is not used by this feature unless you explicitly enter it as your own source.`);
  }catch(e){if(createdChannel&&channel)await channel.delete('Image catalog setup failed').catch(()=>{});return i.editReply(`Could not add this source: ${String(e.message||'unknown error').slice(0,300)}`);}
 }
 if(n==='postimage'){
  if(!m.permissions.has(PermissionFlagsBits.ManageMessages)&&!admin(m))return i.reply({content:'Manage Messages permission required to post images with this command.'});
  const raw=i.options.getString('url',true).trim(),caption=i.options.getString('caption')||'';let parsed;
  try{parsed=new URL(raw);if(parsed.protocol!=='https:')throw new Error('HTTPS required');if(!parsed.hostname||parsed.username||parsed.password)throw new Error('Invalid URL');}catch{return i.reply({content:'Enter a valid public HTTPS image URL.'});}
  const embed=new EmbedBuilder().setColor(0x3446A8).setImage(parsed.toString());if(caption)embed.setDescription(caption);
  await i.channel.send({embeds:[embed],allowedMentions:{parse:[]}});return i.reply({content:'Image embed posted. The destination site must allow Discord to fetch/display the image.'});
 }
 if(n==='roleinfo'){
  const r=i.options.getRole('role',true);const count=r.members.size;
  const perms=r.permissions.toArray();return i.reply({embeds:[new EmbedBuilder().setColor(r.color||0x3446A8).setTitle(`Role: ${r.name}`).addFields({name:'ID',value:r.id,inline:true},{name:'Position',value:String(r.position),inline:true},{name:'Cached members',value:String(count),inline:true},{name:'Mentionable',value:String(r.mentionable),inline:true},{name:'Hoisted',value:String(r.hoist),inline:true},{name:'Permissions',value:perms.length?perms.slice(0,20).join(', ').slice(0,1024):'No special permissions'})]});
 }
 if(n==='channelinfo'){
  const ch=i.options.getChannel('channel')||i.channel;const fields=[{name:'ID',value:ch.id,inline:true},{name:'Type',value:String(ch.type),inline:true},{name:'Created',value:`<t:${Math.floor(ch.createdTimestamp/1000)}:D>`,inline:true}];if('parentId' in ch)fields.push({name:'Category',value:ch.parent?.name||'None',inline:true});if('topic' in ch&&ch.topic)fields.push({name:'Topic',value:ch.topic.slice(0,1024)});if('rateLimitPerUser' in ch)fields.push({name:'Slowmode',value:`${ch.rateLimitPerUser||0}s`,inline:true});return i.reply({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle(`#${ch.name||'channel'}`).addFields(fields)]});
 }
 if(n==='role-create'){
  if(!m.permissions.has(PermissionFlagsBits.ManageRoles)&&!admin(m))return i.reply({content:'Manage Roles permission required.'});
  if(!g.members.me?.permissions.has(PermissionFlagsBits.ManageRoles))return i.reply({content:'The bot needs Manage Roles permission.'});
  const name=i.options.getString('name',true).trim(),rawColor=i.options.getString('color'),mentionable=i.options.getBoolean('mentionable')||false;let color=0x3446A8;
  if(rawColor){if(!/^#?[0-9a-fA-F]{6}$/.test(rawColor))return i.reply({content:'Color must be a 6-digit hex value such as #5865F2.'});color=parseInt(rawColor.replace('#',''),16);}
  try{const role=await g.roles.create({name,color,mentionable,reason:`bot role create by ${u.tag}`});audit(g.id,u.id,'role_create',role.id,name);return i.reply({content:`Created role ${role}. Remember to review its permissions and role position.`});}catch(e){return i.reply({content:`Could not create role: ${String(e.message||'Discord API error').slice(0,300)}`});}
 }
 if(n==='role-delete'){
  if(!m.permissions.has(PermissionFlagsBits.ManageRoles)&&!admin(m))return i.reply({content:'Manage Roles permission required.'});
  const role=i.options.getRole('role',true);if(role.id===g.id||role.managed)return i.reply({content:'Cannot delete @everyone or an integration-managed role.'});
  if(!g.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)||g.members.me.roles.highest.comparePositionTo(role)<=0)return i.reply({content:'The bot needs Manage Roles and its highest role must be above the selected role.'});
  if(m.id!==g.ownerId&&m.roles.highest.comparePositionTo(role)<=0)return i.reply({content:'Your highest role must be above the selected role.'});
  const name=role.name;try{await role.delete(`bot role delete by ${u.tag}`);audit(g.id,u.id,'role_delete',role.id,name);return i.reply({content:`Deleted role **${name}**.`});}catch(e){return i.reply({content:`Could not delete role: ${String(e.message||'Discord API error').slice(0,300)}`});}
 }
 if(n==='channel-create'){
  if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels permission required.'});
  if(!g.members.me?.permissions.has(PermissionFlagsBits.ManageChannels))return i.reply({content:'The bot needs Manage Channels permission.'});
  const name=i.options.getString('name',true).trim(),type=i.options.getString('type',true),category=i.options.getChannel('category');if(category&&category.type!==ChannelType.GuildCategory)return i.reply({content:'Choose a category channel.'});
  const safeName=name.toLowerCase().replace(/[^a-z0-9-_\u0600-\u06ff]/g,'-').replace(/-+/g,'-').slice(0,100);if(!safeName)return i.reply({content:'Enter a valid channel name.'});
  try{const ch=await g.channels.create({name:safeName,type:type==='voice'?ChannelType.GuildVoice:ChannelType.GuildText,parent:category?.id,reason:`bot channel create by ${u.tag}`});audit(g.id,u.id,'channel_create',ch.id,`${ch.name};type=${type}`);return i.reply({content:`Created ${ch}.`});}catch(e){return i.reply({content:`Could not create channel: ${String(e.message||'Discord API error').slice(0,300)}`});}
 }
 if(n==='channel-delete'){
  if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels permission required.'});
  const ch=i.options.getChannel('channel',true);if(ch.guildId!==g.id)return i.reply({content:'Choose a channel in this server.'});const name=ch.name,id=ch.id;
  try{await ch.delete(`bot channel delete by ${u.tag}`);audit(g.id,u.id,'channel_delete',id,name);return i.reply({content:`Deleted channel **#${name}**.`});}catch(e){return i.reply({content:`Could not delete channel: ${String(e.message||'Discord API error').slice(0,300)}`});}
 }
 if(['voice-disconnect','voice-mute','voice-deafen'].includes(n)){
  const targetUser=i.options.getUser('member',true),target=await g.members.fetch(targetUser.id).catch(()=>null);if(!target)return i.reply({content:'Member is not in this server.'});if(!target.voice.channel)return i.reply({content:'That member is not connected to a voice channel.'});
  const needed=n==='voice-disconnect'?PermissionFlagsBits.MoveMembers:n==='voice-mute'?PermissionFlagsBits.MuteMembers:PermissionFlagsBits.DeafenMembers;if(!m.permissions.has(needed)&&!admin(m))return i.reply({content:`You need ${n==='voice-disconnect'?'Move Members':n==='voice-mute'?'Mute Members':'Deafen Members'} permission.`});
  if(n==='voice-disconnect'){await target.voice.disconnect(`bot voice action by ${u.tag}`);audit(g.id,u.id,n,target.id);return i.reply({content:`Disconnected ${target} from voice.`});}
  const enabled=i.options.getBoolean(n==='voice-mute'?'muted':'deafened',true);if(n==='voice-mute')await target.voice.setMute(enabled,`bot voice action by ${u.tag}`);else await target.voice.setDeaf(enabled,`bot voice action by ${u.tag}`);audit(g.id,u.id,n,target.id,String(enabled));return i.reply({content:`${n==='voice-mute'?'Server mute':'Server deafen'} ${enabled?'enabled':'disabled'} for ${target}.`});
 }
 if(n==='role-add'||n==='role-remove'){
  if(!m.permissions.has(PermissionFlagsBits.ManageRoles)&&!admin(m))return i.reply({content:'Manage Roles permission required.'});
  const targetUser=i.options.getUser('member',true),role=i.options.getRole('role',true);const target=await g.members.fetch(targetUser.id).catch(()=>null);if(!target)return i.reply({content:'Member is not in this server.'});
  if(role.managed||role.id===g.id)return i.reply({content:'Managed/integrated roles and @everyone cannot be assigned manually.'});
  if(!g.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)||g.members.me.roles.highest.comparePositionTo(role)<=0)return i.reply({content:'The bot needs Manage Roles and its highest role must be above the selected role.'});
  if(target.id!==g.ownerId&&m.id!==g.ownerId&&m.roles.highest.comparePositionTo(role)<=0)return i.reply({content:'Your highest role must be above the selected role.'});
  if(target.id!==g.ownerId&&g.members.me.roles.highest.comparePositionTo(target.roles.highest)<=0)return i.reply({content:'The bot role must be above the target member highest role.'});
  try{if(n==='role-add')await target.roles.add(role,`bot role command by ${u.tag}`);else await target.roles.remove(role,`bot role command by ${u.tag}`);audit(g.id,u.id,n, target.id,role.name);return i.reply({content:`${n==='role-add'?'Added':'Removed'} ${role} ${n==='role-add'?'to':'from'} ${target}.`});}catch(e){return i.reply({content:`Could not update role: ${String(e.message||'Discord API error').slice(0,300)}`});}
 }
 if(n==='ping'){
  const started=Date.now();
  await i.deferReply();
  const botPing=Math.max(0,Date.now()-started),apiPing=Math.max(0,Math.round(client.ws.ping||0));
  const status=ping=>ping<100?'🟢 Excellent':ping<200?'🟢 Good':ping<400?'🟡 Fair':'🔴 Slow';
  const embed=new EmbedBuilder().setColor(0x6F8FAF).setAuthor({name:`${client.user.username} • Network Status`,iconURL:client.user.displayAvatarURL()})
   .setTitle('🏓 | Pong!').setDescription('**Connection established successfully.**\nAll systems are responding normally.')
   .addFields({name:'🌐 API Latency',value:`\`\`\`yaml\nstatus: ${status(apiPing)}\nlatency: ${apiPing}ms\n\`\`\``,inline:true},{name:'⚡ Bot Latency',value:`\`\`\`yaml\nstatus: ${status(botPing)}\nlatency: ${botPing}ms\n\`\`\``,inline:true})
   .setThumbnail(i.user.displayAvatarURL({size:512})).setFooter({text:`Requested by ${i.user.tag}`,iconURL:i.user.displayAvatarURL()}).setTimestamp();
  return i.editReply({embeds:[embed]});
 }
 if(n==='botinfo'){const desc=db.prepare('SELECT value FROM bot_preferences WHERE key=?').get('description')?.value;const e=new EmbedBuilder().setColor(0x3446A8).setTitle(config.brand).addFields({name:'Servers',value:String(client.guilds.cache.size),inline:true},{name:'Cached users',value:String(client.users.cache.size),inline:true},{name:'discord.js',value:require('discord.js').version,inline:true});if(desc)e.setDescription(desc.slice(0,4096));return i.reply({embeds:[e]});}
 if(n==='avatar'){const x=i.options.getUser('member')||u;return i.reply({embeds:[new EmbedBuilder().setTitle(`${x.username}'s avatar`).setImage(x.displayAvatarURL({size:1024}))]});}
 if(n==='server_icon'){const url=g.iconURL({size:1024});if(!url)return i.reply({content:'Server has no icon.'});return i.reply({embeds:[new EmbedBuilder().setTitle(g.name).setImage(url)]});}
 if(n==='cat'||n==='dog'){await i.deferReply();const d=n==='cat'?await apiJson('https://api.thecatapi.com/v1/images/search'):await apiJson('https://dog.ceo/api/breeds/image/random'),url=n==='cat'?d?.[0]?.url:d?.message;if(!url)return i.editReply('Image API unavailable. Try again later.');return i.editReply({embeds:[new EmbedBuilder().setTitle(n==='cat'?'Random cat 🐱':'Random dog 🐶').setImage(url)]});}
 if(n==='serverinfo'){const owner=await g.fetchOwner().catch(()=>null),embed=new EmbedBuilder().setColor(0x3446A8).setTitle(g.name).addFields({name:'Owner',value:owner?.user.tag||'Unknown',inline:true},{name:'Members',value:String(g.memberCount),inline:true},{name:'Created',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true},{name:'Channels',value:String(g.channels.cache.size),inline:true},{name:'Roles',value:String(g.roles.cache.size),inline:true},{name:'Boost level',value:String(g.premiumTier),inline:true},{name:'Boosts',value:String(g.premiumSubscriptionCount||0),inline:true},{name:'ID',value:g.id,inline:true});const icon=g.iconURL();if(icon)embed.setThumbnail(icon);return i.reply({embeds:[embed]});}
 if(n==='userinfo'){const requested=i.options.getUser('member')||u,x=await client.users.fetch(requested.id,{force:true}).catch(()=>requested),mem=await g.members.fetch(x.id).catch(()=>null);const banner=x.bannerURL({size:1024,dynamic:true});const badges=x.flags?.toArray?.()||[];const fields=[{name:'🪪 USER ID',value:`\`${x.id}\``,inline:true},{name:'📅 ACCOUNT CREATED',value:`<t:${Math.floor(x.createdTimestamp/1000)}:D>`,inline:true},{name:'📥 SERVER JOINED',value:mem?.joinedTimestamp?`<t:${Math.floor(mem.joinedTimestamp/1000)}:D>`:'Not in server',inline:true},{name:'🤖 ACCOUNT TYPE',value:x.bot?'Bot account':'Human account',inline:true},{name:'🚀 SERVER BOOST',value:mem?.premiumSinceTimestamp?`Boosting since <t:${Math.floor(mem.premiumSinceTimestamp/1000)}:D>`:'Not boosting / unavailable',inline:true},{name:'🏅 PUBLIC BADGES',value:badges.length?badges.map(b=>`\`${b}\``).join(' • ').slice(0,1024):'No public badges returned',inline:false},{name:`🎭 ROLES (${mem?Math.max(0,mem.roles.cache.size-1):0})`,value:mem?mem.roles.cache.filter(r=>r.id!==g.id).sort((a,b)=>b.position-a.position).map(r=>r.toString()).slice(0,12).join('  ')||'No roles':'Unavailable',inline:false}];const embed=new EmbedBuilder().setColor(0x5865F2).setAuthor({name:`MEMBER PROFILE • ${g.name}`,iconURL:g.iconURL({size:128})||undefined}).setTitle(`✦ ${x.globalName||x.username}`).setDescription(`> Detailed profile card for ${x}.\n> ${x.bot?'🤖 Discord application':'👤 Server member'}`).setThumbnail(x.displayAvatarURL({size:512,dynamic:true})).addFields(fields).setFooter({text:`IM YOUR DADDY • Profile • ${x.tag||x.username}`,iconURL:client.user.displayAvatarURL({size:64})}).setTimestamp();if(banner)embed.setImage(banner);return i.reply({embeds:[embed],allowedMentions:{parse:[]}});}
 if(n==='ticket-panel'){if(!settings(g.id).tickets?.enabled)return i.reply({content:'Tickets are disabled for this server. Enable them in config.json/dashboard first.'});if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels permission required.'});const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_open').setLabel('Open a ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));await i.channel.send({embeds:[new EmbedBuilder().setTitle('Support Center').setDescription('Press below to open a private ticket.').setColor(0x3446A8)],components:[row]});return i.reply({content:'Panel posted.'});}
 if(n==='suggest'){const c=settings(g.id),idea=i.options.getString('idea',true);if(!c.suggestions?.enabled||!validId(c.suggestions.channelId))return i.reply({content:'Suggestions are not configured for this server.'});const ch=g.channels.cache.get(c.suggestions.channelId);if(!ch?.isTextBased())return i.reply({content:'Suggestion channel not found.'});const row=db.prepare('INSERT INTO suggestions(guild_id,user_id,content,created_at) VALUES(?,?,?,?)').run(g.id,u.id,idea,Date.now());const msg=await ch.send({embeds:[new EmbedBuilder().setColor(0x3446A8).setTitle(`Suggestion #${row.lastInsertRowid}`).setDescription(idea).setFooter({text:`Submitted by ${u.tag}`})]});await msg.react('👍');await msg.react('👎');return i.reply({content:'Suggestion submitted.'});}
 if(n==='giveaway'){if(!settings(g.id).giveaways?.enabled)return i.reply({content:'Giveaways are disabled for this server.'});if(!m.permissions.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'Manage Server permission required.'});const mins=i.options.getInteger('minutes',true),prize=i.options.getString('prize',true),ends=Date.now()+mins*60000;const msg=await i.channel.send({embeds:[new EmbedBuilder().setColor(0xF1C40F).setTitle('🎉 Giveaway').setDescription(`Prize: **${prize}**\nReact with 🎉 to enter.\nEnds <t:${Math.floor(ends/1000)}:R>.`)]});await msg.react('🎉');db.prepare('INSERT INTO giveaways(guild_id,channel_id,message_id,prize,ends_at) VALUES(?,?,?,?,?)').run(g.id,i.channelId,msg.id,prize,ends);audit(g.id,u.id,'giveaway_start',msg.id,prize);return i.reply({content:'Giveaway started.'});}
 if(n==='level'){const target=i.options.getUser('member')||u,row=db.prepare('SELECT * FROM levels WHERE guild_id=? AND user_id=?').get(g.id,target.id);return i.reply(`${target.username}: level ${row?.level||0}, XP ${row?.xp||0}.`);}
 if(n==='audit-logs'){if(!m.permissions.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'Manage Server permission required.'});const limit=i.options.getInteger('limit')||10;const rows=db.prepare('SELECT actor_id,action,target_id,details,created_at FROM audit_logs WHERE guild_id=? ORDER BY id DESC LIMIT ?').all(g.id,limit);return i.reply({content:rows.length?rows.map(x=>`<t:${Math.floor(x.created_at/1000)}:R> — **${x.action}** by <@${x.actor_id}>${x.target_id?` → <@${x.target_id}>`:''}${x.details?` · ${x.details.replace(/[\r\n]/g,' ').slice(0,160)}`:''}`).join('\n').slice(0,1900):'No bot audit events recorded yet.'});}
 if(n==='log'){
  if(!m.permissions.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'Manage Server or Administrator permission required.'});
  const action=i.options.getSubcommand();
  if(action==='status'){const c=settings(g.id),lang=c.logs?.language==='ar'?'ar':'en';const categoryIds=[c.logs?.categoryId,...(Array.isArray(c.logs?.categoryIds)?c.logs.categoryIds:[])].filter((id,index,arr)=>validId(id)&&arr.indexOf(id)===index);const categories=categoryIds.map(id=>g.channels.cache.get(id)).filter(Boolean);const count=Object.keys(c.logs?.channels||{}).length;const categoryLabel=categories.length?categories.join(', '):'Not configured';return i.reply({content:lang==='ar'?`**حالة اللوج:** ${c.logs?.enabled?'مفعّل':'متوقف'}\n**التصنيفات:** ${categories.length?categoryLabel:'غير محددة'}\n**عدد التصنيفات:** ${categories.length}\n**القنوات المخصصة:** ${count}\n**اللغة:** العربية\n**ملاحظة:** رصد الاستريم يعتمد على النشاط الذي يتيحه Discord للبوت.`:`**Server logs:** ${c.logs?.enabled?'Enabled':'Disabled'}\n**Categories:** ${categoryLabel}\n**Category count:** ${categories.length}\n**Dedicated channels:** ${count}\n**Language:** English\n**Note:** Stream detection depends on activity exposed by Discord.`});}
  if(action==='cleanup'){
   if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels or Administrator permission required.'});
   const botMember=g.members.me;
   if(!botMember?.permissions.has(PermissionFlagsBits.ManageChannels))return i.reply({content:'The bot needs Manage Channels permission to delete log channels.'});
   const confirm=i.options.getBoolean('confirm',true);
   await i.deferReply({flags:64});
   try{
    await g.channels.fetch();
    const normalizeName=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[ـًٌٍَُِّْ]/g,'').replace(/[\s_・•|]+/g,'-');
    const logPattern=/(^|[^a-z])logs?([^a-z]|$)|audit|moderation|modlog|botlog|eventlog|chatlog|voicelog|serverlog|log[-_ ]?channel|سجل|سجلات|لوج|اللوج|لوغ|اللوغ|تسجيلات|سجلات-الأحداث|سجل-الأحداث/iu;
    const categories=[...g.channels.cache.values()].filter(ch=>ch.type===ChannelType.GuildCategory);
    const isLogCategory=ch=>ch?.type===ChannelType.GuildCategory&&logPattern.test(normalizeName(ch.name));
    const logCategoryIds=new Set(categories.filter(isLogCategory).map(ch=>ch.id));
    const candidates=[...g.channels.cache.values()].filter(ch=>{
     if(ch.type===ChannelType.GuildCategory)return false;
     const nameMatch=logPattern.test(normalizeName(ch.name));
     const categoryMatch=Boolean(ch.parentId&&logCategoryIds.has(ch.parentId));
     return nameMatch||categoryMatch;
    });
    const candidateIds=new Set(candidates.map(ch=>ch.id));
    const emptyLogCategories=categories.filter(ch=>isLogCategory(ch)&&!([...g.channels.cache.values()].some(child=>child.parentId===ch.id&&!candidateIds.has(child.id))));
    const total=candidates.length+emptyLogCategories.length;
    const preview=[...candidates.slice(0,25).map(ch=>`${ch.type===ChannelType.GuildVoice?'🔊':'#'} ${ch.name}`),...emptyLogCategories.map(ch=>`📁 ${ch.name}`)];
    if(!confirm){
     const message=total?`**Preview only — nothing was deleted.**\nFound ${total} log-related channels/categories, including channels under log-named categories regardless of which bot created them.\n\n${preview.join('\n')}${total>25?'\n…plus more':''}\n\nTo permanently delete these items and their message history, run \`/log cleanup confirm:true\`. This cannot be undone.`:'No log-related channels or categories matched the cleanup rules.';
     return i.editReply({content:message});
    }
    let deleted=0,failed=[];
    for(const ch of candidates){
     try{await ch.delete(`Log cleanup confirmed by ${u.tag} (${u.id}); includes channels regardless of creator`);deleted++;}
     catch(err){failed.push(`${ch.name}: ${String(err.message||'delete failed').slice(0,100)}`);}
    }
    for(const category of emptyLogCategories){
     try{await category.delete(`Log cleanup confirmed by ${u.tag} (${u.id})`);deleted++;}
     catch(err){failed.push(`${category.name}: ${String(err.message||'delete failed').slice(0,100)}`);}
    }
    updateGuildSettings(g.id,{logs:{enabled:false,channelId:null,categoryId:null,channels:{}}});
    audit(g.id,u.id,'log_cleanup',null,`deleted=${deleted}; failed=${failed.length}`);
    const failureText=failed.length?`\n\n**Could not delete (${failed.length}):**\n${failed.slice(0,10).join('\n')}`:'';
    return i.editReply({content:`🗑️ **Log cleanup finished.**\nDeleted: ${deleted} log-related channels/categories. Their messages and history were permanently deleted with the channels.\n${failed.length?`Failed: ${failed.length}. Check the bot's role position and channel permissions.`:'No deletion errors.'}${failureText}\n\nOnly channels whose names match log-related terms, plus channels inside categories named as logs, were targeted. Unrelated channels were not intentionally targeted.`});
   }catch(error){console.error('Log cleanup failed:',error.message);return i.editReply({content:`Log cleanup failed: ${String(error.message||'Unknown error').slice(0,500)}`});}
  }
  if(action==='disable'){updateGuildSettings(g.id,{logs:{enabled:false}});audit(g.id,u.id,'log_channel_disabled');return i.reply({content:'Server event logs disabled. Your catalog and previous settings are preserved.'});}
  await i.deferReply();
  try{
   const language=i.options.getString('language',true),catalog=await setupLogCatalog(g,language,u.id);audit(g.id,u.id,'log_catalog_created',catalog.category.id,`language=${catalog.language}`);
   const list=Object.entries(catalog.channels).slice(0,12).map(([key,ch])=>`• ${key}: ${ch}`).join('\n');const categoryList=(catalog.categories||[catalog.category]).map(ch=>ch.toString()).join(', ');
   const content=catalog.language==='ar'?`✅ تم إنشاء كتالوج اللوج وتقسيمه على ${catalog.categories?.length||1} تصنيفات لتجاوز حد Discord.\nالتصنيفات: ${categoryList}\nالقنوات: ${Object.keys(catalog.channels).length}\nالقنوات القديمة المحذوفة: 0 (تم الحفاظ على القنوات والرسائل الموجودة)\nأمثلة على القنوات:\n${list}\n\nتم تفعيل اللوج بعد اكتمال الإنشاء. استخدم \`/log status\` للمراجعة.`:`✅ Log catalog rebuilt across ${catalog.categories?.length||1} categories to respect Discord limits.\nCategories: ${categoryList}\nChannels configured: ${Object.keys(catalog.channels).length}\nOld managed channels removed: 0 (existing channels and messages preserved)\nSample channels:\n${list}\n\nLogging was enabled only after creation completed. Use \`/log status\` to verify.`;
   await i.editReply({content});
   await sendGuildLog(g,{title:'Server logs enabled',description:`Logging catalog configured by ${u.tag}.`,color:0x2ECC71,userId:u.id,action:'log_channel_enabled',details:`category=${catalog.category.id}; language=${catalog.language}`});return;
  }catch(error){console.error('Log catalog setup failed:',error.message);return i.editReply({content:`Could not create the logs catalog: ${error.message}`});}
 }
 if(n==='setlogchannel'){
  if(!m.permissions.has(PermissionFlagsBits.ManageGuild)&&!admin(m))return i.reply({content:'Manage Server or Administrator permission required.'});
  const ch=i.options.getChannel('channel',true);if(ch.guildId!==g.id||!ch.isTextBased())return i.reply({content:'Choose a text channel in this server.'});
  const botMember=g.members.me;if(!botMember||!ch.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]))return i.reply({content:'The bot needs View Channel, Send Messages, and Embed Links permissions in that channel.'});
  updateGuildSettings(g.id,{logs:{enabled:true,channelId:ch.id,trackPresence:true,trackProfileImages:true,trackVoice:true,trackStreams:true}});audit(g.id,u.id,'log_channel_set',ch.id);await i.reply({content:`Event logs enabled in ${ch}. Presence, profile-image, voice, mute/deafen, camera and visible streaming-activity events will be logged with timestamps.`});
  await sendGuildLog(g,{title:'Audit logging enabled',description:`Logging configured by ${u.tag}.`,color:0x2ECC71,userId:u.id,action:'log_channel_enabled',details:`channel=${ch.id}`});return;
 }
 if(n==='botnickname'){
  if(u.id!==g.ownerId)return i.reply({content:'Only the owner of this server can use /botnickname.',flags:64});
  const nickname=i.options.getString('nickname',true).trim();
  if(!nickname)return i.reply({content:'Nickname cannot be empty.',flags:64});
  if(!g.members.me.permissions.has(PermissionFlagsBits.ChangeNickname))return i.reply({content:'The bot needs Change Nickname permission in this server.',flags:64});
  try{await g.members.me.setNickname(nickname,`Requested by server owner ${u.id}`);return i.reply({content:`Bot nickname changed in **${g.name}** to **${nickname}**. This affects this server only.`,flags:64});}catch(error){return i.reply({content:`Could not change nickname: ${String(error.message||'permission error').slice(0,250)}`,flags:64});}
 }
 if(n==='setup-status'){const c=settings(g.id);return i.reply({content:[`Welcome: ${c.welcome?.enabled?'on':'off'}`,`Goodbye: ${c.goodbye?.enabled?'on':'off'}`,`Logs: ${c.logs?.enabled?'on':'off'}`,`Autorole: ${c.autorole?.enabled?'on':'off'}`,`Anti-spam: ${c.automod?.enabled?'on':'off'}`,`Starboard: ${c.starboard?.enabled?'on':'off'}`,`Suggestions: ${c.suggestions?.enabled?'on':'off'}`,`Levels: ${c.levels?.enabled?'on':'off'}`,`Anti-raid alerts: ${c.antiRaid?.enabled?'on':'off'}`].join('\n')});}
 if(['kick','ban','unban','timeout','warn','warnings','clear','lock','unlock','slowmode'].includes(n)){
  if(n==='unban'){if(!canDo(m,'unban'))return i.reply({content:'You need Ban Members or an authorized moderation role.'});const id=i.options.getString('user_id',true),reason=i.options.getString('reason')||'No reason provided';if(!validId(id))return i.reply({content:'Enter a valid Discord user ID.'});try{await g.bans.remove(id,reason);audit(g.id,u.id,'unban',id,reason);return i.reply(`Unbanned user ID ${id}.`);}catch(e){return i.reply({content:'Could not unban this ID. Check the ID, permissions, and whether the user is banned.'});}}
  if(n==='slowmode'){if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels required.'});if(!i.channel?.setRateLimitPerUser)return i.reply({content:'This channel does not support slowmode.'});const seconds=i.options.getInteger('seconds',true);await i.channel.setRateLimitPerUser(seconds,`Changed by ${u.tag}`);return i.reply(seconds?`Slowmode set to ${seconds} seconds.`:'Slowmode disabled.');}
  if(!canDo(m,n))return i.reply({content:`You do not have permission for /${n}.`});
  if(n==='clear'){if(!m.permissions.has(PermissionFlagsBits.ManageMessages)&&!admin(m))return i.reply({content:'Manage Messages required.'});const count=i.options.getInteger('amount',true),deleted=await i.channel.bulkDelete(count,true);return i.reply({content:`Deleted ${deleted.size} messages.`});}
  if(n==='lock'||n==='unlock'){if(!m.permissions.has(PermissionFlagsBits.ManageChannels)&&!admin(m))return i.reply({content:'Manage Channels required.'});await i.channel.permissionOverwrites.edit(g.roles.everyone.id,{SendMessages:n==='lock'?false:null});return i.reply(n==='lock'?'🔒 Channel locked.':'🔓 Channel unlocked.');}
  const target=i.options.getUser('member',true);
  if(n==='warnings'){const rows=db.prepare('SELECT * FROM warnings WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 10').all(g.id,target.id);return i.reply({content:rows.length?rows.map(w=>`#${w.id} — <t:${Math.floor(w.created_at/1000)}:R> by <@${w.moderator_id}>: ${w.reason}`).join('\n'):`No warnings for ${target}.`});}
  if(target.id===u.id||target.id===client.user.id)return i.reply({content:'Cannot target yourself or the bot.'});
  const tm=await g.members.fetch(target.id).catch(()=>null);if(!tm)return i.reply({content:'Member not found.'});if(tm.id===g.ownerId)return i.reply({content:'Cannot moderate server owner.'});if(i.user.id!==g.ownerId&&m.roles.highest.comparePositionTo(tm.roles.highest)<=0)return i.reply({content:'Your highest role must be above the target member.'});if(client.user.id!==g.ownerId&&g.members.me.roles.highest.comparePositionTo(tm.roles.highest)<=0)return i.reply({content:'The bot highest role must be above the target member.'});
  const reason=i.options.getString('reason')||'No reason provided';
  if(n==='warn'){db.prepare('INSERT INTO warnings(guild_id,user_id,moderator_id,reason,created_at) VALUES(?,?,?,?,?)').run(g.id,target.id,u.id,reason,Date.now());audit(g.id,u.id,'warn',target.id,reason);return i.reply(`⚠️ Warned ${target}. Reason: ${reason}`);}
  if(n==='kick'){if(!tm.kickable)return i.reply({content:'Bot role/permissions prevent this kick.'});await tm.kick(reason);audit(g.id,u.id,'kick',target.id,reason);return i.reply(`Kicked ${target.tag}. Reason: ${reason}`);}
  if(n==='ban'){if(!tm.bannable)return i.reply({content:'Bot role/permissions prevent this ban.'});await tm.ban({reason});audit(g.id,u.id,'ban',target.id,reason);return i.reply(`Banned ${target.tag}. Reason: ${reason}`);}
  if(n==='timeout'){if(!tm.moderatable)return i.reply({content:'Bot role/permissions prevent this timeout.'});const mins=i.options.getInteger('minutes',true);await tm.timeout(mins*60000,reason);audit(g.id,u.id,'timeout',target.id,`${mins}m: ${reason}`);return i.reply(`Timed out ${target.tag} for ${mins} minute(s).`);}
 }
 }catch(e){if(e?.code===10062||e?.rawError?.code===10062){console.warn(`Interaction ${i.id} expired before the bot could acknowledge it (type=${i.type}, command=${i.commandName||i.customId||'unknown'}).`);return;}console.error('Interaction error:',e);const msg='Command failed. Check console, configuration, and bot permissions.';if(i.deferred||i.replied)await i.followUp({content:msg}).catch(()=>{});else if(i.isRepliable())await i.reply({content:msg}).catch(()=>{});}
 finally { if (interactionAckTimer) clearTimeout(interactionAckTimer); }
});
client.once('ready',()=>{ imageFeeds.start(client); console.log('[Startup] Image catalog scheduler started.'); });
client.login(token).catch(error=>{console.error('Discord login failed. Check DISCORD_TOKEN and network access:',error?.message||error);try{db.close();}catch{}process.exitCode=1;process.exit(1);});
