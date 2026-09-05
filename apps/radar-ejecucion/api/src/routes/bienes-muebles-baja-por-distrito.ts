import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { identidadFiscalPool, ceplanGeoPool } from "../db/external-pools.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const bienesMueblesBajaPorDistritoRouter = Router();

const QuerySchema = z.object({
  departamento: z.string().min(1).optional(),
  ejercicio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
});

/**
 * Bajas patrimoniales por distrito, solo para municipalidades
 * (`nom_entidad ILIKE 'MUNICIPALIDAD%'`). El resto del universo de
 * `bienes_muebles_baja` (ministerios, gobiernos regionales, UGEL, empresas
 * de agua/luz, etc. — 221 de 337 entidades reales) queda fuera: su RUC
 * resuelve al ubigeo de su domicilio fiscal (típicamente su sede en Lima),
 * no al lugar donde se usó físicamente el bien — atribuirles un distrito
 * sería un dato falso. Para una municipalidad, el domicilio fiscal SÍ es
 * una aproximación razonable a su distrito, que es la única categoría
 * donde este proxy tiene sentido.
 *
 * Cruce en tres bases, resuelto en vivo (mismo patrón que `sectors.ts`/
 * `care-services.ts` en esta app, sin persistir el cruce):
 *   bienes_muebles_baja.ruc_entidad (propia)
 *     -> identidad-fiscal.contribuyentes.ruc -> ubigeo (padrón SUNAT)
 *     -> ceplan-geo.territories.ubigeo -> departamento/provincia/distrito
 *
 * Verificado en vivo (2026-09-05): las 116 municipalidades reales del
 * dataset resuelven 116/116 contra `contribuyentes` y 116/116 contra
 * `territories` de ceplan-geo. `radar-ejecucion.territories` propia NO
 * sirve para este cruce — solo cubre 9/116 (poblada oportunistamente por
 * la ingesta MEF, no es un catálogo nacional de ubigeo). Descartado
 * también `compras-publicas.municipalities.ruc` como llave: está NULL en
 * el 100% de las filas reales.
 */
bienesMueblesBajaPorDistritoRouter.get("/", asyncHandler(async (req, res) => {
  const parsed = parseQuery(QuerySchema, req.query, res);
  if (!parsed) return;
  const { departamento, ejercicio } = parsed;

  if (!identidadFiscalPool || !ceplanGeoPool) {
    res.json({ estado: "ENRIQUECIMIENTO_NO_CONFIGURADO", resultados: [] });
    return;
  }

  const conditions: string[] = ["nom_entidad ILIKE 'MUNICIPALIDAD%'"];
  const params: unknown[] = [];
  if (ejercicio) {
    params.push(Number(ejercicio));
    conditions.push(`ejercicio = $${params.length}`);
  }

  const { rows: bajaRows } = await pool.query(
    `SELECT ruc_entidad, ejercicio, codigo_patrimonial
     FROM bienes_muebles_baja
     WHERE ${conditions.join(" AND ")}`,
    params
  );

  if (bajaRows.length === 0) {
    res.json({ estado: "OK", resultados: [], limitation: LIMITATION });
    return;
  }

  const rucs = [...new Set(bajaRows.map((r) => r.ruc_entidad))];
  const { rows: contribuyentes } = await identidadFiscalPool.query(
    `SELECT ruc, ubigeo FROM contribuyentes WHERE ruc = ANY($1) AND ubigeo IS NOT NULL AND ubigeo <> '-'`,
    [rucs]
  );
  const ubigeoByRuc = new Map(contribuyentes.map((r) => [r.ruc, r.ubigeo]));

  const ubigeos = [...new Set(contribuyentes.map((r) => r.ubigeo))];
  const { rows: territories } = ubigeos.length > 0
    ? await ceplanGeoPool.query(
        `SELECT ubigeo, departamento, provincia, distrito FROM territories WHERE ubigeo = ANY($1)`,
        [ubigeos]
      )
    : { rows: [] as { ubigeo: string; departamento: string; provincia: string | null; distrito: string | null }[] };
  const territoryByUbigeo = new Map(territories.map((r) => [r.ubigeo, r]));

  type Bucket = { departamento: string; provincia: string | null; distrito: string | null; bajasCount: number; entidades: Set<string>; ejercicios: Set<number> };
  const buckets = new Map<string, Bucket>();

  for (const row of bajaRows) {
    const ubigeo = ubigeoByRuc.get(row.ruc_entidad);
    if (!ubigeo) continue;
    const territory = territoryByUbigeo.get(ubigeo);
    if (!territory) continue;
    if (departamento && territory.departamento.toUpperCase() !== departamento.toUpperCase()) continue;

    const key = `${territory.departamento}::${territory.provincia}::${territory.distrito}`;
    const bucket = buckets.get(key) ?? {
      departamento: territory.departamento,
      provincia: territory.provincia,
      distrito: territory.distrito,
      bajasCount: 0,
      entidades: new Set<string>(),
      ejercicios: new Set<number>(),
    };
    bucket.bajasCount += 1;
    bucket.entidades.add(row.ruc_entidad);
    bucket.ejercicios.add(Number(row.ejercicio));
    buckets.set(key, bucket);
  }

  res.json({
    estado: "OK",
    resultados: [...buckets.values()]
      .map((b) => ({
        departamento: b.departamento,
        provincia: b.provincia,
        distrito: b.distrito,
        bajasCount: b.bajasCount,
        municipalidadesCount: b.entidades.size,
        ejercicios: [...b.ejercicios].sort((a, b) => a - b),
      }))
      .sort((a, b) => b.bajasCount - a.bajasCount),
    limitation: LIMITATION,
  });
}));

const LIMITATION =
  "El distrito se infiere del domicilio fiscal del RUC de la municipalidad (padrón SUNAT), no del lugar físico donde se dio de baja el bien — asunción razonable solo para municipalidades, no para el resto del universo de bienes_muebles_baja (ministerios, gobiernos regionales, etc.), que se excluye de este endpoint.";
