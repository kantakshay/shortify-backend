const { getAnalytics } = require("./service");


exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const data = await getAnalytics(shortCode);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error("Analytics Error:", error);

    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },
      // Only expected errors (with a statusCode) show their message to the caller
      body: JSON.stringify({ error: error.statusCode ? error.message : "Internal Server Error" }),
    };
  }
};