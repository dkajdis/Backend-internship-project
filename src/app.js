const express = require("express");
const authRoutes = require("./routes/auth.routes");
const productsRoutes = require("./routes/products.routes");
const adminRoutes = require("./routes/admin.routes");
const cartRoutes = require("./routes/cart.routes");
const checkoutRoutes = require("./routes/checkout.routes");
const ordersRoutes = require("./routes/orders.routes");
const { errorMiddleware } = require("./middlewares/error.middleware");
const { requireAuth, requireRole } = require("./middlewares/auth.middleware");
const systemController = require("./controllers/system.controller");
const { requestIdMiddleware } = require("./middlewares/request-id.middleware");
const { requestLogMiddleware } = require("./middlewares/request-log.middleware");

function createApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(requestLogMiddleware);

  app.get("/health", systemController.health);
  app.get("/ready", systemController.ready);

  app.use("/auth", authRoutes);
  app.use("/products", productsRoutes);
  app.use("/admin", requireAuth, requireRole("admin"), adminRoutes);
  app.use("/cart", cartRoutes);
  app.use("/checkout", checkoutRoutes);
  app.use("/orders", ordersRoutes);

  app.use(errorMiddleware);
  return app;
}

module.exports = { createApp };
