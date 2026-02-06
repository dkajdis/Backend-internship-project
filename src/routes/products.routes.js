const express = require("express");
const router = express.Router();
const productsController = require("../controllers/products.controller");

// GET /products
router.get("/",productsController.list);

// GET /products/:id
router.get("/:id",productsController.detail);

module.exports = router;