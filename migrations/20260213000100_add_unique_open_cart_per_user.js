/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS carts_one_open_cart_per_user_idx
    ON carts (user_id)
    WHERE status = 'open'
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS carts_one_open_cart_per_user_idx
  `);
};
