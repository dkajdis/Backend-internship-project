const productService = require("../services/product.service");

// GET /products
async function list(req, res, next) {
  try {
    const rows = await productService.listProducts();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

// GET /products/:id
async function detail(req, res, next) {
  try {
    const id = Number(req.params.id);
    const row = await productService.getProduct(id);
    res.json(row);
  } catch (e) {
    next(e);
  }
}

module.exports = { list, detail };
