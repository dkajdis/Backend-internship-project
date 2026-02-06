const { resetDb, closeDb } = require("./helpers/db");

const productService = require("../src/services/product.service");
const inventoryService = require("../src/services/inventory.service");

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// GET /admin/inventory/:productId
test("getInventory returns 0 after product creation", async () => {
  const p = await productService.createProduct({
    sku: "SKU-001",
    name: "Apple",
    price: "19.99",
  });

  const inv = await inventoryService.getInventory(p.id);
  expect(inv).toMatchObject({ product_id: 1, available_qty: 0 });
});

// POST /admin/inventory/restock
test("restock increases available_qty cumulatively", async () => {
  const p = await productService.createProduct({
    sku: "SKU-001",
    name: "Apple",
    price: "19.99",
  });

  const inv1 = await inventoryService.restock(p.id, 5);
  expect(inv1.available_qty).toBe(5);

  const inv2 = await inventoryService.restock(p.id, 7);
  expect(inv2.available_qty).toBe(12);
});

// Edge cases
test("restock rejects invalid qty with 400", async () => {
  const p = await productService.createProduct({
    sku: "SKU-001",
    name: "Apple",
    price: "19.99",
  });

  await expect(inventoryService.restock(p.id, 0)).rejects.toMatchObject({ status: 400 });
  await expect(inventoryService.restock(p.id, -1)).rejects.toMatchObject({ status: 400 });
});

// Error cases
test("restock returns 404 for non-existing product", async () => {
  await expect(inventoryService.restock(999, 1)).rejects.toMatchObject({ status: 404 });
});
