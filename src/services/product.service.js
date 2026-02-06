const productRepo = require("../repositories/product.repo");
const inventoryRepo = require("../repositories/inventory.repo");
const { HttpError } = require("./errors");

// GET /products
async function listProducts() {
  return productRepo.listProducts();
}

// GET /products/:id
async function getProduct(id) {
  if (!Number.isInteger(id)) throw new HttpError(400, "id must be an integer");
  const p = await productRepo.getProductById(id);
  if (!p) throw new HttpError(404, "Product not found");
  return p;
}

// POST /admin/products
async function createProduct(input) {
  const { sku, name, price } = input || {};
  if (!sku || !name || price == null) throw new HttpError(400, "sku, name, price are required");

  // Validate price is a finite number and non-negative
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    throw new HttpError(400, "price must be a non-negative number");
  }

  // Let the repository throw unique constraint errors; the controller
  // could translate them centrally. Do not swallow the error here.
  const product = await productRepo.createProduct({ sku, name, price: priceNum });

  // Ensure an inventory row exists (one-to-one)
  await inventoryRepo.createInventoryRow(product.id);

  return product;
}

// PATCH /admin/products/:id
async function updateProduct(id, input) {
  if (!Number.isInteger(id)) throw new HttpError(400, "id must be an integer");

  const patch = {};
  if (input && input.sku != null) patch.sku = input.sku;
  if (input && input.name != null) patch.name = input.name;
  if (input && input.price != null) patch.price = input.price;

  if (Object.keys(patch).length === 0) throw new HttpError(400, "No fields to update");

  // If price is being updated, validate it
  if (patch.price != null) {
    const priceNum = Number(patch.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new HttpError(400, "price must be a non-negative number");
    }
    patch.price = priceNum;
  }

  const updated = await productRepo.updateProductById(id, patch);
  if (!updated) throw new HttpError(404, "Product not found");
  return updated;
}

module.exports = { listProducts, getProduct, createProduct, updateProduct };
