const { getLongUrl } = require("./service");

exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const longUrl = await getLongUrl(shortCode);

    return {
      statusCode: 302,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*",
        Location: longUrl,
      },
    };

  } catch (error) {
    console.error("Entry Error:", error);

    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};