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
const errorToResponse = (err) =>
  jsonResponse(err.statusCode || 500, {
    error: err.statusCode ? err.message : "Internal Server Error",
  });

// 302 redirect to the given URL.
const redirectResponse = (location) => ({
  statusCode: 302,
  headers: { ...CORS_HEADERS, Location: location },
});

module.exports = { CORS_HEADERS, jsonResponse, errorToResponse, redirectResponse };
