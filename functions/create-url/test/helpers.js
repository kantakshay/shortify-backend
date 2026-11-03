// Test helpers for the create-url lambda.
// Require this before the code under test: shared/dynamo.js and service.js read
// these env vars when they load, and throw if TABLE_NAME or BASE_URL is missing.
process.env.TABLE_NAME = "test-table";
process.env.AWS_REGION = "ap-south-1";
process.env.BASE_URL = "https://short.test/dev";

const { expect } = require("chai");

// Same shape DynamoDB returns when a ConditionExpression fails.
const conditionalCheckFailed = () => {
  const err = new Error("The conditional request failed");
  err.name = "ConditionalCheckFailedException";
  return err;
};

// Returns the error a promise rejects with, and fails the test if it resolves.
const catchError = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved");
};

// Hides log output from the code under test. Call inside a describe block.
const silenceConsole = () => {
  const original = {};

  beforeEach(() => {
    original.log = console.log;
    original.warn = console.warn;
    original.error = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  });
};

// Records console output for the current test. Use only inside a describe
// that calls silenceConsole(), which puts the real console back afterwards.
const recordConsole = () => {
  const calls = { log: [], warn: [], error: [] };
  console.log = (...args) => calls.log.push(args);
  console.warn = (...args) => calls.warn.push(args);
  console.error = (...args) => calls.error.push(args);
  return calls;
};

const expectCors = (res) => {
  expect(res.headers).to.include({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
};

const parseBody = (res) => JSON.parse(res.body);

module.exports = {
  conditionalCheckFailed,
  catchError,
  silenceConsole,
  recordConsole,
  expectCors,
  parseBody,
};
