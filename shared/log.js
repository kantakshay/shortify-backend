// Logging for errors caught in the Lambda handlers.
//
// ERROR must mean "something is broken, look at it", so alarms and searches
// only find real failures:
// - expected errors (4xx: bad input, not found, code taken) are the caller's,
//   not ours: one WARN line with the status and message, no stack trace;
// - everything else (5xx, or no statusCode at all) is a real failure: ERROR
//   with the full error and stack trace, plus the request ID that the caller
//   got in the 500 response (Lambda's line prefix has it too, but this keeps
//   it in the message if logs are exported or reformatted).

const logHandlerError = (lambdaName, err, requestId) => {
  if (err.statusCode && err.statusCode < 500) {
    console.warn(`[${lambdaName}] ${err.statusCode}: ${err.message}`);
    return;
  }

  const id = requestId ? ` (requestId=${requestId})` : "";
  console.error(`[${lambdaName}] Unexpected error${id}:`, err);
};

module.exports = { logHandlerError };
