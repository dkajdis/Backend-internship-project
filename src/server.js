require("dotenv").config();
const express = require("express");
const productsRoutes = require("./routes/products.routes");
const adminRoutes = require("./routes/admin.routes");
const cartRoutes = require("./routes/cart.routes");
const checkoutRoutes = require("./routes/checkout.routes");
const { errorMiddleware } = require("./middlewares/error.middleware");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.send("ok"));

app.use("/products", productsRoutes);
app.use("/admin", adminRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);

app.use(errorMiddleware);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
