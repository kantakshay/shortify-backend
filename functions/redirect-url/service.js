const {fetchUrl, incrementClicks} = require("./dynamoDB");

exports.getLongUrl = async (shortCode) => {
  if (!shortCode) {
    const err = new Error("Short code is required");
    err.statusCode = 400;
    throw err;
  }

  const data = await fetchUrl(shortCode);
  await incrementClicks(shortCode);

  if (!data) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  return data.long_url;
};