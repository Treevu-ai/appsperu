import { Pool } from "pg";

/**
 * Opcionales: solo para GET /api/crossref/conflicto-uso-suelo. Si no están configuradas, ese
 * endpoint responde con `estado: "ENRIQUECIMIENTO_NO_CONFIGURADO"` sin romper el resto de la app
 * -- mismo patrón que infracciones-ambientales/emergencias-indeci.
 *
 * `ceplanGeoPool` traduce los códigos UBIGEO de `nom_dep`/`nom_pro`/`nom_dis` (ver hallazgo real
 * en docs/data-contracts/serfor-catastro-forestal.md -- NOMDEP/NOMPRO/NOMDIS son códigos UBIGEO,
 * no nombres, en 9 de las 10 capas de este conector) a nombres reales usando `territories` de
 * ceplan-geo (1,874 distritos, ubigeo único). `catastroMineroPool` trae los derechos mineros ya
 * en nombre real (INGEMMET no tiene el mismo problema).
 */
export const ceplanGeoPool = process.env.CEPLAN_GEO_DATABASE_URL
  ? new Pool({ connectionString: process.env.CEPLAN_GEO_DATABASE_URL })
  : null;

export const catastroMineroPool = process.env.CATASTRO_MINERO_DATABASE_URL
  ? new Pool({ connectionString: process.env.CATASTRO_MINERO_DATABASE_URL })
  : null;
