import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5436"),
  database: process.env.DB_NAME || "ceplan_estrategico",
  user: process.env.DB_USER || "ceplan",
  password: process.env.DB_PASSWORD || "ceplan",
});
