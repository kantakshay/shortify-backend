const { getLongUrl } = require("./service");

exports.main = async (event) => {
  try {
    const shortCode = event.pathParameters?.short_code;

    const longUrl = await getLongUrl(shortCode);

    return {
      statusCode: 302,
      headers: {
        Location: longUrl,
      },
    };

  } catch (error) {
    console.error("Entry Error:", error);

    return {
      statusCode: error.statusCode || 500,
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};