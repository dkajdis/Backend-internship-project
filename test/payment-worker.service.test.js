jest.mock("../src/repositories/order.repo", () => ({
  getOrderByIdForUpdate: jest.fn(),
  getOrderItems: jest.fn(),
  updateOrderStatus: jest.fn(),
}));

jest.mock("../src/repositories/inventory.repo", () => ({
  restoreInventoryForItems: jest.fn(),
}));

jest.mock("../src/db/pool", () => ({
  pool: {
    connect: jest.fn(),
  },
}));

const orderRepo = require("../src/repositories/order.repo");
const inventoryRepo = require("../src/repositories/inventory.repo");
const { pool } = require("../src/db/pool");
const { processOrderPayment, pickPaymentResult } = require("../src/services/payment-worker.service");

describe("payment-worker.service", () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    pool.connect.mockResolvedValue(client);
    jest.clearAllMocks();
  });

  test("returns order_not_found when order does not exist", async () => {
    orderRepo.getOrderByIdForUpdate.mockResolvedValue(null);

    const out = await processOrderPayment(1, () => true);

    expect(out).toMatchObject({ processed: false, reason: "order_not_found", orderId: 1 });
    expect(orderRepo.getOrderItems).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  test("skips when order status is not pending", async () => {
    orderRepo.getOrderByIdForUpdate.mockResolvedValue({ id: 2, status: "CONFIRMED" });

    const out = await processOrderPayment(2, () => true);

    expect(out).toMatchObject({
      processed: false,
      reason: "order_not_pending",
      orderId: 2,
      currentStatus: "CONFIRMED",
    });
    expect(orderRepo.getOrderItems).not.toHaveBeenCalled();
  });

  test("on payment success, updates order status to CONFIRMED", async () => {
    orderRepo.getOrderByIdForUpdate.mockResolvedValue({ id: 3, status: "pending" });
    orderRepo.getOrderItems.mockResolvedValue([{ product_id: 11, qty: 2, price: 10 }]);
    orderRepo.updateOrderStatus.mockResolvedValue({ id: 3, status: "CONFIRMED" });

    const out = await processOrderPayment(3, () => true);

    expect(inventoryRepo.restoreInventoryForItems).not.toHaveBeenCalled();
    expect(orderRepo.updateOrderStatus).toHaveBeenCalledWith(3, "CONFIRMED", client);
    expect(out).toMatchObject({ processed: true, paymentResult: "success", orderStatus: "CONFIRMED" });
  });

  test("on payment failure, restores inventory and marks order CANCELLED", async () => {
    const items = [{ product_id: 12, qty: 1, price: 10 }];
    orderRepo.getOrderByIdForUpdate.mockResolvedValue({ id: 4, status: "pending" });
    orderRepo.getOrderItems.mockResolvedValue(items);
    orderRepo.updateOrderStatus.mockResolvedValue({ id: 4, status: "CANCELLED" });

    const out = await processOrderPayment(4, () => false);

    expect(inventoryRepo.restoreInventoryForItems).toHaveBeenCalledWith(items, client);
    expect(orderRepo.updateOrderStatus).toHaveBeenCalledWith(4, "CANCELLED", client);
    expect(out).toMatchObject({
      processed: true,
      paymentResult: "fail",
      orderStatus: "CANCELLED",
      restoredInventoryItems: 1,
    });
  });

  test("rolls back transaction when processing throws", async () => {
    orderRepo.getOrderByIdForUpdate.mockResolvedValue({ id: 5, status: "pending" });
    orderRepo.getOrderItems.mockRejectedValue(new Error("db_error"));

    await expect(processOrderPayment(5, () => true)).rejects.toThrow("db_error");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("rule_based payment mode: even success, odd fail", () => {
    const oldMode = process.env.PAYMENT_SIMULATION_MODE;
    process.env.PAYMENT_SIMULATION_MODE = "rule_based";
    expect(pickPaymentResult(100)).toBe(true);
    expect(pickPaymentResult(101)).toBe(false);
    process.env.PAYMENT_SIMULATION_MODE = oldMode;
  });
});
