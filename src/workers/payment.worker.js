require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
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
const maxReceiveCount = toPositiveInt(process.env.SQS_WORKER_MAX_RECEIVE_COUNT, 5);
const processTimeoutMs = toPositiveInt(process.env.SQS_PROCESS_TIMEOUT_MS, 15000);
const pollTimeoutMs = toPositiveInt(process.env.SQS_POLL_TIMEOUT_MS, waitTimeSeconds * 1000 + 5000);
const shutdownGraceMs = toPositiveInt(process.env.SQS_SHUTDOWN_GRACE_MS, 10000);
const dlqUrl = process.env.SQS_DLQ_URL;

const sqsClient = new SQSClient({ region });
let keepRunning = true;
let inFlightMessages = 0;
let shutdownPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function getReceiveCount(message) {
  const raw = message?.Attributes?.ApproximateReceiveCount;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return 1;
  return n;
}

async function deleteMessage(receiptHandle) {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
}

async function moveToDlqAndDelete(message, reason, errorMessage = null) {
  if (!dlqUrl) {
    return { moved: false, reason: "missing_dlq_url" };
  }

  const dlqBody = {
    originalMessageId: message?.MessageId || null,
    originalBody: message?.Body || null,
    receiveCount: getReceiveCount(message),
    reason,
    error: errorMessage,
    movedAt: new Date().toISOString(),
  };

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: dlqUrl,
      MessageBody: JSON.stringify(dlqBody),
      MessageAttributes: message?.MessageAttributes,
    })
  );

  await deleteMessage(message.ReceiptHandle);
  return { moved: true };
}

async function processOneMessage(message) {
  inFlightMessages += 1;

  try {
    const body = safeJsonParse(message.Body || "");
    const orderId = body?.orderId;
    const receiveCount = getReceiveCount(message);
    const requestId =
      message?.MessageAttributes?.requestId?.StringValue || message?.MessageId || null;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      logError({
        worker: "payment",
        event: "invalid_message_body",
        requestId,
        orderId: null,
        status: "invalid_message",
        body: message.Body || null,
        receiveCount,
      });

      try {
        const moved = await moveToDlqAndDelete(message, "invalid_message_body");
        if (!moved.moved) {
          // Without DLQ configured, drop non-processable message to avoid poison loops.
          await deleteMessage(message.ReceiptHandle);
        }
      } catch (dlqError) {
        logError({
          worker: "payment",
          event: "invalid_message_dlq_failed",
          requestId,
          orderId: null,
          status: "failed",
          error: dlqError.message,
        });
      }

      return;
    }

    try {
      const result = await withTimeout(
        processOrderPayment(orderId),
        processTimeoutMs,
        `process_timeout_after_${processTimeoutMs}ms`
      );

      logInfo({
        worker: "payment",
        event: "order_processed",
        requestId,
        orderId,
        status: result.orderStatus || result.currentStatus || "unchanged",
        receiveCount,
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
        receiveCount,
      });

      if (receiveCount >= maxReceiveCount) {
        try {
          const moved = await moveToDlqAndDelete(message, "max_retries_exceeded", error.message);
          if (!moved.moved) {
            // No DLQ configured: drop poison message after max retries to avoid infinite loops.
            await deleteMessage(message.ReceiptHandle);
            logError({
              worker: "payment",
              event: "message_dropped_after_max_retries",
              requestId,
              orderId,
              status: "dropped",
              receiveCount,
              maxReceiveCount,
            });
          } else {
            logInfo({
              worker: "payment",
              event: "message_moved_to_dlq",
              requestId,
              orderId,
              status: "moved_to_dlq",
              receiveCount,
              maxReceiveCount,
              dlqUrl,
            });
          }
        } catch (dlqError) {
          logError({
            worker: "payment",
            event: "dlq_move_failed",
            requestId,
            orderId,
            status: "failed",
            receiveCount,
            maxReceiveCount,
            error: dlqError.message,
          });
        }
      }
      // Below max retries: keep message in queue for retry via visibility timeout.
    }
  } finally {
    inFlightMessages = Math.max(0, inFlightMessages - 1);
  }
}

async function pollOnce() {
  const response = await withTimeout(
    sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxNumberOfMessages,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: visibilityTimeout,
        MessageAttributeNames: ["All"],
        MessageSystemAttributeNames: ["ApproximateReceiveCount"],
      })
    ),
    pollTimeoutMs,
    `poll_timeout_after_${pollTimeoutMs}ms`
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
    maxReceiveCount,
    processTimeoutMs,
    pollTimeoutMs,
    shutdownGraceMs,
    dlqEnabled: Boolean(dlqUrl),
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

  logInfo({
    worker: "payment",
    event: "worker_stopped",
    requestId: null,
    orderId: null,
    status: "stopped",
  });
}

async function waitForInFlightDrain(maxWaitMs) {
  const deadline = Date.now() + maxWaitMs;
  while (inFlightMessages > 0 && Date.now() < deadline) {
    await sleep(100);
  }
  return inFlightMessages === 0;
}

// Shutdown: stop polling and wait for in-flight processing to finish before exiting.
async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    keepRunning = false;

    logInfo({
      worker: "payment",
      event: "worker_stopping",
      requestId: null,
      orderId: null,
      status: "stopping",
      signal,
      inFlightMessages,
      shutdownGraceMs,
    });

    const drained = await waitForInFlightDrain(shutdownGraceMs);
    if (!drained) {
      logError({
        worker: "payment",
        event: "worker_shutdown_drain_timeout",
        requestId: null,
        orderId: null,
        status: "timeout",
        inFlightMessages,
        shutdownGraceMs,
      });
    }

    await pool.end();
  })();

  return shutdownPromise;
}

if (require.main === module) {
  process.on("SIGINT", () =>
    shutdown("SIGINT")
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  );
  process.on("SIGTERM", () =>
    shutdown("SIGTERM")
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  );

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

module.exports = { runWorker, processOneMessage, shutdown };
