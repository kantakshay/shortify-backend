const { getLongUrl } = require("./service");
const { redirectResponse, errorToResponse } = require("../../shared/response");
const { logHandlerError } = require("../../shared/log");

// Prefix for this Lambda's log lines, e.g. "[redirect-url] 404: URL not found"
const LAMBDA_NAME = "redirect-url";

exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const longUrl = await getLongUrl(shortCode);

    return redirectResponse(longUrl);
  } catch (err) {
    logHandlerError(LAMBDA_NAME, err);

    return errorToResponse(err);
  }
};
