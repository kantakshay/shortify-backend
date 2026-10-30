const { fetchUrl } = require("./dynamoDB");
const { isExpired } = require("../../shared/expiry");

const getAnalytics = async (shortCode) => {
  if (!shortCode) {
    const err = new Error("Short code is required");
    err.statusCode = 400;
    throw err;
  }

  // Codes are stored lowercase (custom codes are lowercased on create)
  const data = await fetchUrl(shortCode.toLowerCase());

  // Expired links are never deleted (so their codes can't be reused); they
  // stay in the table, so treat them as not found here
  if (!data || isExpired(data)) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  return {
    short_code: data.short_code,
    long_url: data.long_url,
    clicks: data.clicks || 0,
    created_at: data.created_at || null,
    // null until the first click (also for links last clicked before this field existed)
    last_clicked_at: data.last_clicked_at || null,
    ...(typeof data.expires_at === "number" && {
      expires_at: new Date(data.expires_at * 1000).toISOString(),
    }),
  };
};

module.exports = { getAnalytics };
