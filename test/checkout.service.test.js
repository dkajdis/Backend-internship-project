const { resetDb, closeDb } = require("./helpers/db");

const productService = require("../src/services/product.service");
const inventoryService = require("../src/services/inventory.service");
const cartService = require("../src/services/cart.service");
jest.mock("../src/services/order-events.publisher", () => ({
  publishCheckoutSucceeded: jest.fn().mockResolvedValue({ sent: false }),
}));
const orderEventsPublisher = require("../src/services/order-events.publisher");
const checkoutService = require("../src/services/checkout.service");

// DB assertions (used to ensure no duplicate orders are created)
const { pool } = require("../src/db/pool");

beforeEach(async () => {
  jest.clearAllMocks();
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// Helper: create a product and restock inventory
async function createProductAndStock({ sku, stock }) {
  const p = await productService.createProduct({
    sku: sku || `SKU-${Date.now()}`,
    name: "TestProd",
    price: "10.00",
  });
  await inventoryService.restock(p.id, stock);
  return p;
}

test("checkout succeeds, creates order and order_items, and decreases inventory", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-001", stock: 10 });

  // Build cart (your cart service creates an open cart automatically)
  const addOut = await cartService.addItem(1, p.id, 2);
  const cartId = addOut.cart.id;

  const out = await checkoutService.checkout(1, cartId, "idem-001");

  expect(out.order).toBeTruthy();
  expect(out.order.user_id).toBe(1);
  expect(Array.isArray(out.order_items)).toBe(true);
  expect(out.order_items.length).toBe(1);
  expect(out.order_items[0]).toMatchObject({ product_id: p.id, qty: 2 });
  expect(orderEventsPublisher.publishCheckoutSucceeded).toHaveBeenCalledTimes(1);
  expect(orderEventsPublisher.publishCheckoutSucceeded).toHaveBeenCalledWith(out.order.id);

  // Inventory should be decreased from 10 to 8
  const inv = await inventoryService.getInventory(p.id);
  expect(inv.available_qty).toBe(8);
});

test("checkout rejects missing Idempotency-Key with 400", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-002", stock: 10 });
  const addOut = await cartService.addItem(1, p.id, 1);
  const cartId = addOut.cart.id;

  await expect(checkoutService.checkout(1, cartId, "")).rejects.toMatchObject({ status: 400 });
});

test("checkout returns 400 for empty cart", async () => {
  // To create an empty cart, we need repo support. If your project does not expose such a method,
  // you can remove this test. Otherwise, implement a cartRepo helper to create an open cart without items.
  //
  // For now, we assert the service-level behavior by creating a cart and then removing the item.
  const p = await createProductAndStock({ sku: "SKU-CO-003", stock: 10 });
  const addOut = await cartService.addItem(1, p.id, 1);
  const cartId = addOut.cart.id;

  await cartService.removeItem(1, p.id);

  await expect(checkoutService.checkout(1, cartId, "idem-empty")).rejects.toMatchObject({ status: 400 });
});

test("checkout returns 403 when cart does not belong to user", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-004", stock: 10 });
  const addOut = await cartService.addItem(1, p.id, 1);
  const cartId = addOut.cart.id;

  await expect(checkoutService.checkout(2, cartId, "idem-403")).rejects.toMatchObject({ status: 403 });
});

test("checkout returns 400 when insufficient stock", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-005", stock: 1 });
  const addOut = await cartService.addItem(1, p.id, 2);
  const cartId = addOut.cart.id;

  await expect(checkoutService.checkout(1, cartId, "idem-stock")).rejects.toMatchObject({ status: 400 });
});

// Idempotency test: retrying the same checkout with the same key should return the same order and not create duplicates or further decrease inventory
test("Idempotency-Key retry returns the same response and does not create duplicate orders", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-006", stock: 10 });
  const addOut = await cartService.addItem(1, p.id, 2);
  const cartId = addOut.cart.id;

  const key = "idem-retry-001";

  const first = await checkoutService.checkout(1, cartId, key);
  const firstOrderId = first.order.id;

  // Retry with the same key should return cached response (no second order, no second inventory decrement)
  const second = await checkoutService.checkout(1, cartId, key);
  expect(second.order.id).toBe(firstOrderId);
  expect(orderEventsPublisher.publishCheckoutSucceeded).toHaveBeenCalledTimes(1);

  const inv = await inventoryService.getInventory(p.id);
  expect(inv.available_qty).toBe(8);

  // Strong DB assertion: only one order exists
  const count = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders`);
  expect(count.rows[0].cnt).toBe(1);
});

// Concurrency test: simulate two concurrent checkouts for the last unit of stock. Only one should succeed, and the other should fail with a 400 due to insufficient stock. Final inventory should be 0, and only one order should be created.
test("No oversell: two concurrent checkouts for the last unit, only one succeeds", async () => {
  const p = await createProductAndStock({ sku: "SKU-CO-007", stock: 1 });

  const cartId1 = (await cartService.addItem(1, p.id, 1)).cart.id;
  const cartId2 = (await cartService.addItem(2, p.id, 1)).cart.id;

  const r1 = checkoutService.checkout(1, cartId1, "idem-conc-1");
  const r2 = checkoutService.checkout(2, cartId2, "idem-conc-2");

  const results = await Promise.allSettled([r1, r2]);

  const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const rejected = results.filter((r) => r.status === "rejected").map((r) => r.reason);

  // One must succeed
  expect(fulfilled.length).toBe(1);

  // The other should fail due to insufficient stock mapped to HttpError(400)
  expect(rejected.length).toBe(1);
  expect(rejected[0]).toMatchObject({ status: 400 });

  // Final inventory must be 0 (never negative)
  const inv = await inventoryService.getInventory(p.id);
  expect(inv.available_qty).toBe(0);

  // Only one order should exist
  const count = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders`);
  expect(count.rows[0].cnt).toBe(1);
});
