'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
function accountAgeDays(user, now = Date.now()) {
  const created = Number(user?.createdTimestamp);
  if (!Number.isFinite(created) || created <= 0 || created > now) return null;
  return Math.floor((now - created) / DAY_MS);
}
function shouldRejectNewAccount(user, minimumDays, now = Date.now()) {
  if (!user || user.bot) return false;
  const age = accountAgeDays(user, now);
  const min = Number(minimumDays);
  return age !== null && Number.isInteger(min) && min >= 1 && age < min;
}
module.exports = { DAY_MS, accountAgeDays, shouldRejectNewAccount };
