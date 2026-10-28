// Test helpers for the create-url lambda.
// Require this before the code under test: dynamoDB.js reads these env vars
// when it loads, and throws if TABLE_NAME is missing outside the local stage.
process.env.STAGE = "test";
process.env.TABLE_NAME = "test-table";
process.env.AWS_REGION = "ap-south-1";

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
    original.error = console.error;
    console.log = () => {};
    console.error = () => {};
  });

  afterEach(() => {
    console.log = original.log;
    console.error = original.error;
  });
};

const expectCors = (res) => {
  expect(res.headers).to.include({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
};

const parseBody = (res) => JSON.parse(res.body);

module.exports = { conditionalCheckFailed, catchError, silenceConsole, expectCors, parseBody };
