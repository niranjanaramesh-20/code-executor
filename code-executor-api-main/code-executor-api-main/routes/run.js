const { randomUUID } = require("node:crypto");
const { PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const dynamodb = require("../config/dynamodb");

const TABLE_NAME = "CodeExecutionEvents";

const express = require("express")
const rateLimit = require("express-rate-limit")
const codeQueue = require("../config/queue")
const languages = require("../config/languages")
const redis = require("../config/redis")
const {MAX_CODE_SIZE, MAX_INPUT_SIZE} = require("../config/limits")

const router = express.Router()

const runLimiter = rateLimit({
    windowMs: 60 * 1000,   
    max: 20,               
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many runs. Please wait a moment and try again." }
})

router.post("/run", runLimiter, async (req, res) => {
  const { language, code, stdin } = req.body;

  if (typeof language !== "string" || typeof code !== "string") {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (!languages[language]) {
    return res.status(400).json({ error: "Unsupported language" });
  }

  if (code.length > MAX_CODE_SIZE) {
    return res.status(413).json({ error: "Code too large" });
  }

  if (stdin !== undefined && typeof stdin !== "string") {
    return res.status(400).json({ error: "stdin must be a string" });
  }

  if (stdin && stdin.length > MAX_INPUT_SIZE) {
    return res.status(413).json({ error: "Input too large" });
  }

  const eventId = randomUUID();
  let eventCreated = false;

  try {
    // Record the event before queueing the job.
    await dynamodb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          eventId,
          userId: "local-demo-user",
          language,
          status: "QUEUED",
          executionTimeMs: 0,
          createdAt: new Date().toISOString(),
          source: "code-execution-platform",
        },
        ConditionExpression: "attribute_not_exists(eventId)",
      })
    );

    eventCreated = true;

    const job = await codeQueue.add("execute", {
      language,
      code,
      stdin,
      eventId,
    });

    res.status(202).json({
      jobId: job.id,
      eventId,
    });
  } catch (err) {
    console.error("Failed to queue or record execution:", err);

    // If the event was created but the job could not be queued,
    // record the submission failure.
    if (eventCreated) {
      try {
        await dynamodb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { eventId },
            UpdateExpression: "SET #status = :status",
            ExpressionAttributeNames: {
              "#status": "status",
            },
            ExpressionAttributeValues: {
              ":status": "FAILED",
            },
          })
        );
      } catch (updateError) {
        console.error("Failed to update DynamoDB event:", updateError.message);
      }
    }

    if (res.headersSent) return;

    res.status(500).json({
      error: "Could not submit execution job",
    });
  }
});


router.get("/jobs/:id", async(req, res) => {

    try {
        const result = await redis.get(
            `job:${req.params.id}`
        )

        if (result) {
            return res.status(200).json(JSON.parse(result))
        }

        const job = await codeQueue.getJob(req.params.id)

        if (!job) {
            return res.status(404).json({
                error: "Job not found"
            })
        }

        res.status(200).json({
            status: "running"
        })

    } catch(err) {
        console.error(err)

        res.status(500).json({
            error: err.message
        })
    } 

});

module.exports = router
