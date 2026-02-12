/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // carts table
  await knex.schema.createTable("carts", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("user_id").notNullable();
    table.text("status").notNullable().defaultTo("open");
  });

  // cart_items table
  await knex.schema.createTable("cart_items", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("cart_id").notNullable();
    table.bigInteger("product_id").notNullable();
    table.integer("qty").notNullable().defaultTo(1);

    table
      .foreign("cart_id")
      .references("id")
      .inTable("carts")
      .onDelete("CASCADE");

    // Prevent deletion of products that are in any cart
    table
      .foreign("product_id")
      .references("id")
      .inTable("products")
      .onDelete("RESTRICT");

    table.unique(["cart_id", "product_id"]);
  });

  // qty must be positive
  await knex.raw(`
    ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_qty_positive
    CHECK (qty >= 1)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("cart_items");
  await knex.schema.dropTableIfExists("carts");
};
