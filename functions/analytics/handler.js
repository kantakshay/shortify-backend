const { getAnalytics } = require("./service");
const { jsonResponse, errorToResponse } = require("../../shared/response");
const { logHandlerError } = require("../../shared/log");

// Prefix for this Lambda's log lines, e.g. "[analytics] 404: URL not found"
const LAMBDA_NAME = "analytics";

exports.main = async (event, context) => {
  // Lambda's ID for this invocation; returned in 500s so a caller can report it
  const requestId = context?.awsRequestId;

  try {
    const shortCode = event.pathParameters?.short_code;

    const data = await getAnalytics(shortCode);

    return jsonResponse(200, data);
  } catch (err) {
    logHandlerError(LAMBDA_NAME, err, requestId);

    return errorToResponse(err, requestId);
  }
};
