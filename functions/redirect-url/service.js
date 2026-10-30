const { fetchUrl, incrementClicks } = require("./dynamoDB");
const { isExpired } = require("../../shared/expiry");

exports.getLongUrl = async (shortCode) => {
  if (!shortCode) {
    const err = new Error("Short code is required");
    err.statusCode = 400;
    throw err;
  }

  // Codes are stored lowercase (custom codes are lowercased on create)
  const code = shortCode.toLowerCase();

  const data = await fetchUrl(code);
  // Expired links are never deleted (so their codes can't be reused); they
  // stay in the table, so treat them as not found here
  if (!data || !data.long_url || isExpired(data)) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  await incrementClicks(code);

  return data.long_url;
};
