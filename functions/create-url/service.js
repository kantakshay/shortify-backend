const crypto = require("crypto");
const saveUrl = require("./dynamoDB");
const { nowInSeconds } = require("../../shared/expiry");

// Public address of the API (no trailing slash), used to build short_url
const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");

// Fail at cold start rather than return broken links
if (!BASE_URL) {
  throw new Error("BASE_URL is not defined");
}

// Generate short code
function generateShortCode() {
  return crypto.randomBytes(4).toString("hex");
}

// How many random codes to try before giving up
const MAX_ATTEMPTS = 5;

// Saves the URL under the caller's custom code; 409 if the code is taken
async function saveCustomCode(url, customCode, expiresAt) {
  const code = validateCustomCode(customCode);

  try {
    await saveUrl(code, url, expiresAt);
    return code;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      const conflict = new Error("Custom code already taken");
      conflict.statusCode = 409;
      throw conflict;
    }
    throw err;
  }
}

// Saves the URL under a random code, trying a new code on each collision
async function saveRandomCode(url, expiresAt) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = generateShortCode();

    try {
      await saveUrl(code, url, expiresAt);
      return code;
    } catch (err) {
      // Anything other than "code already used" is a real failure
      if (err.name !== "ConditionalCheckFailedException") {
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
// Validates the URL and returns it normalized
const validateUrl = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const err = new Error("Invalid URL format");
    err.statusCode = 400;
    throw err;
  }

  // Allow only http/https
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const err = new Error("Only HTTP/HTTPS URLs are allowed");
    err.statusCode = 400;
    throw err;
  }

  return parsed.href; // normalized URL
};

// Validates the optional expiresAt (a date string such as
// "2026-12-31T23:59:59Z") and returns it in epoch seconds, or undefined.
const validateExpiresAt = (expiresAt) => {
  if (expiresAt === undefined || expiresAt === null) {
    return undefined;
  }

  const time = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  if (Number.isNaN(time)) {
    const err = new Error("expiresAt must be a date string, e.g. 2026-12-31T23:59:59Z");
    err.statusCode = 400;
    throw err;
  }

  const seconds = Math.floor(time / 1000);
  if (seconds <= nowInSeconds()) {
    const err = new Error("expiresAt must be in the future");
    err.statusCode = 400;
    throw err;
  }

  return seconds;
};

// Main service
exports.createShortUrl = async ({ url, customCode, expiresAt }) => {
  if (!url) {
    const err = new Error("URL is required");
    err.statusCode = 400;
    throw err;
  }

  url = validateUrl(url);
  const expiresAtSeconds = validateExpiresAt(expiresAt);

  const shortCode = customCode
    ? await saveCustomCode(url, customCode, expiresAtSeconds)
    : await saveRandomCode(url, expiresAtSeconds);

  return {
    short_code: shortCode,
    short_url: `${BASE_URL}/${shortCode}`,
    ...(expiresAtSeconds !== undefined && {
      expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    }),
  };
};
