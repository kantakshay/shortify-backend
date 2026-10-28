const {fetchUrl, incrementClicks} = require("./dynamoDB");

exports.getLongUrl = async (shortCode) => {
  if (!shortCode) {
    const err = new Error("Short code is required");
    err.statusCode = 400;
    throw err;
  }

  const data = await fetchUrl(shortCode);
  console.log(`show me the data${data}`)
  if (!data || !data.long_url) {
    const err = new Error("URL not found");
    err.statusCode = 404;
    throw err;
  }

  await incrementClicks(shortCode);

  return data.long_url;
};