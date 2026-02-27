const express = require("express");
const router = express.Router();
const ordersController = require("../controllers/orders.controller");

// GET /orders?userId=...
router.get("/", ordersController.listByUser);

// GET /orders/:id
router.get("/:id", ordersController.detail);

module.exports = router;
