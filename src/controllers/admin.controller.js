const productService = require("../services/product.service");
const inventoryService = require("../services/inventory.service");

// POST /admin/products
async function createProduct(req, res, next) {
  try {
    const p = await productService.createProduct(req.body);
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
}

// PATCH /admin/products/:id
async function patchProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    const updated = await productService.updateProduct(id, req.body);
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

// POST /admin/inventory/restock
async function restock(req, res, next) {
  try {
    const productId = Number(req.body.productId);
    const qty = Number(req.body.qty);
    const inv = await inventoryService.restock(productId, qty);
    res.json(inv);
  } catch (e) {
    next(e);
  }
}

// GET /admin/inventory/:productId
async function getInventory(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    const inv = await inventoryService.getInventory(productId);
    res.json(inv);
  } catch (e) {
    next(e);
  }
}

module.exports = { createProduct, patchProduct, restock, getInventory };
