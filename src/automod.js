'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const TARGET_RULES = 100;
const MAX_RULES_PER_GUILD_TARGET = 10;
const RULE_NAMES = {
  'flagged-words': 'IMYD AutoMod - Commonly Flagged Words',
  keyword: 'IMYD AutoMod - General Keywords',
  'mention-spam': 'IMYD AutoMod - Mention Spam',
  'spam-messages': 'IMYD AutoMod - Spam Content',
  'keywords-links': 'IMYD AutoMod - Suspicious Links',
  'keywords-insults': 'IMYD AutoMod - Insults',
  'keywords-advertising': 'IMYD AutoMod - Advertising Spam',
  'keywords-scams': 'IMYD AutoMod - Scam Phrases',
  'keywords-raid': 'IMYD AutoMod - Raid Phrases',
  'member-profile': 'IMYD AutoMod - Profile Keywords'
};

const command = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Create and track native Discord AutoMod protection rules')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s => s.setName('setup-batch').setDescription('Create up to 10 real AutoMod rules in this server'))
  .addSubcommand(s => s.setName('progress').setDescription('Show total AutoMod rules and how many remain to 100'))
  .addSubcommand(s => s.setName('flagged-words').setDescription('Enable Discord preset filters for flagged words'))
  .addSubcommand(s => s.setName('keyword').setDescription('Add a custom keyword to the general keyword rule')
    .addStringOption(o => o.setName('word').setDescription('Keyword or phrase to block').setMinLength(1).setMaxLength(60).setRequired(true)))
  .addSubcommand(s => s.setName('mention-spam').setDescription('Block messages with excessive user or role mentions')
    .addIntegerOption(o => o.setName('limit').setDescription('Maximum mentions allowed per message (2–50)').setMinValue(2).setMaxValue(50)))
  .addSubcommand(s => s.setName('spam-messages').setDescription('Block messages Discord identifies as spam'))
  .addSubcommand(s => s.setName('list-bot-rules').setDescription('List AutoMod rules created by this bot'))
  .addSubcommand(s => s.setName('remove-rule').setDescription('Delete one AutoMod rule created by this bot')
    .addStringOption(o => o.setName('rule').setDescription('Bot-created rule to delete').setRequired(true).addChoices(
      { name: 'General Keywords', value: 'keyword' },
      { name: 'Flagged Words', value: 'flagged-words' },
      { name: 'Mention Spam', value: 'mention-spam' },
      { name: 'Spam Content', value: 'spam-messages' },
      { name: 'Suspicious Links', value: 'keywords-links' },
      { name: 'Insults', value: 'keywords-insults' },
      { name: 'Advertising Spam', value: 'keywords-advertising' },
      { name: 'Scam Phrases', value: 'keywords-scams' },
      { name: 'Raid Phrases', value: 'keywords-raid' },
      { name: 'Profile Keywords', value: 'member-profile' }
    )))
  .addSubcommand(s => s.setName('remove-bot-rules').setDescription('Delete all AutoMod rules created by this bot in this server')
    .addStringOption(o => o.setName('confirm').setDescription('Type DELETE to confirm removing all bot-created rules').setRequired(true).setMinLength(6).setMaxLength(6)));

const KEYWORD_TEMPLATES = [
  { name: RULE_NAMES.keyword, words: ['free nitro', 'claim your reward', 'you have won', 'giveaway winner'] },
  { name: RULE_NAMES['keywords-links'], words: ['discord.gift/', 'steamcommunnity.com', 'free-nitro', 'verify your account'] },
  { name: RULE_NAMES['keywords-insults'], words: ['go kill yourself', 'kys'] },
  { name: RULE_NAMES['keywords-advertising'], words: ['dm me for promo', 'buy followers', 'cheap followers', 'join my server'] },
  { name: RULE_NAMES['keywords-scams'], words: ['send me your password', 'wallet recovery phrase', 'double your crypto'] },
  { name: RULE_NAMES['keywords-raid'], words: ['raid this server', 'spam this channel', 'mass ping everyone'] }
];

const BATCH_TEMPLATES = [
  ...KEYWORD_TEMPLATES.map((item, i) => ({ name: item.name, triggerType: 1, triggerMetadata: { keywordFilter: item.words }, category: `keyword-${i + 1}` })),
  { name: RULE_NAMES['flagged-words'], triggerType: 4, triggerMetadata: { presets: [1, 2, 3] }, category: 'presets' },
  { name: RULE_NAMES['spam-messages'], triggerType: 3, triggerMetadata: {}, category: 'spam' },
  { name: RULE_NAMES['mention-spam'], triggerType: 5, triggerMetadata: { mentionTotalLimit: 5, mentionRaidProtectionEnabled: false }, category: 'mentions' },
  { name: RULE_NAMES['member-profile'], triggerType: 6, triggerMetadata: { keywordFilter: ['free nitro', 'crypto giveaway', 'dm for promo'] }, category: 'profile' }
];

function hasManageGuild(memberPermissions) {
  return memberPermissions?.has(PermissionFlagsBits.ManageGuild) || memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function fetchGuildRules(guild) {
  return await guild.autoModerationRules.fetch();
}

function createPayload(template, interaction) {
  return {
    name: template.name,
    eventType: 1,
    triggerType: template.triggerType,
    triggerMetadata: template.triggerMetadata,
    actions: [{ type: 1 }],
    enabled: true,
    reason: `Created by ${interaction.user.tag || interaction.user.id} with /automod setup-batch`
  };
}

async function handle(interaction) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'automod') return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'Use this command inside a server.', flags: 64 });
    return true;
  }
  if (!hasManageGuild(interaction.memberPermissions)) {
    await interaction.reply({ content: 'You need Manage Server or Administrator permission to configure AutoMod.', flags: 64 });
    return true;
  }
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'The bot needs the **Manage Server** permission to create native Discord AutoMod rules.', flags: 64 });
    return true;
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: 64 });

  if (sub === 'progress') {
    let total = 0;
    const serverLines = [];
    let inaccessible = 0;
    for (const guild of interaction.client.guilds.cache.values()) {
      try {
        const rules = await fetchGuildRules(guild);
        const count = [...rules.values()].filter(rule => rule.creatorId === interaction.client.user.id).length;
        total += count;
        serverLines.push({ name: guild.name, count, allRules: rules.size });
      } catch (error) {
        inaccessible++;
        console.warn(`[AutoMod] Progress could not read rules in ${guild.id}: ${error.message}`);
      }
    }
    const remaining = Math.max(0, TARGET_RULES - total);
    serverLines.sort((a, b) => b.count - a.count);
    const details = serverLines.slice(0, 15).map(g => `• **${g.name}** — ${g.count} bot rule(s) (${g.allRules} total in server)`).join('\n') || 'No accessible servers.';
    await interaction.editReply(
      `## AutoMod badge progress\n` +
      `**Bot-created rules found:** ${total}/${TARGET_RULES}\n` +
      `**Remaining:** ${remaining}\n` +
      `**Servers checked:** ${serverLines.length}; inaccessible: ${inaccessible}\n\n` +
      `### Rules per server\n${details}` +
      (serverLines.length > 15 ? `\n…and ${serverLines.length - 15} more server(s).` : '') +
      `\n\n*This is the count of rules currently readable by the bot. Discord controls when the badge appears.*`
    );
    return true;
  }

  let existing;
  try {
    existing = await fetchGuildRules(interaction.guild);
  } catch (error) {
    console.error(`[AutoMod] Could not read rules in guild ${interaction.guild.id}:`, error);
    await interaction.editReply(`❌ Could not read this server's AutoMod rules. Check Manage Server permission. ${String(error?.message || '').slice(0, 250)}`);
    return true;
  }

  // Only manage rules that Discord identifies as created by this bot. Never touch other admins' rules.
  const botRules = [...existing.values()].filter(rule => rule.creatorId === interaction.client.user.id);
  if (sub === 'list-bot-rules') {
    const lines = botRules.map(rule => `• **${rule.name}** — ${rule.enabled ? 'enabled' : 'disabled'} (ID: \`${rule.id}\`)`);
    await interaction.editReply(lines.length
      ? `## AutoMod rules created by this bot (${lines.length})\n${lines.join('\n')}\n\nUse **/automod remove-rule** to delete one, or **/automod remove-bot-rules** to delete all of this bot's rules in this server.`
      : 'No AutoMod rules created by this bot were found in this server.');
    return true;
  }

  if (sub === 'remove-rule') {
    const key = interaction.options.getString('rule', true);
    const targetName = RULE_NAMES[key];
    const rule = botRules.find(item => item.name === targetName);
    if (!rule) {
      await interaction.editReply(`No bot-created rule named **${targetName || key}** was found. Run **/automod list-bot-rules** to see rules this bot can manage.`);
      return true;
    }
    try {
      await rule.delete(`Removed by ${interaction.user.tag || interaction.user.id} using /automod remove-rule`);
      await interaction.editReply(`✅ Deleted bot-created AutoMod rule **${rule.name}**. Other server rules were not changed.`);
    } catch (error) {
      console.error(`[AutoMod] Could not delete rule ${rule.id} in guild ${interaction.guild.id}:`, error);
      await interaction.editReply(`❌ Could not delete **${rule.name}**: ${String(error?.message || 'Discord API error').slice(0, 250)}`);
    }
    return true;
  }

  if (sub === 'remove-bot-rules') {
    const confirmation = interaction.options.getString('confirm', true);
    if (confirmation !== 'DELETE') {
      await interaction.editReply('❌ Confirmation did not match. Type exactly `DELETE` to remove all AutoMod rules created by this bot in this server.');
      return true;
    }
    let deleted = 0;
    const failures = [];
    for (const rule of botRules) {
      try {
        await rule.delete(`Bulk removal confirmed by ${interaction.user.tag || interaction.user.id} using /automod remove-bot-rules`);
        deleted++;
      } catch (error) {
        failures.push(`• ${rule.name}: ${String(error?.message || 'Discord API error').slice(0, 120)}`);
      }
    }
    await interaction.editReply(`## AutoMod removal report\n✅ Deleted: **${deleted}** bot-created rule(s)\n${failures.length ? `❌ Failed: **${failures.length}**\n${failures.slice(0, 10).join('\n')}` : 'No deletion failures.'}\n\nRules created by other admins or bots were not targeted.`);
    return true;
  }

  if (sub === 'setup-batch') {
    let created = 0;
    let alreadyThere = 0;
    let skippedByTypeLimit = 0;
    let skippedByServerLimit = 0;
    const failures = [];
    for (const template of BATCH_TEMPLATES) {
      const legacyName = template.name === RULE_NAMES.keyword ? 'Block Custom Words by IM YOUR DADDY'
        : template.name === RULE_NAMES['flagged-words'] ? 'Block profanity, sexual content and slurs by IM YOUR DADDY'
        : template.name === RULE_NAMES['mention-spam'] ? 'Prevent mention spam by IM YOUR DADDY'
        : template.name === RULE_NAMES['spam-messages'] ? 'Prevent spam messages by IM YOUR DADDY' : null;
      const namedMatch = existing.some(rule => rule.name === template.name || (legacyName && rule.name === legacyName));
      if (namedMatch) {
        alreadyThere++;
        continue;
      }
      const typeRules = [...existing.values()].filter(rule => rule.triggerType === template.triggerType);
      const uniqueType = [3, 4, 5, 6].includes(template.triggerType);
      // Discord currently permits at most 6 keyword rules and 1 of each other supported trigger type per guild.
      const atTypeLimit = template.triggerType === 1 ? typeRules.length >= 6 : (uniqueType && typeRules.length >= 1);
      if (atTypeLimit) {
        skippedByTypeLimit++;
        continue;
      }
      // The target is 10 rules total in this guild. Never delete or replace another administrator's rules.
      if (existing.size >= MAX_RULES_PER_GUILD_TARGET) {
        skippedByServerLimit++;
        continue;
      }
      try {
        const rule = await interaction.guild.autoModerationRules.create(createPayload(template, interaction));
        // Count only rules returned successfully by Discord.
        existing.set(rule.id, rule);
        created++;
      } catch (error) {
        const code = error?.code || error?.rawError?.code;
        failures.push(`• ${template.name}: ${code ? `Discord error ${code}` : String(error?.message || 'failed').slice(0, 100)}`);
      }
    }
    const finalCount = existing.size;
    const notes = [];
    if (alreadyThere) notes.push(`ℹ️ **Already present by name:** ${alreadyThere}`);
    if (skippedByTypeLimit) notes.push(`ℹ️ **Skipped because a rule type is already at its Discord limit:** ${skippedByTypeLimit}`);
    if (skippedByServerLimit) notes.push(`ℹ️ **Skipped because this server already has ${MAX_RULES_PER_GUILD_TARGET} rules:** ${skippedByServerLimit}`);
    await interaction.editReply(
      `## AutoMod setup report\n` +
      `✅ **Created successfully:** ${created} new rule(s)\n` +
      `${notes.length ? notes.join('\n') + '\n' : ''}` +
      `📊 **Total rules in this server now:** ${finalCount}/${MAX_RULES_PER_GUILD_TARGET}\n` +
      `🎯 **Progress toward 100 bot-created rules:** run **/automod progress** to check all accessible servers.\n\n` +
      (failures.length ? `### Creation failures\n${failures.slice(0, 10).join('\n')}\n\nDiscord may have rejected a rule due to permissions, unsupported settings, API limits, or a rule-type limit.` : (created ? 'Every new rule listed above was confirmed by Discord.' : 'No new rules were created; review the skip counts above to see why.')) +
      `\n\nNo existing rules were deleted. Review the keyword lists in Server Settings → AutoMod and adjust them to your community.`
    );
    return true;
  }

  let template;
  if (sub === 'flagged-words') template = BATCH_TEMPLATES.find(t => t.name === RULE_NAMES['flagged-words']);
  else if (sub === 'mention-spam') template = { ...BATCH_TEMPLATES.find(t => t.name === RULE_NAMES['mention-spam']), triggerMetadata: { mentionTotalLimit: interaction.options.getInteger('limit') || 5, mentionRaidProtectionEnabled: false } };
  else if (sub === 'spam-messages') template = BATCH_TEMPLATES.find(t => t.name === RULE_NAMES['spam-messages']);
  else if (sub === 'keyword') {
    const word = interaction.options.getString('word', true).trim();
    if (!word) {
      await interaction.editReply('❌ The keyword cannot be empty or whitespace.');
      return true;
    }
    const oldRule = existing.find(rule => rule.name === RULE_NAMES.keyword);
    const existingWords = oldRule?.triggerType === 1 && Array.isArray(oldRule.triggerMetadata?.keywordFilter) ? oldRule.triggerMetadata.keywordFilter : [];
    const wordsMap = new Map();
    for (const value of existingWords) {
      const clean = String(value).trim();
      if (clean) wordsMap.set(clean.toLowerCase(), clean);
    }
    wordsMap.set(word.toLowerCase(), word);
    const keywordFilter = [...wordsMap.values()];
    if (keywordFilter.length > 1000) {
      await interaction.editReply('❌ This AutoMod rule already contains 1,000 keywords. Remove a keyword before adding another.');
      return true;
    }
    template = { name: RULE_NAMES.keyword, triggerType: 1, triggerMetadata: { keywordFilter } };
  } else {
    await interaction.editReply('❌ Unknown AutoMod rule type.');
    return true;
  }

  const oldRule = existing.find(rule => rule.name === template.name);
  const payload = createPayload(template, interaction);
  try {
    let rule;
    if (oldRule && oldRule.triggerType === template.triggerType) {
      rule = await oldRule.edit({ ...payload, name: oldRule.name });
    } else {
      if (oldRule) await oldRule.delete('Recreate AutoMod rule with updated trigger type');
      rule = await interaction.guild.autoModerationRules.create(payload);
    }
    const detail = sub === 'keyword' ? `Added **${interaction.options.getString('word', true).trim()}**. Saved keywords: ${template.triggerMetadata.keywordFilter.length}.` : `Enabled rule **${rule.name}**.`;
    await interaction.editReply(`✅ Discord AutoMod rule ${oldRule ? 'updated' : 'created'} and enabled.\n${detail}\nView it in **Server Settings → AutoMod**.`);
  } catch (error) {
    console.error(`[AutoMod] Failed to configure ${sub} in guild ${interaction.guild.id}:`, error);
    const code = error?.code || error?.rawError?.code;
    const details = code === 50013
      ? 'Discord denied the action. Check the bot has Manage Server permission.'
      : code === 50035
        ? 'Discord rejected the rule settings or the server has reached a rule-type limit.'
        : String(error?.message || 'Unknown Discord API error').slice(0, 300);
    await interaction.editReply(`❌ Could not create the native AutoMod rule. ${details}`);
  }
  return true;
}

module.exports = { command, commands: [command], handle, BATCH_TEMPLATES, TARGET_RULES };
