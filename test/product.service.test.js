const { resetDb, closeDb } = require("./helpers/db");
const productService = require("../src/services/product.service");

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

// POST /admin/products
test("create product", async () => {
    const p = await productService.createProduct({ sku: "sku-001", name: "Product 1", price: 999.00 });
    expect(p).toHaveProperty("id");
    expect(p.sku).toBe("sku-001");
    expect(p.name).toBe("Product 1");
    expect(p.price).toBe(999.00);
});

// GET /products
test("list all products", async () => {
    const p1 = await productService.createProduct({ sku: "sku-001", name: "Product 1", price: 10.00 });
    const p2 = await productService.createProduct({ sku: "sku-002", name: "Product 2", price: 20.00 });
    const list = await productService.listProducts();
    expect(list.length).toBe(2);
    expect(list[0]).toEqual(p1);
    expect(list[1]).toEqual(p2);
});

// GET /products/:id
test("get product by id", async () => {
    const p = await productService.createProduct({ sku: "sku-001", name: "Product 1", price: 99.00 });
    const got = await productService.getProduct(p.id);
    expect(got).toEqual(p);
});

// PATCH /admin/products/:id
test("update product", async () => {
    const p = await productService.createProduct({ sku: "sku-001", name: "Product 1", price: 888.00 });
    const updated = await productService.updateProduct(p.id, { name: "Updated Product", price: 777.00 });
    expect(updated).toMatchObject({
        id: 1,
        sku: "sku-001",
        name: "Updated Product",
        price: 777.00
    });
});

// Error cases
test("createProduct rejects missing fields with 400", async () => {
  await expect(productService.createProduct({ sku: "SKU-001" }))
    .rejects.toMatchObject({ status: 400 });
});

test("getProduct throws 404 when not found", async () => {
  await expect(productService.getProduct(999)).rejects.toMatchObject({ status: 404 });
});