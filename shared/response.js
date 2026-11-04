// HTTP responses for the Lambda handlers. Every response carries the same
// permissive CORS headers, so a browser front-end can read it.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
};

// JSON response with the given status code.
const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  body: JSON.stringify(body),
});

// Turns an error caught in a handler into its HTTP response. Expected errors
// (with a statusCode, e.g. 400/404/409) show their message to the caller;
// anything else is a 500 with a generic message.
//
// 5xx responses also carry the Lambda request ID (context.awsRequestId), so a
// caller can report it and we can find the exact log lines. It's a random ID
// and reveals nothing. 4xx messages already say what to fix, so they don't get one.
const errorToResponse = (err, requestId) => {
  const statusCode = err.statusCode || 500;

  return jsonResponse(statusCode, {
    error: err.statusCode ? err.message : "Internal Server Error",
    ...(statusCode >= 500 && requestId && { requestId }),
  });
};

// 302 redirect to the given URL.
const redirectResponse = (location) => ({
  statusCode: 302,
  headers: { ...CORS_HEADERS, Location: location },
});

module.exports = { CORS_HEADERS, jsonResponse, errorToResponse, redirectResponse };
