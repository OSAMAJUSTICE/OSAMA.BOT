'use strict';

const BADGE_LABELS = Object.freeze({
  HypeSquadOnlineHouse1: 'HypeSquad Bravery',
  HypeSquadOnlineHouse2: 'HypeSquad Brilliance',
  HypeSquadOnlineHouse3: 'HypeSquad Balance',
  PremiumEarlySupporter: 'Early Supporter',
  VerifiedDeveloper: 'Verified Developer',
  BugHunterLevel1: 'Bug Hunter',
  BugHunterLevel2: 'Bug Hunter Level 2',
  Partner: 'Discord Partner',
  Hypesquad: 'HypeSquad Events',
  CertifiedModerator: 'Certified Moderator',
  ActiveDeveloper: 'Active Developer',
  Boost: 'Server Booster'
});

const VALID_ID = /^\d{17,20}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createBadgeRoleSync({ delayMs = 750, logger = console } = {}) {
  const guildQueues = new Map();
  const lastMutationAt = new Map();

  async function waitForRateSlot(guildId) {
    const last = lastMutationAt.get(guildId) || 0;
    const wait = Math.max(0, delayMs - (Date.now() - last));
    if (wait) await sleep(wait);
  }

  async function syncMemberInternal(member, roleMap) {
    const result = { added: 0, removed: 0, skipped: 0, errors: 0 };
    if (!member?.guild || !member.user || member.user.bot) {
      result.skipped++;
      return result;
    }

    const mappings = Object.entries(roleMap || {}).filter(([badge, roleId]) =>
      Object.prototype.hasOwnProperty.call(BADGE_LABELS, badge) &&
      typeof roleId === 'string' && VALID_ID.test(roleId)
    );
    if (!mappings.length) {
      result.skipped++;
      return result;
    }

    let user = member.user;
    const needsFlags = mappings.some(([badge]) => badge !== 'Boost');
    if (needsFlags && !user.flags) {
      try {
        user = await member.client.users.fetch(member.id, { force: true });
      } catch (error) {
        logger.warn(`[BadgeRoles] Could not fetch public flags for ${member.id} in ${member.guild.id}: ${error.message}`);
        result.errors++;
        result.skipped++;
        return result; // Unknown flags must never cause badge roles to be removed.
      }
    }

    let flags = {};
    if (needsFlags) {
      try {
        if (!user.flags) throw new Error('Discord did not provide user flags');
        flags = typeof user.flags.serialize === 'function' ? user.flags.serialize() : {};
      } catch (error) {
        logger.warn(`[BadgeRoles] Public flags unavailable for ${member.id}: ${error.message}`);
        result.errors++;
        result.skipped++;
        return result;
      }
    }

    const desiredByRole = new Map();
    for (const [badge, roleId] of mappings) {
      const desired = badge === 'Boost' ? Boolean(member.premiumSince) : Boolean(flags[badge]);
      desiredByRole.set(roleId, Boolean(desiredByRole.get(roleId) || desired));
    }

    const me = member.guild.members.me;
    if (!me?.permissions?.has('ManageRoles')) {
      logger.warn(`[BadgeRoles] Bot lacks Manage Roles in guild ${member.guild.id}.`);
      result.errors += desiredByRole.size;
      result.skipped += desiredByRole.size;
      return result;
    }

    for (const [roleId, shouldHave] of desiredByRole) {
      const role = member.guild.roles.cache.get(roleId);
      if (!role || role.managed || me.roles.highest.comparePositionTo(role) <= 0) {
        result.skipped++;
        continue;
      }
      const hasRole = member.roles.cache.has(roleId);
      if (hasRole === shouldHave) continue;

      try {
        await waitForRateSlot(member.guild.id);
        if (shouldHave) await member.roles.add(role, 'Automatic public badge / server boost role sync');
        else await member.roles.remove(role, 'Automatic public badge / server boost role sync');
        lastMutationAt.set(member.guild.id, Date.now());
        if (shouldHave) result.added++;
        else result.removed++;
      } catch (error) {
        result.errors++;
        logger.warn(`[BadgeRoles] Could not ${shouldHave ? 'add' : 'remove'} role ${roleId} for ${member.id} in ${member.guild.id}: ${error.message}`);
      }
    }
    return result;
  }

  function syncMember(member, roleMap) {
    if (!member?.guild?.id) return Promise.resolve({ added: 0, removed: 0, skipped: 1, errors: 0 });
    const guildId = member.guild.id;
    const previous = guildQueues.get(guildId) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => syncMemberInternal(member, roleMap));
    guildQueues.set(guildId, current);
    return current.finally(() => {
      if (guildQueues.get(guildId) === current) guildQueues.delete(guildId);
    });
  }

  async function syncGuild(guild, roleMap, onProgress = async () => {}) {
    if (!Object.entries(roleMap || {}).some(([badge, roleId]) =>
      Object.prototype.hasOwnProperty.call(BADGE_LABELS, badge) && typeof roleId === 'string' && VALID_ID.test(roleId)
    )) {
      return { configured: false, processed: 0, added: 0, removed: 0, skipped: 0, errors: 0 };
    }

    const members = await guild.members.fetch();
    const total = members.size;
    const totals = { configured: true, processed: 0, added: 0, removed: 0, skipped: 0, errors: 0, total };
    for (const member of members.values()) {
      const result = await syncMember(member, roleMap);
      totals.processed++;
      totals.added += result.added;
      totals.removed += result.removed;
      totals.skipped += result.skipped;
      totals.errors += result.errors;
      if (totals.processed % 100 === 0 || totals.processed === total) {
        try { await onProgress({ ...totals }); } catch { /* Continue even if the interaction expires. */ }
      }
    }
    return totals;
  }

  return { syncMember, syncGuild };
}

module.exports = { BADGE_LABELS, createBadgeRoleSync };
