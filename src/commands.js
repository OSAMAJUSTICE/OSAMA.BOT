const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const BADGE_ROLE_CHOICES = [
 { name: 'HypeSquad Bravery', value: 'HypeSquadOnlineHouse1' },
 { name: 'HypeSquad Brilliance', value: 'HypeSquadOnlineHouse2' },
 { name: 'HypeSquad Balance', value: 'HypeSquadOnlineHouse3' },
 { name: 'Early Supporter', value: 'PremiumEarlySupporter' },
 { name: 'Verified Developer', value: 'VerifiedDeveloper' },
 { name: 'Bug Hunter', value: 'BugHunterLevel1' },
 { name: 'Bug Hunter Level 2', value: 'BugHunterLevel2' },
 { name: 'Discord Partner', value: 'Partner' },
 { name: 'HypeSquad Events', value: 'Hypesquad' },
 { name: 'Certified Moderator', value: 'CertifiedModerator' },
 { name: 'Active Developer', value: 'ActiveDeveloper' },
 { name: 'Server Booster', value: 'Boost' }
];
const commands = [
 new SlashCommandBuilder().setName('language').setDescription('Choose your personal language for DMs or servers without a default').addStringOption(o=>o.setName('language').setDescription('Personal language for DMs or servers without a default').setRequired(true).setAutocomplete(true)),
 new SlashCommandBuilder().setName('serverlanguage').setDescription('Set the default language for this server').addStringOption(o=>o.setName('language').setDescription('Server default language').setRequired(true).setAutocomplete(true)),
 new SlashCommandBuilder().setName('serverlanguagereset').setDescription('Clear this server language and return to automatic language selection'),
 new SlashCommandBuilder().setName('translate').setDescription('Translate text into a selected language').addStringOption(o=>o.setName('text').setDescription('Text to translate').setMaxLength(4500).setRequired(true)).addStringOption(o=>o.setName('target').setDescription('Target language; defaults to your language').setAutocomplete(true)).addStringOption(o=>o.setName('source').setDescription('Original language (auto-detected when omitted)').setAutocomplete(true)),
 new SlashCommandBuilder().setName('control').setDescription('Open the interactive in-Discord system control panel'),
 new SlashCommandBuilder().setName('publish-panel').setDescription('Publish and pin a dedicated system control panel in a chosen channel').addStringOption(o=>o.setName('system').setDescription('Which dedicated panel to publish').setRequired(true).addChoices({name:'Welcome',value:'welcome'},{name:'Goodbye',value:'goodbye'},{name:'Event logs',value:'logs'},{name:'Automatic role',value:'autorole'},{name:'Verification',value:'verification'},{name:'Temporary voice rooms',value:'tempVoice'},{name:'Tickets',value:'tickets'},{name:'Suggestions',value:'suggestions'},{name:'Anti-raid',value:'antiRaid'},{name:'Backups',value:'backups'},{name:'Sticker & Emoji Tools',value:'stickers'},{name:'Server Clone',value:'serverClone'})).addChannelOption(o=>o.setName('channel').setDescription('Text channel where this panel will stay pinned').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)),
 new SlashCommandBuilder().setName('panel-style').setDescription('Choose the visual layout of one dedicated panel (Administrator only)').addStringOption(o=>o.setName('system').setDescription('Panel to customize').setRequired(true).addChoices({name:'Welcome',value:'welcome'},{name:'Goodbye',value:'goodbye'},{name:'Event logs',value:'logs'},{name:'Automatic role',value:'autorole'},{name:'Verification',value:'verification'},{name:'Temporary voice rooms',value:'tempVoice'},{name:'Tickets',value:'tickets'},{name:'Suggestions',value:'suggestions'},{name:'Anti-raid',value:'antiRaid'},{name:'Backups',value:'backups'},{name:'Sticker & Emoji Tools',value:'stickers'},{name:'Server Clone',value:'serverClone'})).addStringOption(o=>o.setName('style').setDescription('Visual layout').setRequired(true).addChoices({name:'Premium card',value:'premium'},{name:'Minimal clean',value:'minimal'},{name:'Neon modern',value:'neon'},{name:'Classic framed',value:'classic'},{name:'Compact status',value:'compact'},{name:'Elegant gradient-like',value:'elegant'})),
 new SlashCommandBuilder().setName('panel-image').setDescription('Choose the artwork used by a public system panel (Administrator only)').addStringOption(o=>o.setName('system').setDescription('Panel to customize').setRequired(true).addChoices({name:'Welcome',value:'welcome'},{name:'Goodbye',value:'goodbye'},{name:'Event logs',value:'logs'},{name:'Automatic role',value:'autorole'},{name:'Verification',value:'verification'},{name:'Temporary voice rooms',value:'tempVoice'},{name:'Tickets',value:'tickets'},{name:'Suggestions',value:'suggestions'},{name:'Anti-raid',value:'antiRaid'},{name:'Backups',value:'backups'},{name:'Sticker & Emoji Tools',value:'stickers'},{name:'Server Clone',value:'serverClone'})).addStringOption(o=>o.setName('source').setDescription('Image source').setRequired(true).addChoices({name:'Built-in panel artwork',value:'default'},{name:'Server icon',value:'server'},{name:'Custom HTTPS image URL',value:'custom'})).addStringOption(o=>o.setName('image_url').setDescription('Direct HTTPS image URL (required for custom source)').setMaxLength(1000)),
 new SlashCommandBuilder().setName('help').setDescription('Open the organized command guide').addStringOption(o=>o.setName('category').setDescription('Choose a command category').addChoices({name:'الإدارة',value:'moderation'},{name:'إدارة الرولات',value:'roles'},{name:'السيرفر واللوحات',value:'server'},{name:'الحماية والسجلات',value:'protection'},{name:'الأوتومود',value:'automod'},{name:'المستخدم والصوت',value:'voice'},{name:'المستويات والخبرة',value:'levels'},{name:'المجتمع والاقتصاد',value:'community'},{name:'الصور والوسائط',value:'media'},{name:'المعلومات',value:'information'},{name:'الإسلاميات والقرآن',value:'islamic'},{name:'البوت والإعدادات',value:'utility'},{name:'كل الأوامر',value:'all'})),
 new SlashCommandBuilder().setName('banner').setDescription('Show a user profile banner').addUserOption(o=>o.setName('member').setDescription('Member or user')),
 new SlashCommandBuilder().setName('postimage').setDescription('Post an image from a public HTTPS URL').addStringOption(o=>o.setName('url').setDescription('HTTPS image URL').setMaxLength(1000).setRequired(true)).addStringOption(o=>o.setName('caption').setDescription('Optional caption').setMaxLength(1500)),
 new SlashCommandBuilder().setName('image-catalog-add').setDescription('Add an automatic image source to a category channel').addStringOption(o=>o.setName('name').setDescription('Unique name for this source').setMaxLength(40).setRequired(true)).addStringOption(o=>o.setName('category').setDescription('Images this source should provide').setRequired(true).addChoices({name:'Girls',value:'girls'},{name:'Boys',value:'boys'},{name:'Girls and boys',value:'girls-boys'},{name:'Couples',value:'couples'},{name:'Banners',value:'banner'},{name:'GIF',value:'gif'},{name:'GIF girls',value:'gif-girls'},{name:'GIF boys',value:'gif-boys'},{name:'Anime',value:'anime'})).addStringOption(o=>o.setName('url').setDescription('Public HTTPS image/search/gallery page (any site except Wikimedia is allowed)').setMaxLength(1000).setRequired(true)).addIntegerOption(o=>o.setName('interval').setDescription('Minutes between posts (5–10080)').setMinValue(5).setMaxValue(10080).setRequired(true)).addChannelOption(o=>o.setName('channel').setDescription('Existing text channel; leave empty to create a category channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)),
 new SlashCommandBuilder().setName('image-source').setDescription('Manage automatic image sources')
  .addSubcommand(s=>s.setName('list').setDescription('List all image sources'))
  .addSubcommand(s=>s.setName('status').setDescription('Show detailed source status').addStringOption(o=>o.setName('name').setDescription('Source name').setMaxLength(40).setRequired(true)))
  .addSubcommand(s=>s.setName('pause').setDescription('Pause an image source').addStringOption(o=>o.setName('name').setDescription('Source name').setMaxLength(40).setRequired(true)))
  .addSubcommand(s=>s.setName('resume').setDescription('Resume an image source').addStringOption(o=>o.setName('name').setDescription('Source name').setMaxLength(40).setRequired(true)))
  .addSubcommand(s=>s.setName('remove').setDescription('Remove a source without deleting its channel').addStringOption(o=>o.setName('name').setDescription('Source name').setMaxLength(40).setRequired(true)))
  .addSubcommand(s=>s.setName('edit').setDescription('Edit an existing source')
   .addStringOption(o=>o.setName('name').setDescription('Current source name').setMaxLength(40).setRequired(true))
   .addStringOption(o=>o.setName('new_name').setDescription('New source name').setMaxLength(40))
   .addStringOption(o=>o.setName('category').setDescription('New category').addChoices({name:'Girls',value:'girls'},{name:'Boys',value:'boys'},{name:'Girls and boys',value:'girls-boys'},{name:'Couples',value:'couples'},{name:'Banners',value:'banner'},{name:'GIF',value:'gif'},{name:'GIF girls',value:'gif-girls'},{name:'GIF boys',value:'gif-boys'},{name:'Anime',value:'anime'}))
   .addStringOption(o=>o.setName('url').setDescription('New public HTTPS source URL').setMaxLength(1000))
   .addIntegerOption(o=>o.setName('interval').setDescription('Minutes between scans (5–10080)').setMinValue(5).setMaxValue(10080))
   .addChannelOption(o=>o.setName('channel').setDescription('New destination channel').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))),
 new SlashCommandBuilder().setName('image-collect').setDescription('Collect up to 80 new images from any public HTTPS page into a chosen channel').addStringOption(o=>o.setName('url').setDescription('Public HTTPS page, gallery, search results, or direct image URL').setMaxLength(1000).setRequired(true)).addChannelOption(o=>o.setName('channel').setDescription('Channel where collected images should be posted').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(true)),
 new SlashCommandBuilder().setName('image-catalog-list').setDescription('List image catalog sources configured for this server'),
 new SlashCommandBuilder().setName('image-catalog-post').setDescription('Fetch and post new images from a catalog source (up to 30 per run)').addStringOption(o=>o.setName('name').setDescription('Exact source name').setMaxLength(40).setRequired(true)),
 new SlashCommandBuilder().setName('image-catalog-remove').setDescription('Remove a catalog source (does not delete its channel)').addStringOption(o=>o.setName('name').setDescription('Exact source name').setMaxLength(40).setRequired(true)),
 new SlashCommandBuilder().setName('badge-role-set').setDescription('Configure the role for a public Discord badge or server boosting').addStringOption(o=>o.setName('badge').setDescription('Public badge or Server Booster').setRequired(true).addChoices(...BADGE_ROLE_CHOICES)).addRoleOption(o=>o.setName('role').setDescription('Role to assign or remove automatically').setRequired(true)),
 new SlashCommandBuilder().setName('badge-role-clear').setDescription('Remove a badge-to-role mapping for this server').addStringOption(o=>o.setName('badge').setDescription('Badge mapping to clear').setRequired(true).addChoices(...BADGE_ROLE_CHOICES)),
 new SlashCommandBuilder().setName('sync-badges').setDescription('Synchronize public badge and server booster roles for all members'),
 new SlashCommandBuilder().setName('roleinfo').setDescription('Show details about a server role').addRoleOption(o=>o.setName('role').setDescription('Role to inspect').setRequired(true)),
 new SlashCommandBuilder().setName('channelinfo').setDescription('Show details about a server channel').addChannelOption(o=>o.setName('channel').setDescription('Channel to inspect')),
 new SlashCommandBuilder().setName('role-add').setDescription('Give a role to a member').addUserOption(o=>o.setName('member').setDescription('Target member').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role to add').setRequired(true)),
 new SlashCommandBuilder().setName('role-remove').setDescription('Remove a role from a member').addUserOption(o=>o.setName('member').setDescription('Target member').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role to remove').setRequired(true)),
 new SlashCommandBuilder().setName('role-create').setDescription('Create a server role').addStringOption(o=>o.setName('name').setDescription('Role name').setMaxLength(100).setRequired(true)).addStringOption(o=>o.setName('color').setDescription('Hex color, e.g. #5865F2').setMaxLength(7)).addBooleanOption(o=>o.setName('mentionable').setDescription('Allow members to mention this role')),
 new SlashCommandBuilder().setName('role-delete').setDescription('Delete a server role').addRoleOption(o=>o.setName('role').setDescription('Role to delete').setRequired(true)),
 new SlashCommandBuilder().setName('channel-create').setDescription('Create a text or voice channel').addStringOption(o=>o.setName('name').setDescription('Channel name').setMaxLength(100).setRequired(true)).addStringOption(o=>o.setName('type').setDescription('Channel type').setRequired(true).addChoices({name:'Text',value:'text'},{name:'Voice',value:'voice'})).addChannelOption(o=>o.setName('category').setDescription('Optional category').addChannelTypes(4)),
 new SlashCommandBuilder().setName('channel-delete').setDescription('Delete a server channel').addChannelOption(o=>o.setName('channel').setDescription('Channel to delete').setRequired(true)),
 new SlashCommandBuilder().setName('delete-all-channels').setDescription('Permanently delete all channels and categories (server owner or bot owner)').addStringOption(o=>o.setName('confirm').setDescription('Type DELETE ALL CHANNELS exactly to confirm').setMaxLength(32).setRequired(true)),
 new SlashCommandBuilder().setName('delete-whitelist-add').setDescription('Bot owner only: allow a user to run bulk channel deletion').addUserOption(o=>o.setName('user').setDescription('User to add to the deletion whitelist').setRequired(true)),
 new SlashCommandBuilder().setName('delete-whitelist-remove').setDescription('Bot owner only: remove a user from the deletion whitelist').addUserOption(o=>o.setName('user').setDescription('User to remove').setRequired(true)),
 new SlashCommandBuilder().setName('delete-whitelist-list').setDescription('Bot owner only: show users allowed to run bulk channel deletion'),
 new SlashCommandBuilder().setName('voice-disconnect').setDescription('Disconnect a member from voice').addUserOption(o=>o.setName('member').setDescription('Member to disconnect').setRequired(true)),
 new SlashCommandBuilder().setName('voice-mute').setDescription('Server-mute a member in voice').addUserOption(o=>o.setName('member').setDescription('Member to mute').setRequired(true)).addBooleanOption(o=>o.setName('muted').setDescription('True to mute, false to unmute').setRequired(true)),
 new SlashCommandBuilder().setName('voice-deafen').setDescription('Server-deafen a member in voice').addUserOption(o=>o.setName('member').setDescription('Member to deafen').setRequired(true)).addBooleanOption(o=>o.setName('deafened').setDescription('True to deafen, false to undeafen').setRequired(true)),
 new SlashCommandBuilder().setName('daily').setDescription('Claim daily coins'),
 new SlashCommandBuilder().setName('balance').setDescription('Check a balance').addUserOption(o=>o.setName('member').setDescription('Member')),
 new SlashCommandBuilder().setName('transfer').setDescription('Transfer coins').addUserOption(o=>o.setName('member').setDescription('Recipient').setRequired(true)).addIntegerOption(o=>o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true)),
 new SlashCommandBuilder().setName('coinflip').setDescription('Bet coins on heads or tails').addIntegerOption(o=>o.setName('bet').setDescription('Bet').setMinValue(1).setRequired(true)).addStringOption(o=>o.setName('side').setDescription('Side').setRequired(true).addChoices({name:'Heads',value:'heads'},{name:'Tails',value:'tails'})),
 new SlashCommandBuilder().setName('leaderboard').setDescription('Show economy leaderboard'),
 new SlashCommandBuilder().setName('avatar').setDescription('Show avatar').addUserOption(o=>o.setName('member').setDescription('Member')),
 new SlashCommandBuilder().setName('server_icon').setDescription('Show server icon'),
 new SlashCommandBuilder().setName('serverinfo').setDescription('Show server information'),
 new SlashCommandBuilder().setName('userinfo').setDescription('Show member information').addUserOption(o=>o.setName('member').setDescription('Member')),
 new SlashCommandBuilder().setName('ping').setDescription('Show bot latency'),
 new SlashCommandBuilder().setName('botinfo').setDescription('Show bot information'),
 new SlashCommandBuilder().setName('cat').setDescription('Random cat picture'),
 new SlashCommandBuilder().setName('dog').setDescription('Random dog picture'),
 new SlashCommandBuilder().setName('ticket-panel').setDescription('Post ticket panel'),
 new SlashCommandBuilder().setName('unban').setDescription('Unban a user by Discord ID').addStringOption(o=>o.setName('user_id').setDescription('Banned user ID').setMinLength(17).setMaxLength(20).setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode in the current channel').addIntegerOption(o=>o.setName('seconds').setDescription('Seconds, 0 disables slowmode').setMinValue(0).setMaxValue(21600).setRequired(true)),
 new SlashCommandBuilder().setName('kick').setDescription('Kick member').addUserOption(o=>o.setName('member').setDescription('Target').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 new SlashCommandBuilder().setName('ban').setDescription('Ban member').addUserOption(o=>o.setName('member').setDescription('Target').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 new SlashCommandBuilder().setName('timeout').setDescription('Timeout member').addUserOption(o=>o.setName('member').setDescription('Target').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Minutes').setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 new SlashCommandBuilder().setName('warn').setDescription('Warn member').addUserOption(o=>o.setName('member').setDescription('Target').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(true)),
 new SlashCommandBuilder().setName('warnings').setDescription('Show warnings').addUserOption(o=>o.setName('member').setDescription('Target').setRequired(true)),
 new SlashCommandBuilder().setName('clear').setDescription('Delete 1–100 messages').addIntegerOption(o=>o.setName('amount').setDescription('Count').setMinValue(1).setMaxValue(100).setRequired(true)),
 new SlashCommandBuilder().setName('lock').setDescription('Lock current text channel'),
 new SlashCommandBuilder().setName('unlock').setDescription('Unlock current text channel'),
 new SlashCommandBuilder().setName('suggest').setDescription('Submit a suggestion').addStringOption(o=>o.setName('idea').setDescription('Your suggestion').setMaxLength(1000).setRequired(true)),
 new SlashCommandBuilder().setName('giveaway').setDescription('Start a giveaway').addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setMinValue(1).setMaxValue(10080).setRequired(true)).addStringOption(o=>o.setName('prize').setDescription('Prize').setMaxLength(200).setRequired(true)),
 new SlashCommandBuilder().setName('level').setDescription('Check your level').addUserOption(o=>o.setName('member').setDescription('Member')),

 new SlashCommandBuilder().setName('server-backup').setDescription('Export server roles, channels, and permission overwrites as a JSON template'),
 new SlashCommandBuilder().setName('server-restore').setDescription('Restore a server structure from a JSON template without deleting existing items').addAttachmentOption(o=>o.setName('file').setDescription('JSON backup generated by /server-backup').setRequired(true)),
 new SlashCommandBuilder().setName('server-clone').setDescription('Clone supported structure and settings from one server ID to another').addStringOption(o=>o.setName('source_id').setDescription('Source server ID (bot and you must have admin access)').setMinLength(17).setMaxLength(20).setRequired(true)).addStringOption(o=>o.setName('target_id').setDescription('Target server ID (bot and you must have admin access)').setMinLength(17).setMaxLength(20).setRequired(true)).addBooleanOption(o=>o.setName('confirm').setDescription('Confirm additive clone; existing target items will not be deleted').setRequired(true)),
 new SlashCommandBuilder().setName('log').setDescription('Configure complete server event logs').addSubcommand(s=>s.setName('setup').setDescription('Create a complete logs category and dedicated channels').addStringOption(o=>o.setName('language').setDescription('Language for log categories and messages').addChoices({name:'English',value:'en'},{name:'العربية',value:'ar'}).setRequired(true))).addSubcommand(s=>s.setName('status').setDescription('Show the current log configuration')).addSubcommand(s=>s.setName('disable').setDescription('Disable server event logs')).addSubcommand(s=>s.setName('cleanup').setDescription('Preview or permanently delete log channels, including those made by other bots').addBooleanOption(o=>o.setName('confirm').setDescription('False = preview only; True = permanently delete matching log channels and categories').setRequired(true))),
 new SlashCommandBuilder().setName('setlogchannel').setDescription('Set the channel for timestamped member, profile and voice logs').addChannelOption(o=>o.setName('channel').setDescription('Text channel for event logs').addChannelTypes(0,5).setRequired(true)),
 new SlashCommandBuilder().setName('audit-logs').setDescription('Show recent bot audit events').addIntegerOption(o=>o.setName('limit').setDescription('Number of events (1–15)').setMinValue(1).setMaxValue(15)),
 new SlashCommandBuilder().setName('setup-status').setDescription('Show configured feature status'),
 new SlashCommandBuilder().setName('botstatus').setDescription('Set the bot activity status (bot owner only)').addStringOption(o=>o.setName('type').setDescription('Activity type').setRequired(true).addChoices({name:'Playing',value:'playing'},{name:'Watching',value:'watching'},{name:'Listening',value:'listening'},{name:'Competing',value:'competing'},{name:'Clear status',value:'clear'})).addStringOption(o=>o.setName('text').setDescription('Status text (not needed to clear)').setMaxLength(128)),
 new SlashCommandBuilder().setName('botdescription').setDescription('Save the bot description shown by /botinfo (bot owner only)').addStringOption(o=>o.setName('text').setDescription('Description for the bot info card').setMaxLength(1000).setRequired(true)),
 new SlashCommandBuilder().setName('botnickname').setDescription('Change this server nickname for the bot (server owner only)').addStringOption(o=>o.setName('nickname').setDescription('New nickname; empty text is not accepted').setMaxLength(32).setRequired(true)),
 new SlashCommandBuilder().setName('profilewidget').setDescription('Show the official availability status of custom Discord profile widgets')
];

// Compatibility aliases for Discord clients that fail to surface the original
// image command names despite successful guild-command read-back. Keep the
// original commands intact; aliases route to the same handlers and data.
const cloneCommand = (sourceName, aliasName) => {
 const source = commands.find(command => command.name === sourceName);
 if (!source) throw new Error(`Cannot create slash alias ${aliasName}: source command ${sourceName} is missing.`);
 // discord.js v14's SlashCommandBuilder does not expose a static .from() method
 // in every supported release. These aliases are only serialized for REST sync,
 // so clone the JSON payload instead of reconstructing a builder instance.
 const payload = source.toJSON();
 payload.name = aliasName;
 return Object.freeze({
  name: aliasName,
  toJSON() { return { ...payload }; }
 });
};

module.exports = [
 ...commands,
 cloneCommand('image-source', 'image-sources'),
 cloneCommand('image-collect', 'collect-images')
];
