import { Pool } from "pg";

/** Opcional: solo para enriquecer con ubigeo vía `territory_name_crosswalk`
 * (fuente `poder-judicial`, ver `ceplan-geo/api/src/crossref/build-crosswalk.ts`).
 * Si no está configurada, la API sigue funcionando igual, solo sin `ubigeo`
 * en las filas — mismo patrón que `external-pools.ts` de radar-ejecucion. */
export const ceplanGeoPool = process.env.CEPLAN_GEO_DATABASE_URL ? new Pool({ connectionString: process.env.CEPLAN_GEO_DATABASE_URL }) : null;
