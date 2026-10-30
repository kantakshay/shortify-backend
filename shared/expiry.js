// Link expiry. expires_at is stored as epoch seconds (a number).
//
// Expired links are never deleted: they stay in the table as retired records,
// so their codes can't be reused. Every reader must check isExpired() and treat
// an expired link as not found.

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// True once a link's expiry time has passed
const isExpired = (item) =>
  typeof item.expires_at === "number" && item.expires_at <= nowInSeconds();

module.exports = { nowInSeconds, isExpired };
