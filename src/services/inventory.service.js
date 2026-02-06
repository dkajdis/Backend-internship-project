const inventoryRepo = require("../repositories/inventory.repo");
const productRepo = require("../repositories/product.repo");
const { HttpError } = require("./errors");

// GET /admin/inventory/:productId
async function getInventory(productId) {
  if (!Number.isInteger(productId)) throw new HttpError(400, "productId must be an integer");
  const inv = await inventoryRepo.getInventoryByProductId(productId);
  if (!inv) throw new HttpError(404, "Inventory not found");
  return inv;
}

// POST /admin/inventory/restock
async function restock(productId, qty) {
  if (!Number.isInteger(productId)) {
    throw new HttpError(400, "productId must be an integer");
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new HttpError(400, "qty must be an integer greater than 0");
  }

  // Confirm the existence of the goods, and then update the inventory.
  const p = await productRepo.getProductById(productId);
  if (!p) throw new HttpError(404, "Product not found");

  const updated = await inventoryRepo.restock(productId, qty);
  if (!updated) throw new HttpError(404, "Inventory not found");
  return updated;
}

module.exports = { getInventory, restock };
