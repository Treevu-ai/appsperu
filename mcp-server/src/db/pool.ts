import "dotenv/config";
import { Pool } from "pg";

/**
 * Pool de `pg` para el modo stdio/local (ver `neon-pool.ts` para el Worker).
 *
 * Es deliberadamente perezoso: antes este módulo lanzaba en tiempo de import si
 * faltaba `MCP_API_DATABASE_URL`, y como `auth/api-key.ts` lo importa para su
 * rama de respaldo, el Worker reventaba con Error 1101 al arrancar: la ruta de
 * Neon, que nunca usa este pool, moría igual. La excepción se sigue produciendo,
 * pero solo cuando alguien usa de verdad el pool sin la variable, que es el
 * caso local que el mensaje quiere señalar.
 */
let real: Pool | null = null;

function resolve(): Pool {
  const connectionString = process.env.MCP_API_DATABASE_URL;
  if (!connectionString) {
    throw new Error("MCP_API_DATABASE_URL no está definida. Copia .env.example a .env.");
  }
  real ??= new Pool({ connectionString });
  return real;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const value = resolve()[prop as keyof Pool];
    return typeof value === "function" ? value.bind(resolve()) : value;
  },
});
