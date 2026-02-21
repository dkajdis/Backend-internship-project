require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { processOrderPayment } = require("../services/payment-worker.service");
const { pool } = require("../db/pool");
const { logInfo, logError } = require("../utils/json-logger");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

const region = process.env.AWS_REGION || "us-east-1";
const queueUrl = process.env.SQS_QUEUE_URL;
const waitTimeSeconds = toPositiveInt(process.env.SQS_POLL_WAIT_SECONDS, 20);
const maxNumberOfMessages = Math.min(
  toPositiveInt(process.env.SQS_POLL_MAX_MESSAGES, 5),
  10
);
const visibilityTimeout = toPositiveInt(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS, 30);
const idleDelayMs = toPositiveInt(process.env.SQS_POLL_IDLE_DELAY_MS, 1000);

const sqsClient = new SQSClient({ region });
let keepRunning = true;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function deleteMessage(receiptHandle) {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
}

async function processOneMessage(message) {
  const body = safeJsonParse(message.Body || "");
  const orderId = body?.orderId;

  if (!Number.isInteger(orderId) || orderId <= 0) {
    logError({
      worker: "payment",
      event: "invalid_message_body",
      requestId: message?.MessageId || null,
      orderId: null,
      status: "invalid_message",
      body: message.Body || null,
    });
    // Delete the message to prevent it from blocking the queue, since it's not processable.
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  const requestId =
    message?.MessageAttributes?.requestId?.StringValue || message?.MessageId || null;

  try {
    const result = await processOrderPayment(orderId);
    logInfo({
      worker: "payment",
      event: "order_processed",
      requestId,
      orderId,
      status: result.orderStatus || result.currentStatus || "unchanged",
      result,
    });
    await deleteMessage(message.ReceiptHandle);
  } catch (error) {
    logError({
      worker: "payment",
      event: "order_process_failed",
      requestId,
      orderId,
      status: "failed",
      error: error.message,
    });
    // Keep message in queue for another retry via visibility timeout.
  }
}

async function pollOnce() {
  const response = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
      VisibilityTimeout: visibilityTimeout,
      MessageAttributeNames: ["All"],
    })
  );

  const messages = response.Messages || [];
  if (messages.length === 0) return false;

  for (const message of messages) {
    await processOneMessage(message);
  }
  return true;
}

async function runWorker() {
  if (!queueUrl) {
    throw new Error("Missing SQS_QUEUE_URL for payment worker");
  }

  logInfo({
    worker: "payment",
    event: "worker_started",
    requestId: null,
    orderId: null,
    status: "running",
    queueUrl,
    region,
  });

  while (keepRunning) {
    try {
      const hadMessages = await pollOnce();
      if (!hadMessages) await sleep(idleDelayMs);
    } catch (error) {
      logError({
        worker: "payment",
        event: "poll_failed",
        requestId: null,
        orderId: null,
        status: "failed",
        error: error.message,
      });
      await sleep(idleDelayMs);
    }
  }
}

// Shutdown: stop polling and wait for in-flight processing to finish before exiting.
async function shutdown(signal) {
  keepRunning = false;
  logInfo({
    worker: "payment",
    event: "worker_stopping",
    requestId: null,
    orderId: null,
    status: "stopping",
    signal,
  });
  await pool.end();
}

if (require.main === module) {
  process.on("SIGINT", () => shutdown("SIGINT").catch(() => process.exit(1)));
  process.on("SIGTERM", () => shutdown("SIGTERM").catch(() => process.exit(1)));

  runWorker().catch(async (error) => {
    logError({
      worker: "payment",
      event: "worker_crashed",
      requestId: null,
      orderId: null,
      status: "crashed",
      error: error.message,
    });
    await pool.end();
    process.exit(1);
  });
}

module.exports = { runWorker, processOneMessage };
