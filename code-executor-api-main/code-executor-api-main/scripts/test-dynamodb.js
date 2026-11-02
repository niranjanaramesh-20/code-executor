
const { randomUUID } = require("node:crypto");
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const dynamodb = require("../config/dynamodb");

const TABLE_NAME = "CodeExecutionEvents";

async function main() {
  const event = {
    eventId: `local-test-${randomUUID()}`,
    userId: "local-demo-user",
    language: "python",
    status: "SUCCESS",
    executionTimeMs: 150,
    createdAt: new Date().toISOString(),
    source: "local-backend-test",
  };

  await dynamodb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: event,
      ConditionExpression: "attribute_not_exists(eventId)",
    })
  );

  console.log("DynamoDB event saved successfully:");
  console.log(JSON.stringify(event, null, 2));
}

main().catch((error) => {
  console.error("Failed to write DynamoDB event:", error.name);
  console.error(error.message);
  process.exitCode = 1;
});
