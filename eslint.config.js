// ESLint catches likely bugs (unused or undefined names, unreachable code).
// Formatting is left to Prettier.
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/", ".serverless/"] },

  js.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },

  // Tests run under mocha (describe, it, before, ...)
  {
    files: ["**/test/**/*.js"],
    languageOptions: {
      globals: { ...globals.mocha },
    },
  },
];
