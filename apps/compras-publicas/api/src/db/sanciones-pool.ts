import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.SRC_PROVEEDORES_SANCIONADOS_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SRC_PROVEEDORES_SANCIONADOS_DATABASE_URL no está definida. Apunta a la base " +
      "de proveedores-sancionados (ver apps/proveedores-sancionados/api/.env.example) " +
      "-- el IIC necesita leerla para cruzar inhabilitaciones."
  );
}

/**
 * Segundo pool, hacia la base de `proveedores_sancionados` (OSCE). Solo lectura
 * -- el IIC escribe únicamente en compras_publicas.indice_integridad_contrataciones.
 */
export const sancionesPool = new Pool({ connectionString });

sancionesPool.on("error", (err) => {
  console.error("Error inesperado en conexión idle del pool (sanciones):", err.message);
});
