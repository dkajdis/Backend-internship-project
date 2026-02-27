const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

let sqsClient = null;

function getClient() {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return sqsClient;
}

function setSqsClientForTest(client) {
  sqsClient = client;
}

function toNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return fallback;
  return n;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishCheckoutSucceeded(orderId, options = {}) {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) return { sent: false, reason: "missing_queue_url" };
  const maxRetries = toNonNegativeInt(process.env.SQS_SEND_MAX_RETRIES, 2);
  const retryDelayMs = toNonNegativeInt(process.env.SQS_SEND_RETRY_DELAY_MS, 100);

  const payload = { orderId };
  const messageAttributes = options.requestId
    ? {
        requestId: {
          DataType: "String",
          StringValue: String(options.requestId),
        },
      }
    : undefined;
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
    MessageAttributes: messageAttributes,
  });

  let attempt = 0;
  while (true) {
    try {
      await getClient().send(command);
      return { sent: true, attempts: attempt + 1 };
    } catch (error) { // Transient errors from SQS can be retried.
      if (attempt >= maxRetries) throw error;
      attempt += 1;
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }
}

module.exports = {
  publishCheckoutSucceeded,
  setSqsClientForTest,
};
