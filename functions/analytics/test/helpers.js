// Test helpers for the analytics lambda.
// Require this before the code under test: dynamoDB.js reads these env vars
// when it loads.
process.env.STAGE = "test";
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

const expectCors = (res) => {
  expect(res.headers).to.include({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
};

const parseBody = (res) => JSON.parse(res.body);

module.exports = { catchError, expectCors, parseBody };
