const { getAnalytics } = require("./service");
const { jsonResponse, errorToResponse } = require("../../shared/response");

exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const data = await getAnalytics(shortCode);

    return jsonResponse(200, data);
  } catch (err) {
    console.error("Analytics Error:", err);

    return errorToResponse(err);
  }
};
