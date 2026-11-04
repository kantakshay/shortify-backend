const { createShortUrl } = require("./service");
const { jsonResponse, errorToResponse } = require("../../shared/response");
const { logHandlerError } = require("../../shared/log");

// Prefix for this Lambda's log lines, e.g. "[create-url] 400: Invalid URL format"
const LAMBDA_NAME = "create-url";

exports.main = async (event, context) => {
  // Lambda's ID for this invocation; returned in 500s so a caller can report it
  const requestId = context?.awsRequestId;
  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  // null, arrays, strings and numbers are valid JSON but not a request object
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(400, { error: "Request body must be a JSON object" });
  }

  try {
    const result = await createShortUrl(body);

    return jsonResponse(201, result);
  } catch (err) {
    logHandlerError(LAMBDA_NAME, err, requestId);

    return errorToResponse(err, requestId);
  }
};
