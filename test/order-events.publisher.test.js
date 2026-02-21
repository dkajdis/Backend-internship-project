const {
  publishCheckoutSucceeded,
  setSqsClientForTest,
} = require("../src/services/order-events.publisher");

describe("order-events.publisher", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.SQS_QUEUE_URL = "https://example.com/queue";
    process.env.SQS_SEND_MAX_RETRIES = "2";
    process.env.SQS_SEND_RETRY_DELAY_MS = "0";
  });

  afterEach(() => {
    setSqsClientForTest(null);
    process.env = { ...originalEnv };
  });

  test("returns no-op when queue url is missing", async () => {
    delete process.env.SQS_QUEUE_URL;
    const out = await publishCheckoutSucceeded(101);
    expect(out).toMatchObject({ sent: false, reason: "missing_queue_url" });
  });

  test("retries and eventually succeeds", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValueOnce({ MessageId: "m-1" });
    setSqsClientForTest({ send }); // Use FakeClient with our mock send method.

    const out = await publishCheckoutSucceeded(202);

    expect(out).toMatchObject({ sent: true, attempts: 3 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].input).toMatchObject({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ orderId: 202 }),
    });
  });

  test("throws after retries are exhausted", async () => {
    const send = jest.fn().mockRejectedValue(new Error("still failing"));
    setSqsClientForTest({ send });

    await expect(publishCheckoutSucceeded(303)).rejects.toThrow("still failing");
    expect(send).toHaveBeenCalledTimes(3);
  });
});
