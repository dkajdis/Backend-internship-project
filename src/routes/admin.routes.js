const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");

// POST /admin/products
router.post("/products", adminController.createProduct);

// PATCH /admin/products/:id
router.patch("/products/:id", adminController.patchProduct);

// POST /admin/inventory/restock
router.post("/inventory/restock", adminController.restock);

// GET /admin/inventory/:productId
router.get("/inventory/:productId", adminController.getInventory);

module.exports = router;
