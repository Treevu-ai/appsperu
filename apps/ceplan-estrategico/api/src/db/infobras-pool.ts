import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.INFOBRAS_DATABASE_URL;

/** Pool opcional hacia la base de `infobras` — requerido para proxies departamentales SEG/Efficiency. */
export const infobrasPool = connectionString ? new Pool({ connectionString }) : null;
