import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import { vigenteEnFecha } from "../lib/temporal-status.js";

export const dobleInhabilitacionRouter = Router();

const QuerySchema = z.object({
  ruc: z.string().min(1).optional().describe("Filtra a un RUC/DNI específico (el de inhabilitaciones o el de inhabilitaciones_judiciales)."),
});

/**
 * Cruce dentro de esta misma app/base — no un crosswalk fuzzy, un JOIN real:
 * ¿qué RUC/DNI tiene sanción administrativa (Tribunal de Contrataciones,
 * `inhabilitaciones`) Y orden judicial (`inhabilitaciones_judiciales`, OECE)
 * simultáneamente? Bases legales distintas (ver docs/conectores.md), así que
 * la coincidencia es una señal más fuerte que cualquiera de las dos solas —
 * pero sigue siendo solo eso, una coincidencia observada, no una conclusión.
 *
 * Join por `dni` (columna generada, solo cuando el RUC-10/ruc_dni calza ese
 * formato exacto) O por coincidencia exacta de `ruc`/`ruc_dni` completo
 * (cubre el caso RUC-20 de empresa, y cualquier ruc_dni que ya venga en
 * formato RUC completo). Nunca se cruza por nombre — mismo criterio que el
 * resto del catálogo, no se adivina identidad por similitud de texto.
 *
 * Vigencia ("vigente hoy") de AMBOS lados se calcula con `vigenteEnFecha`
 * sobre el rango real `[desde,hasta]` de cada fila -- no se confía solo en
 * el campo `estado` del lado administrativo (ese es la etiqueta que traía
 * la fuente al momento de la extracción, puede no reflejar un `desde`
 * futuro o un `hasta` ya pasado). `vigente` en la respuesta es un
 * `EstadoTemporal` (`true`/`false`/`"NO_VERIFICABLE"` si falta la fecha),
 * nunca se fuerza a boolean por ausencia de dato.
 *
 * `dniComunEnmascarado` expone solo los últimos 3 dígitos -- es un
 * identificador de cruce interno, mismo criterio que
 * `personas-sancionadas.ts`/`conformacion.ts`.
 *
 * Verificado en vivo 2026-09-21: 0 coincidencias contra las 14 filas
 * judiciales del corte 2026-09-01 (universo judicial es pequeño; el
 * endpoint reporta 0 correctamente en vez de fallar o inventar un caso).
 */
dobleInhabilitacionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;
    const { ruc } = parsed;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (ruc) {
      params.push(ruc);
      // El parámetro acepta RUC completo O DNI de 8 dígitos (documentado en
      // el querySchema) -- filtrar solo por ruc/ruc_dni descartaba un DNI
      // válido, porque el DNI de 8 dígitos nunca calza esas columnas
      // completas, solo las generadas `dni` (hallazgo de Copilot, PR #175).
      conditions.push(`(i.ruc = $${params.length} OR ij.ruc_dni = $${params.length} OR i.dni = $${params.length} OR ij.dni = $${params.length})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT
         COALESCE(ij.dni, i.dni) AS dni_comun,
         i.ruc AS ruc_administrativo,
         i.razon_social,
         i.resolucion AS resolucion_administrativa,
         i.desde AS admin_desde,
         i.hasta AS admin_hasta,
         i.estado AS admin_estado,
         ij.ruc_dni AS ruc_dni_judicial,
         ij.nombre AS nombre_judicial,
         ij.numero_resolucion AS resolucion_judicial,
         ij.fecha_inicio AS judicial_desde,
         ij.fecha_fin AS judicial_hasta
       FROM inhabilitaciones_judiciales ij
       JOIN inhabilitaciones i
         ON (ij.dni IS NOT NULL AND i.dni = ij.dni) OR i.ruc = ij.ruc_dni
       ${where}
       ORDER BY ij.fecha_inicio DESC NULLS LAST`,
      params
    );

    const hoy = new Date().toISOString().slice(0, 10);

    res.json({
      total: rows.length,
      resultados: rows.map((r) => {
        // `estado` es la etiqueta que trae la fuente al momento de la
        // extracción -- no verifica el rango real [desde,hasta]. Una fila
        // con estado="VIGENTE" pero desde futuro o hasta ya pasado quedaría
        // marcada como vigente igual si solo se mirara `estado` (hallazgo de
        // Copilot, PR #175). `vigenteEnFecha` es la fuente de verdad para
        // "vigente hoy" en ambos lados, igual que ya hace `judicial`.
        const administrativaVigente = vigenteEnFecha(hoy, r.admin_desde, r.admin_hasta);
        const judicialVigente = vigenteEnFecha(hoy, r.judicial_desde, r.judicial_hasta);
        return {
          // DNI enmascarado a los últimos 3 dígitos -- mismo criterio que
          // personas-sancionadas.ts/conformacion.ts: es un identificador de
          // cruce interno, nunca se expone completo en una respuesta pública
          // (hallazgo de Copilot, PR #175).
          dniComunEnmascarado: typeof r.dni_comun === "string" && r.dni_comun.length >= 3 ? `***${r.dni_comun.slice(-3)}` : null,
          administrativa: {
            ruc: r.ruc_administrativo,
            razonSocial: r.razon_social,
            resolucion: r.resolucion_administrativa,
            desde: r.admin_desde,
            hasta: r.admin_hasta,
            estado: r.admin_estado,
            vigente: administrativaVigente,
          },
          judicial: {
            rucDni: r.ruc_dni_judicial,
            nombre: r.nombre_judicial,
            resolucion: r.resolucion_judicial,
            desde: r.judicial_desde,
            hasta: r.judicial_hasta,
            vigente: judicialVigente,
          },
          ambasVigentesHoy: administrativaVigente === true && judicialVigente === true,
        };
      }),
      limitation:
        "Coincidencia de identificador (RUC/DNI) entre dos bases legales distintas -- administrativa (Tribunal de Contrataciones) y judicial (Poder Judicial, vía OECE). No implica que ambas sanciones tengan el mismo origen ni el mismo hecho; son procesos independientes que resultaron en el mismo RUC/DNI. Universo judicial pequeño (14 filas al corte 2026-09-01) -- 0 resultados es una respuesta esperada, no un error.",
    });
  })
);
