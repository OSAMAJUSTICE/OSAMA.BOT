'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require('discord.js');
const db = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS transfer_tax_settings (
    guild_id TEXT PRIMARY KEY,
    rate REAL NOT NULL DEFAULT 0.05,
    channel_id TEXT,
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  );
`);

const commands = [
  new SlashCommandBuilder()
    .setName('transfer-tax')
    .setDescription('Calculate the amount needed to transfer after a fee')
    .addIntegerOption(o => o.setName('amount')
      .setDescription('Amount the recipient must receive')
      .setMinValue(1).setMaxValue(1000000000).setRequired(true)),
  new SlashCommandBuilder()
    .setName('transfer-tax-config')
    .setDescription('Configure transfer fee (Administrator only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addNumberOption(o => o.setName('rate')
      .setDescription('Fee percentage, from 0 to 50')
      .setMinValue(0).setMaxValue(50).setRequired(true))
    .addChannelOption(o => o.setName('channel')
      .setDescription('Optional channel restriction; omit to allow all channels'))
];

function getSettings(guildId) {
  return db.prepare('SELECT * FROM transfer_tax_settings WHERE guild_id=?').get(guildId)
    || { rate: 0.05, channel_id: null };
}

function handles(i) {
  return Boolean(i?.isChatInputCommand?.() &&
    ['transfer-tax', 'transfer-tax-config'].includes(i.commandName));
}

async function handle(i) {
  if (!handles(i)) return false;
  if (!i.guildId) {
    return i.reply({ content: 'Use this command inside a server.', flags: MessageFlags.Ephemeral });
  }

  if (i.commandName === 'transfer-tax-config') {
    if (!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return i.reply({ content: 'Administrator permission is required.', flags: MessageFlags.Ephemeral });
    }
    const rate = i.options.getNumber('rate', true) / 100;
    const channel = i.options.getChannel('channel');
    db.prepare(`
      INSERT INTO transfer_tax_settings(guild_id,rate,channel_id,updated_by,updated_at)
      VALUES(?,?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET
        rate=excluded.rate, channel_id=excluded.channel_id,
        updated_by=excluded.updated_by, updated_at=excluded.updated_at
    `).run(i.guildId, rate, channel?.id || null, i.user.id, Date.now());
    return i.reply({
      content: `Transfer fee set to ${(rate * 100).toFixed(2)}%. ${channel ? `Restricted to ${channel}.` : 'Available in all channels.'}`,
      flags: MessageFlags.Ephemeral
    });
  }

  const settings = getSettings(i.guildId);
  if (settings.channel_id && settings.channel_id !== i.channelId) {
    return i.reply({
      content: `Use this command in <#${settings.channel_id}>.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const amount = i.options.getInteger('amount', true);
  const rate = Math.min(0.5, Math.max(0, Number(settings.rate) || 0));
  // Round upward so the recipient receives at least the requested amount after the fee.
  const total = rate === 0 ? amount : Math.ceil(amount / (1 - rate));
  const fee = total - amount;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🧮 Transfer fee calculator')
    .addFields(
      { name: 'Recipient receives', value: amount.toLocaleString('en-US'), inline: true },
      { name: `Fee (${(rate * 100).toFixed(2)}%)`, value: fee.toLocaleString('en-US'), inline: true },
      { name: 'You should transfer', value: total.toLocaleString('en-US'), inline: true }
    )
    .setFooter({ text: 'Estimate only • Verify your platform’s actual fee rules.' });
  return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

module.exports = { commands, handles, handle };
