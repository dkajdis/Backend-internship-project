const cartRepo = require("../repositories/cart.repo");
const productRepo = require("../repositories/product.repo");
const { HttpError } = require("./errors");

async function addItem(userId, productId, qty) {
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, "userId must be a positive integer");
  if (!Number.isInteger(productId) || productId <= 0) throw new HttpError(400, "productId must be a positive integer");
  if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, "qty must be an integer greater than 0");

  const product = await productRepo.getProductById(productId);
  if (!product) throw new HttpError(404, "Product not found");

  const cart = await cartRepo.findOrCreateOpenCart(userId);
  const item = await cartRepo.addOrUpdateCartItem(cart.id, productId, qty);
  return { cart, item };
}

async function removeItem(userId, productId) {
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, "userId must be a positive integer");
  if (!Number.isInteger(productId) || productId <= 0) throw new HttpError(400, "productId must be a positive integer");

  const cart = await cartRepo.findOpenCartByUserId(userId);
  if (!cart) throw new HttpError(404, "Cart not found");

  const removed = await cartRepo.removeCartItem(cart.id, productId);
  if (!removed) throw new HttpError(404, "Cart item not found");
  return removed;
}

module.exports = { addItem, removeItem };
