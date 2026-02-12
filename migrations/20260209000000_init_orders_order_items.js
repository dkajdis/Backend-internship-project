/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // orders table
  await knex.schema.createTable("orders", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("user_id").notNullable();
    table.text("status").notNullable().defaultTo("pending");
    table.decimal("total_price", 10, 2).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  // order_items table
  await knex.schema.createTable("order_items", (table) => {
    table.bigIncrements("id").primary();
    table.bigInteger("order_id").notNullable();
    table.bigInteger("product_id").notNullable();
    table.integer("qty").notNullable();
    table.decimal("price", 10, 2).notNullable();

    table
      .foreign("order_id")
      .references("id")
      .inTable("orders")
      .onDelete("CASCADE");

    table
      .foreign("product_id")
      .references("id")
      .inTable("products")
      .onDelete("RESTRICT");
  });

  // qty must be positive
  await knex.raw(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_qty_positive
    CHECK (qty >= 1)
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("order_items");
  await knex.schema.dropTableIfExists("orders");
};
