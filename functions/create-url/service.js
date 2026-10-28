const crypto = require("crypto");
const saveUrl = require("./dynamoDB");

// Generate short code
function generateShortCode() {
  return crypto.randomBytes(4).toString("hex");
}

// Retry-safe creation (handles collisions)
async function generateUniqueCode(url, customCode) {

  if (customCode) {
    customCode = validateCustomCode(customCode)

    try {
      await saveUrl(customCode, url);
      return customCode;
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        const conflict = new Error("Custom code already taken");
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }
  }


  let attempts = 0;

  while (attempts < 5) {
    const code = generateShortCode();

    try {
      await saveUrl(code, url);
      return code;
    } catch (err) {
      // DynamoDB collision
      if (err.name === "ConditionalCheckFailedException") {
        attempts++;
      } else {
        throw err;
      }
    }
  }

  const err = new Error("Failed to generate unique short code");
  err.statusCode = 500;
  throw err;
}

const validateCustomCode = (customCode) => {
  // Type check
  if (typeof customCode !== "string") {
    const err = new Error("Custom code must be a string");
    err.statusCode = 400;
    throw err;
  }

  // Trim spaces
  const cleaned = customCode.trim();

  // Empty check
  if (!cleaned) {
    const err = new Error("Custom code cannot be empty");
    err.statusCode = 400;
    throw err;
  }

  // Length check
  if (cleaned.length < 3 || cleaned.length > 20) {
    const err = new Error("Custom code must be between 3 and 20 characters");
    err.statusCode = 400;
    throw err;
  }

  // Allowed characters (only alphanumeric)
  const regex = /^[a-zA-Z0-9]+$/;

  if (!regex.test(cleaned)) {
    const err = new Error("Custom code can only contain letters and numbers");
    err.statusCode = 400;
    throw err;
  }

  // Normalize (important)
  return cleaned.toLowerCase();
};
// Main service
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
exports.createShortUrl = async ({ url , customCode}) => {

  url = validateUrl(url);

  if (!url) {
    const err = new Error("URL is required");
    err.statusCode = 400;
    throw err;
  }

  const shortCode = await generateUniqueCode(url, customCode);

  return {
    short_code: shortCode,
    short_url: shortCode, // domain can be added later
  };
};