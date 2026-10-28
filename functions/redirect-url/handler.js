const { getLongUrl } = require("./service");
const { redirectResponse, errorToResponse } = require("../../shared/response");

exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const longUrl = await getLongUrl(shortCode);

    return redirectResponse(longUrl);
  } catch (err) {
    console.error("Entry Error:", err);

    return errorToResponse(err);
  }
};
