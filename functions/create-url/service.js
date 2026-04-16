const crypto = require("crypto");
const saveUrl = require("./dynamoDB");

// Generate short code
function generateShortCode() {
  return crypto.randomBytes(4).toString("hex");
}

// Retry-safe creation (handles collisions)
async function generateUniqueCode(url) {
  let attempts = 0;

  while (attempts < 5) {
    const code = generateShortCode();

    try {
      await saveUrl(code, url);
      return code;
    } catch (err) {
      // DynamoDB collision
      if (err.code === "ConditionalCheckFailedException") {
        attempts++;
      } else {
        throw err;
      }
    }
  }

  throw new Error("Failed to generate unique short code");
}

const validateUrl = (url) => {
  try {
    const parsed = new URL(url);

    // Allow only http/https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      const err = new Error("Only HTTP/HTTPS URLs are allowed");
      err.statusCode = 400;
      throw err;
    }

    return parsed.href; // normalized URL
  } catch (error) {
    const err = new Error("Invalid URL format");
    err.statusCode = 400;
    throw err;
  }
};

// Main service
exports.createShortUrl = async ({ url }) => {

  url = validateUrl(url);

  if (!url) {
    const err = new Error("URL is required");
    err.statusCode = 400;
    throw err;
  }

  const shortCode = await generateUniqueCode(url);

  return {
    short_code: shortCode,
    short_url: shortCode, // domain can be added later
  };
};