const { resetDb, closeDb } = require("./helpers/db");

const productService = require("../src/services/product.service");
const inventoryService = require("../src/services/inventory.service");
const cartService = require("../src/services/cart.service");
const { pool } = require("../src/db/pool");

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// Helper: create a product and restock inventory (inventory is not strictly required for cart add/remove,
// but it keeps test data consistent with real flows).
async function createProductAndStock({
  sku = "SKU-001",
  name = "Apple",
  price = "19.99",
  stock = 10,
} = {}) {
  const p = await productService.createProduct({ sku, name, price });
  await inventoryService.restock(p.id, stock);
  return p;
}

test("addItem creates an open cart if none exists and adds item", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-001" });

  const out = await cartService.addItem(1, p.id, 2);

  expect(out.cart).toMatchObject({ user_id: 1, status: "open" });
  expect(out.item).toMatchObject({ cart_id: out.cart.id, product_id: p.id, qty: 2 });
});

test("addItem accumulates qty when adding the same product again (addOrUpdateCartItem behavior)", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-002" });

  const out1 = await cartService.addItem(1, p.id, 2);
  expect(out1.item.qty).toBe(2);

  const out2 = await cartService.addItem(1, p.id, 3);
  // Your repo method name suggests it updates existing row; most implementations accumulate.
  // If yours overwrites instead, change expected to 3.
  expect(out2.item.qty).toBe(5);
});

test("removeItem removes item from the user's open cart", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-003" });

  await cartService.addItem(1, p.id, 2);

  const removed = await cartService.removeItem(1, p.id);

  // `removeItem` returns the removed row (based on your service)
  expect(removed).toMatchObject({ product_id: p.id });
});

test("addItem rejects invalid params with 400", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-004" });

  await expect(cartService.addItem(0, p.id, 1)).rejects.toMatchObject({ status: 400 });
  await expect(cartService.addItem(1, 0, 1)).rejects.toMatchObject({ status: 400 });
  await expect(cartService.addItem(1, p.id, 0)).rejects.toMatchObject({ status: 400 });
  await expect(cartService.addItem(1, p.id, -1)).rejects.toMatchObject({ status: 400 });
});

test("addItem returns 404 for non-existing product", async () => {
  await expect(cartService.addItem(1, 999, 1)).rejects.toMatchObject({ status: 404 });
});

test("removeItem returns 404 when user has no open cart", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-005" });

  await expect(cartService.removeItem(1, p.id)).rejects.toMatchObject({ status: 404 });
});

test("removeItem returns 404 when cart item does not exist", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-006" });

  // Create the open cart with a different product first
  const p2 = await createProductAndStock({ sku: "SKU-C-007" });
  await cartService.addItem(1, p2.id, 1);

  await expect(cartService.removeItem(1, p.id)).rejects.toMatchObject({ status: 404 });
});

test("concurrent addItem keeps a single open cart per user", async () => {
  const p = await createProductAndStock({ sku: "SKU-C-008" });

  const requests = Array.from({ length: 20 }, () => cartService.addItem(1, p.id, 1));
  await Promise.all(requests);

  const { rows } = await pool.query(
    "SELECT id FROM carts WHERE user_id = $1 AND status = 'open'",
    [1]
  );

  expect(rows).toHaveLength(1);
});
