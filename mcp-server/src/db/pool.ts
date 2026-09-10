import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.MCP_API_DATABASE_URL;

if (!connectionString) {
  throw new Error("MCP_API_DATABASE_URL no está definida. Copia .env.example a .env.");
}

export const pool = new Pool({ connectionString });
