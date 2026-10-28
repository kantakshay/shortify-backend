const {fetchUrl} = require("./dynamoDB");

const getAnalytics = async (shortCode) => {

  if (!shortCode) {
    const err = new Error("Short code is required");
    err.statusCode = 400;
    throw err;
  }

  // Codes are stored lowercase (custom codes are lowercased on create)
  const data = await fetchUrl(shortCode.toLowerCase());

  if (!data) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  return {
    short_code: data.short_code,
    long_url: data.long_url,
    clicks: data.clicks || 0,
  };
};

module.exports = {getAnalytics};