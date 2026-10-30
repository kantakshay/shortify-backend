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

  // An expired link counts as gone, even if TTL hasn't deleted it yet
  if (!data || isExpired(data)) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  return {
    short_code: data.short_code,
    long_url: data.long_url,
    clicks: data.clicks || 0,
    ...(typeof data.expires_at === "number" && {
      expires_at: new Date(data.expires_at * 1000).toISOString(),
    }),
  };
};

module.exports = { getAnalytics };
