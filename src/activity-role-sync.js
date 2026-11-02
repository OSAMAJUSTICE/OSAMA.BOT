'use strict';

const VALID_ID = /^\d{17,20}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const RULES = Object.freeze([
  { key: 'minecraftRoleId', label: 'Minecraft', matches: ['minecraft'] },
  { key: 'robloxRoleId', label: 'Roblox', matches: ['roblox'] },
  { key: 'vscodeRoleId', label: 'VS Code', matches: ['visual studio code', 'code'] },
  { key: 'streamingRoleId', label: 'Streaming', streaming: true }
]);

function activeRules(presence) {
  const activities = Array.isArray(presence?.activities) ? presence.activities : [];
  return new Map(RULES.map(rule => [rule.key, activities.some(activity => {
    if (rule.streaming) return activity.type === 1;
    const name = String(activity?.name || '').trim().toLocaleLowerCase();
    return rule.matches.includes(name);
  })]));
}

function createActivityRoleSync({ delayMs = 900, logger = console } = {}) {
  const queues = new Map();
  const lastMutation = new Map();

  async function syncInternal(member, presence, settings = {}) {
    const result = { added: 0, removed: 0, skipped: 0, errors: 0 };
    if (!member?.guild || !member.user || member.user.bot || !presence) {
      result.skipped++;
      return result;
    }
    const configured = RULES.map(rule => ({ ...rule, roleId: settings[rule.key] }))
      .filter(rule => typeof rule.roleId === 'string' && VALID_ID.test(rule.roleId));
    if (!configured.length) { result.skipped++; return result; }

    const me = member.guild.members.me;
    if (!me?.permissions?.has('ManageRoles')) {
      logger.warn(`[ActivityRoles] Bot lacks Manage Roles in guild ${member.guild.id}.`);
      result.errors += configured.length;
      return result;
    }
    const desired = activeRules(presence);
    for (const rule of configured) {
      const role = member.guild.roles.cache.get(rule.roleId);
      if (!role || role.managed || me.roles.highest.comparePositionTo(role) <= 0) {
        result.skipped++;
        continue;
      }
      const shouldHave = Boolean(desired.get(rule.key));
      const hasRole = member.roles.cache.has(role.id);
      if (hasRole === shouldHave) continue;
      try {
        const last = lastMutation.get(member.guild.id) || 0;
        const wait = Math.max(0, Math.max(500, delayMs) - (Date.now() - last));
        if (wait) await sleep(wait);
        if (shouldHave) await member.roles.add(role, `Automatic activity role: ${rule.label}`);
        else await member.roles.remove(role, `Automatic activity role ended: ${rule.label}`);
        lastMutation.set(member.guild.id, Date.now());
        if (shouldHave) result.added++; else result.removed++;
      } catch (error) {
        result.errors++;
        logger.warn(`[ActivityRoles] Could not update ${rule.label} role for ${member.id} in ${member.guild.id}: ${error.message}`);
      }
    }
    return result;
  }

  function syncMember(member, presence, settings) {
    const guildId = member?.guild?.id;
    if (!guildId) return Promise.resolve({ added: 0, removed: 0, skipped: 1, errors: 0 });
    const previous = queues.get(guildId) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => syncInternal(member, presence, settings));
    queues.set(guildId, current);
    return current.finally(() => { if (queues.get(guildId) === current) queues.delete(guildId); });
  }

  return { syncMember };
}

module.exports = { RULES, activeRules, createActivityRoleSync };
