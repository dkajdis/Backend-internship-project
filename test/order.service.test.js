jest.mock("../src/repositories/order.repo", () => ({
  getOrderWithItemsById: jest.fn(),
  listOrdersByUserId: jest.fn(),
}));

const orderRepo = require("../src/repositories/order.repo");
const orderService = require("../src/services/order.service");

describe("order.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getOrder returns order when found", async () => {
    const mocked = { id: 1, user_id: 10, status: "pending", items: [] };
    orderRepo.getOrderWithItemsById.mockResolvedValue(mocked);

    const out = await orderService.getOrder(1);

    expect(out).toEqual(mocked);
    expect(orderRepo.getOrderWithItemsById).toHaveBeenCalledWith(1);
  });

  test("getOrder throws 400 for invalid id", async () => {
    await expect(orderService.getOrder(0)).rejects.toMatchObject({ status: 400 });
    await expect(orderService.getOrder(-1)).rejects.toMatchObject({ status: 400 });
    await expect(orderService.getOrder(NaN)).rejects.toMatchObject({ status: 400 });
  });

  test("getOrder throws 404 when order is missing", async () => {
    orderRepo.getOrderWithItemsById.mockResolvedValue(null);
    await expect(orderService.getOrder(99)).rejects.toMatchObject({ status: 404 });
  });

  test("listOrdersByUser returns rows", async () => {
    const rows = [{ id: 2, user_id: 10, status: "CONFIRMED" }];
    orderRepo.listOrdersByUserId.mockResolvedValue(rows);

    const out = await orderService.listOrdersByUser(10);

    expect(out).toEqual(rows);
    expect(orderRepo.listOrdersByUserId).toHaveBeenCalledWith(10);
  });

  test("listOrdersByUser throws 400 for invalid userId", async () => {
    await expect(orderService.listOrdersByUser(0)).rejects.toMatchObject({ status: 400 });
    await expect(orderService.listOrdersByUser(-3)).rejects.toMatchObject({ status: 400 });
    await expect(orderService.listOrdersByUser(NaN)).rejects.toMatchObject({ status: 400 });
  });
});
