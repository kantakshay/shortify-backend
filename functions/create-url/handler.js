const { createShortUrl } = require("./service");

exports.main = async (event) => {
  let body;

  console.log("event-----", event);
  try {
    body = JSON.parse(event.body || "{}");
    console.log("body---", body)
  } catch (err) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  try {

    const result = await createShortUrl(body);

    return {
      statusCode: result.statusCode || 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },

      body: JSON.stringify(result.data || result),
    };

  } catch (error) {
    console.error("Handler Error:", error);

    return {
      statusCode: error.statusCode || 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "*"
      },
      body: JSON.stringify({
        error: error.message || "Internal Server Error",
      }),
    };
  }
};