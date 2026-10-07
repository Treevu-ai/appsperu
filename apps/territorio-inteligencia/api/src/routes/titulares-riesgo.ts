import { Router } from "express";
import { matchEntities } from "@appsperu/entity-matcher";
import { catastroMineroPool } from "../db/catastro-minero-pool.js";
import { sancionesPool } from "../db/sanciones-pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { TitularesRiesgoQuerySchema, type TitularesRiesgoQuery, type TitularRiesgo } from "../schema/titulares-riesgo.js";

export const titularesRiesgoRouter = Router();

/**
 * Por qué no hay cruce forestal ni RUC: ni `catastro_minero_derechos` ni
 * `catastro_forestal_titulos` tienen columna de RUC — `titular` es un NOMBRE
 * (SERFOR tampoco publica dueño del título forestal en absoluto, ver README).
 * El cruce contra sanciones (que sí tienen RUC Y razón social) solo puede
 * hacerse por nombre, con `@appsperu/entity-matcher` (match difuso,
 * "confirmada"/"candidata") — nunca por igualdad exacta de RUC.
 */

interface TitularMineroRow {
  titular: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  concesion: string | null;
  hectareas: number | string | null;
}

interface SancionRow {
  ruc: string | null;
  razon_social: string | null;
  resolucion: string | null;
  desde: string | null;
  hasta: string | null;
  estado: string | null;
  descripcion: string | null;
}

/**
 * `filtroNombre` se empuja al SQL (`titular ILIKE`) en vez de filtrarse
 * después del match difuso — sin esto, cada request cargaba las ~66.8k filas
 * de `catastro_minero_derechos` y las comparaba todas contra las sanciones
 * (O(sanciones × titulares)) incluso cuando el caller ya pedía un nombre
 * específico.
 */
async function fetchTitularesMinero(
  departamento: string | undefined,
  filtroNombre: string | undefined
): Promise<TitularMineroRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (departamento) {
    params.push(`%${departamento}%`);
    conditions.push(`departamento ILIKE $${params.length}`);
  }
  if (filtroNombre) {
    params.push(`%${filtroNombre}%`);
    conditions.push(`titular ILIKE $${params.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await catastroMineroPool.query<TitularMineroRow>(
    `SELECT titular, departamento, provincia, distrito, concesion, hectareas
     FROM catastro_minero_derechos
     ${where}`,
    params
  );
  return rows;
}

async function fetchSanciones(
  soloVigentes: boolean | undefined
): Promise<Array<SancionRow & { tipo: "inhabilitacion" | "judicial" | "multa" }>> {
  const vigenteClause = soloVigentes ? "AND estado ILIKE '%VIGENTE%'" : "";

  const [inhabs, juds, multas] = await Promise.all([
    sancionesPool.query<SancionRow>(
      `SELECT ruc, razon_social, resolucion, desde::text, hasta::text, estado,
              infraccion as descripcion
       FROM inhabilitaciones WHERE razon_social IS NOT NULL ${vigenteClause}`
    ),
    sancionesPool.query<SancionRow>(
      `SELECT ruc_dni as ruc, nombre as razon_social, numero_resolucion as resolucion,
              fecha_inicio::text as desde, fecha_fin::text as hasta,
              NULL::text as estado, organo_jurisdiccional as descripcion
       FROM inhabilitaciones_judiciales WHERE nombre IS NOT NULL`
    ),
    sancionesPool.query<SancionRow>(
      `SELECT ruc, razon_social, resolucion, desde::text, hasta::text, estado,
              infraccion as descripcion
       FROM multas WHERE razon_social IS NOT NULL ${vigenteClause}`
    ),
  ]);

  return [
    ...inhabs.rows.map((r) => ({ ...r, tipo: "inhabilitacion" as const })),
    ...juds.rows.map((r) => ({ ...r, tipo: "judicial" as const })),
    ...multas.rows.map((r) => ({ ...r, tipo: "multa" as const })),
  ];
}

export async function getTitularesConRiesgo(query: TitularesRiesgoQuery): Promise<TitularRiesgo[]> {
  const { ruc: filtroNombre, departamento, soloVigentes } = query;

  const [titulares, sanciones] = await Promise.all([
    fetchTitularesMinero(departamento, filtroNombre),
    fetchSanciones(soloVigentes),
  ]);

  // Un titular puede repetirse en varias filas (una por derecho minero) —
  // se agrega por nombre antes de matchear, si no el matcher compararía el
  // mismo nombre contra las sanciones una vez por cada derecho.
  const porTitular = new Map<string, { hectareas: number; concesiones: Set<string>; ubicacion: string | null }>();
  for (const t of titulares) {
    const key = t.titular.trim();
    const actual = porTitular.get(key) ?? { hectareas: 0, concesiones: new Set<string>(), ubicacion: null };
    actual.hectareas += t.hectareas ? Number(t.hectareas) : 0;
    if (t.concesion) actual.concesiones.add(t.concesion);
    if (!actual.ubicacion && (t.departamento || t.provincia || t.distrito)) {
      actual.ubicacion = [t.departamento, t.provincia, t.distrito].filter(Boolean).join(" - ");
    }
    porTitular.set(key, actual);
  }

  const ladoTitulares = [...porTitular.keys()].map((nombre) => ({ id: nombre, nombre }));
  const ladoSanciones = sanciones
    .filter((s) => s.razon_social)
    .map((s, idx) => ({ id: String(idx), nombre: s.razon_social!, sancion: s }));

  const matches = matchEntities(ladoTitulares, ladoSanciones);

  const riesgosPorTitular = new Map<string, TitularRiesgo["riesgos"]>();
  for (const m of matches) {
    const lista = riesgosPorTitular.get(m.a.id) ?? [];
    const s = m.b.sancion;
    lista.push({
      tipo: s.tipo,
      resolucion: s.resolucion ?? "",
      desde: s.desde,
      hasta: s.hasta,
      estado: s.estado ?? "",
      descripcion: s.descripcion ?? undefined,
      confianza: m.confidence,
    });
    riesgosPorTitular.set(m.a.id, lista);
  }

  // `filtroNombre` ya se aplicó en SQL (fetchTitularesMinero) — no se repite
  // acá, `porTitular` solo contiene titulares que ya calzaron ese filtro.
  const results: TitularRiesgo[] = [];
  for (const [nombre, riesgos] of riesgosPorTitular) {
    const info = porTitular.get(nombre)!;
    results.push({
      titular: nombre,
      tipoCatastro: "minero",
      concesiones: [...info.concesiones],
      superficie: info.hectareas || null,
      ubicacion: info.ubicacion,
      riesgos,
    });
  }

  return results;
}

titularesRiesgoRouter.get("/", asyncHandler(async (req, res) => {
  const query = parseQuery(TitularesRiesgoQuerySchema, req.query, res);
  if (!query) return;
  const results = await getTitularesConRiesgo(query);
  res.json(results);
}));
