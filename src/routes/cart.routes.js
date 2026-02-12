const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cart.controller");

// POST /cart/items
router.post("/items", cartController.addItem);

// DELETE /cart/items/:productId
router.delete("/items/:productId", cartController.removeItem);

module.exports = router;
