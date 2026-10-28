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
    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};