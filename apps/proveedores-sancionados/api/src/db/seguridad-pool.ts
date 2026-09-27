import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SEGURIDAD_DATABASE_URL;
export const seguridadPool = connectionString ? new Pool({ connectionString }) : null;
