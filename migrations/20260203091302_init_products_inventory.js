/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    //products Table
    await knex.schema.createTable("products", (table) => {
        table.bigIncrements("id").primary();
        table.text("sku").notNullable().unique();
        table.text("name").notNullable();
        table.decimal("price", 12, 2).notNullable();
  });
    //inventory Table
    await knex.schema.createTable("inventory", (table) => {
        table.bigInteger("product_id").primary();
        table
            .foreign("product_id")
            .references("id")
            .inTable("products")
            .onDelete("CASCADE");

        table.integer("available_qty").notNullable().defaultTo(0);
  });
    //Check qty
    await knex.raw(`
        ALTER TABLE inventory
        ADD CONSTRAINT inventory_available_qty_nonnegative
        CHECK (available_qty >= 0)
    `);
    // Ensure product price is non-negative at the DB level as well
    await knex.raw(`
      ALTER TABLE products
      ADD CONSTRAINT products_price_nonnegative
      CHECK (price >= 0)
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists("inventory");
  await knex.schema.dropTableIfExists("products");
};
