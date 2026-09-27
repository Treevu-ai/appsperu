import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.EJECUCION_DATABASE_URL;

/**
 * Segundo pool, hacia la base de `radar-ejecucion` (presupuesto MEF). No hay
 * FK real entre las dos bases: lee para el cruce con la función de gasto
 * ORDEN PUBLICO Y SEGURIDAD, y escribe el registro central de cobertura
 * territorial (`territorial_coverage`) — nunca denuncias ni gasto.
 *
 * Es `null` cuando `EJECUCION_DATABASE_URL` no está definida, siguiendo el mismo
 * patrón que `proveedores-sancionados/src/db/seguridad-pool.ts`. Antes este
 * módulo lanzaba en el import, lo que tumbaba cualquier proceso que importara
 * `app.ts` —incluidos los tests de esta app— en cuanto faltaba esa variable.
 * Ahora el cruce responde 503 con un mensaje explícito: es preferible decir
 * "no puedo responder" a devolver ceros que el agente leería como "el Estado no
 * gastó nada en orden público".
 */
export const ejecucionPool = connectionString ? new Pool({ connectionString }) : null;

export const EJECUCION_NO_CONFIGURADA =
  "EJECUCION_DATABASE_URL no está definida. Apunta a la base de radar-ejecucion " +
  "(ver apps/radar-ejecucion/api/.env.example) — el cruce con la función ORDEN PUBLICO Y " +
  "SEGURIDAD y el registro de cobertura territorial necesitan escribir/leer ahí.";
