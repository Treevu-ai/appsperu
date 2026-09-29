import { pool } from "../apps/identidad-fiscal/api/src/db/pool.js";

const t = async (label, sql) => {
  const { rows } = await pool.query(sql);
  console.log(`${label} = ${JSON.stringify(rows[0])}`);
};

await t("tablas_public", "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'");
await t("contribuyentes", "SELECT count(*)::int n FROM contribuyentes");
await t("crosswalk", "SELECT count(*)::int n FROM entity_padron_crosswalk");
await t("migraciones", "SELECT count(*)::int n FROM schema_migrations");

await pool.end();
