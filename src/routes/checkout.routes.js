const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkout.controller");

// POST /checkout
router.post("/", checkoutController.checkout);

module.exports = router;
