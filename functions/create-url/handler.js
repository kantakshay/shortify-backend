const { createShortUrl } = require("./service");
const { jsonResponse, errorToResponse } = require("../../shared/response");

exports.main = async (event) => {
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
    console.error("Handler Error:", err);

    return errorToResponse(err);
  }
};
