const mockSqsSend = jest.fn();
const mockProcessOrderPayment = jest.fn();
const mockPoolEnd = jest.fn();
const mockLogInfo = jest.fn();
const mockLogError = jest.fn();

jest.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    send(command) {
      return mockSqsSend(command);
    }
  }

  class ReceiveMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }

  class DeleteMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }

  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }

  return {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    SendMessageCommand,
  };
});

jest.mock("../src/services/payment-worker.service", () => ({
  processOrderPayment: (...args) => mockProcessOrderPayment(...args),
}));

jest.mock("../src/db/pool", () => ({
  pool: {
    end: (...args) => mockPoolEnd(...args),
  },
}));

jest.mock("../src/utils/json-logger", () => ({
  logInfo: (...args) => mockLogInfo(...args),
  logError: (...args) => mockLogError(...args),
}));

function loadWorkerModule() {
  jest.resetModules();
  return require("../src/workers/payment.worker");
}

describe("payment.worker reliability", () => {
  const oldEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_REGION = "us-east-1";
    process.env.SQS_QUEUE_URL = "https://example.com/main";
    process.env.SQS_DLQ_URL = "https://example.com/dlq";
    process.env.SQS_WORKER_MAX_RECEIVE_COUNT = "3";
    process.env.SQS_PROCESS_TIMEOUT_MS = "5000";
    process.env.SQS_POLL_TIMEOUT_MS = "5000";
    process.env.SQS_SHUTDOWN_GRACE_MS = "1000";
  });

  afterAll(() => {
    process.env = oldEnv;
  });

  test("below retry limit: failed message stays in queue for retry", async () => {
    mockProcessOrderPayment.mockRejectedValue(new Error("transient_fail"));
    const worker = loadWorkerModule();

    await worker.processOneMessage({
      Body: JSON.stringify({ orderId: 11 }),
      ReceiptHandle: "rh-11",
      MessageId: "m-11",
      Attributes: { ApproximateReceiveCount: "1" },
      MessageAttributes: {},
    });

    expect(mockProcessOrderPayment).toHaveBeenCalledWith(11);
    expect(mockSqsSend).not.toHaveBeenCalled();
  });

  test("at max retry count: failed message is moved to DLQ and deleted", async () => {
    mockProcessOrderPayment.mockRejectedValue(new Error("permanent_fail"));
    mockSqsSend.mockResolvedValue({});
    const worker = loadWorkerModule();

    await worker.processOneMessage({
      Body: JSON.stringify({ orderId: 22 }),
      ReceiptHandle: "rh-22",
      MessageId: "m-22",
      Attributes: { ApproximateReceiveCount: "3" },
      MessageAttributes: {
        requestId: { DataType: "String", StringValue: "req-22" },
      },
    });

    expect(mockProcessOrderPayment).toHaveBeenCalledWith(22);
    expect(mockSqsSend).toHaveBeenCalledTimes(2);
    expect(mockSqsSend.mock.calls[0][0].constructor.name).toBe("SendMessageCommand");
    expect(mockSqsSend.mock.calls[1][0].constructor.name).toBe("DeleteMessageCommand");
  });

  test("invalid message body is moved to DLQ without processing", async () => {
    mockSqsSend.mockResolvedValue({});
    const worker = loadWorkerModule();

    await worker.processOneMessage({
      Body: JSON.stringify({ bad: true }),
      ReceiptHandle: "rh-invalid",
      MessageId: "m-invalid",
      Attributes: { ApproximateReceiveCount: "1" },
      MessageAttributes: {},
    });

    expect(mockProcessOrderPayment).not.toHaveBeenCalled();
    expect(mockSqsSend).toHaveBeenCalledTimes(2);
    expect(mockSqsSend.mock.calls[0][0].constructor.name).toBe("SendMessageCommand");
    expect(mockSqsSend.mock.calls[1][0].constructor.name).toBe("DeleteMessageCommand");
  });

  test("shutdown closes DB pool", async () => {
    const worker = loadWorkerModule();
    await worker.shutdown("SIGTERM");
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
