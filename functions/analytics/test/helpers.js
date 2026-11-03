// Test helpers for the analytics lambda.
// Require this before the code under test: shared/dynamo.js reads these env
// vars when it loads, and throws if TABLE_NAME is missing.
process.env.TABLE_NAME = "test-table";
process.env.AWS_REGION = "ap-south-1";

const { expect } = require("chai");

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

module.exports = { catchError, silenceConsole, recordConsole, expectCors, parseBody };
