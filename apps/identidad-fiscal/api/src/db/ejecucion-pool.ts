import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
      "(ver apps/radar-ejecucion/api/.env.example) — el cruce de entidades necesita leerla."
  );
}

/**
 * Tercer pool, hacia la base de `radar-ejecucion` (presupuesto MEF). Lee de
 * ahí para resolver el RUC del lado entidad (gobiernos/municipalidades)
 * contra el padrón, y escribe el registro central de cobertura territorial
 * (`territorial_coverage`) — nunca obras ni gasto.
 */
export const ejecucionPool = new Pool({ connectionString });
