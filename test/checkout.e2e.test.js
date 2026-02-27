const request = require("supertest");
const { resetDb, closeDb } = require("./helpers/db");
const { pool } = require("../src/db/pool");
const { createApp } = require("../src/app");

const app = createApp();

describe("checkout API e2e", () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
    process.env.DEMO_ADMIN_PASSWORD = "admin123";
    process.env.DEMO_USER_PASSWORD = "user123";
    // Keep integration tests self-contained without requiring live SQS.
    process.env.SQS_QUEUE_URL = "";

    await resetDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  test("checkout flow: login -> create product -> restock -> add cart -> checkout -> query order", async () => {
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ username: "admin", password: "admin123" });
    expect(loginRes.status).toBe(200);
    const adminToken = loginRes.body.accessToken;
    expect(adminToken).toBeTruthy();

    const createRes = await request(app)
      .post("/admin/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        sku: `SKU-E2E-${Date.now()}`,
        name: "E2E Product",
        price: "19.99",
      });
    expect(createRes.status).toBe(201);
    const productId = createRes.body.id;
    expect(Number.isInteger(productId)).toBe(true);

    const restockRes = await request(app)
      .post("/admin/inventory/restock")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ productId, qty: 5 });
    expect(restockRes.status).toBe(200);
    expect(restockRes.body).toMatchObject({ product_id: productId, available_qty: 5 });

    const addCartRes = await request(app)
      .post("/cart/items")
      .send({ userId: 1, productId, qty: 2 });
    expect(addCartRes.status).toBe(201);
    const cartId = addCartRes.body.cart.id;
    expect(Number.isInteger(cartId)).toBe(true);

    const idemKey = `idem-e2e-${Date.now()}`;
    const checkoutRes = await request(app)
      .post("/checkout")
      .set("Idempotency-Key", idemKey)
      .send({ userId: 1, cartId });
    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.order).toBeTruthy();
    expect(checkoutRes.body.order.status.toLowerCase()).toBe("pending");
    const orderId = checkoutRes.body.order.id;

    const checkoutRetryRes = await request(app)
      .post("/checkout")
      .set("Idempotency-Key", idemKey)
      .send({ userId: 1, cartId });
    expect(checkoutRetryRes.status).toBe(201);
    expect(checkoutRetryRes.body.order.id).toBe(orderId);

    const orderDetailRes = await request(app).get(`/orders/${orderId}`);
    expect(orderDetailRes.status).toBe(200);
    expect(orderDetailRes.body).toMatchObject({
      id: orderId,
      user_id: 1,
    });
    expect(Array.isArray(orderDetailRes.body.items)).toBe(true);
    expect(orderDetailRes.body.items.length).toBe(1);
    expect(orderDetailRes.body.items[0]).toMatchObject({
      order_id: orderId,
      product_id: productId,
      qty: 2,
    });

    const listByUserRes = await request(app).get("/orders").query({ userId: 1 });
    expect(listByUserRes.status).toBe(200);
    expect(Array.isArray(listByUserRes.body)).toBe(true);
    expect(listByUserRes.body.length).toBe(1);
    expect(listByUserRes.body[0].id).toBe(orderId);

    const inventoryRes = await request(app)
      .get(`/admin/inventory/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(inventoryRes.status).toBe(200);
    expect(inventoryRes.body).toMatchObject({ product_id: productId, available_qty: 3 });

    const orderCount = await pool.query(`SELECT COUNT(*)::int AS cnt FROM orders WHERE user_id = 1`);
    expect(orderCount.rows[0].cnt).toBe(1);
  });
});
