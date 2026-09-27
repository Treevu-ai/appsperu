import { pool } from "./src/db/pool.js";
await pool.query("DELETE FROM port_subpartida_imports");
await pool.query("DELETE FROM port_imports");
await pool.query("DELETE FROM raw_batches");
console.log("Tablas limpiadas");
await pool.end();
