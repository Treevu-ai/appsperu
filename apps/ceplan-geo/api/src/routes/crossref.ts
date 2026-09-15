import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";
import {
  fetchEjecucionByUbigeo,
  fetchInfobrasObras,
  fetchInversiones,
  type DependencyStatus,
} from "../lib/api-clients.js";
import { lookupTerritoryByNames, getTerritoryByUbigeo } from "../crossref/territory-lookup.js";
import { findNearbyInfrastructure } from "../crossref/nearby-infrastructure.js";
import { crossrefEnvelope, enrichWithTerritory } from "../crossref/enrich.js";

export const crossrefRouter = Router();

const DepartamentoQuerySchema = z.object({
  departamento: z.string().min(1).optional(),
});

const UbigeoQuerySchema = z.object({
  ubigeo: z.string().regex(/^\d{6}$/),
});

/**
 * Salud del caché de `territory_name_crosswalk` (PV-audit, 2026-09-13). A
 * diferencia de `entity_crosswalk` en infobras/compras-publicas, esta tabla
 * vacía NO rompe `GET /crossref/obras` — cada fila sin caché recalcula el
 * match en vivo (`lookupTerritoryByNames`). Aun así, sin este endpoint nadie
 * podía saber si el caché estaba frío sin leer el código fuente: se
 * encontró en 0 filas para todos los departamentos el 2026-09-13 (nunca se
 * había corrido `npm run crossref:build`), mismo patrón que ya se había
 * visto en `sector_entity_registry` (radar-ejecucion) y en el propio
 * `entity_crosswalk` de esta app hermana antes de su primera corrida.
 */
crossrefRouter.get(
  "/salud",
  asyncHandler(async (_req, res) => {
    // Mismo filtro que ya usa GET /crossref/obras (línea de abajo): la tabla
    // tiene una UNIQUE (departamento, provincia, distrito, source) pensada
    // para más de una fuente. Hoy solo existe 'infobras', pero sin este
    // filtro una segunda fuente futura mezclaría sus conteos aquí mientras
    // que /obras seguiría reportando solo lo suyo — /salud dejaría de medir
    // lo que /obras realmente usa.
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS filas,
              COUNT(*) FILTER (WHERE match_status = 'confirmada') AS confirmadas,
              COUNT(*) FILTER (WHERE match_status = 'candidata') AS candidatas,
              COUNT(*) FILTER (WHERE match_status = 'sin_match') AS sin_match,
              COUNT(DISTINCT departamento) AS departamentos_construidos,
              MAX(updated_at) AS ultima_construccion
       FROM territory_name_crosswalk
       WHERE source = 'infobras'`
    );
    const filas = Number(rows[0].filas);
    res.json({
      filas,
      confirmadas: Number(rows[0].confirmadas),
      candidatas: Number(rows[0].candidatas),
      sinMatch: Number(rows[0].sin_match),
      departamentosConstruidos: Number(rows[0].departamentos_construidos),
      ultimaConstruccion: rows[0].ultima_construccion,
      estado: filas === 0 ? "VACIO" : "OK",
      limitation: "Un departamento ausente de este caché no significa que sus obras no tengan match territorial: GET /crossref/obras recalcula en vivo para cualquier tríada sin entrada aquí. Este endpoint solo mide qué tan caliente está el caché, no la cobertura real del cruce.",
    });
  })
);

function dependencyError(dep: DependencyStatus) {
  return crossrefEnvelope({
    matcher: "dependencia_externa",
    cobertura: "BLOQUEADA",
    restriccion: "La app origen no respondió; no se puede completar el cruce.",
    dependencias: [dep],
    resultados: [],
  });
}

crossrefRouter.get(
  "/inversiones",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(DepartamentoQuerySchema, req.query, res);
    if (!parsed) return;
    const departamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

    let inversiones;
    let dependency: DependencyStatus;
    try {
      ({ inversiones, dependency } = await fetchInversiones(departamento));
    } catch (error) {
      const dep = (error as { dependency?: DependencyStatus }).dependency;
      if (dep) {
        res.status(502).json(dependencyError(dep));
        return;
      }
      throw error;
    }

    const resultados = [];
    for (const inversion of inversiones) {
      const { territory, matchStatus } = await lookupTerritoryByNames(
        inversion.departamento,
        inversion.provincia,
        inversion.distrito
      );
      const nearbyInfrastructure = territory
        ? await findNearbyInfrastructure(territory.ubigeo, 50)
        : [];

      resultados.push(
        enrichWithTerritory({
          territory,
          matchStatus,
          nearbyInfrastructure,
          payload: {
            inversion: {
              cui: inversion.cui,
              nombre: inversion.nombre,
              departamento: inversion.departamento,
              provincia: inversion.provincia,
              distrito: inversion.distrito,
              montoViable: inversion.montoViable,
              costoActualizado: inversion.costoActualizado,
              estado: inversion.estado,
              fuente: inversion.fuente,
            },
          },
        })
      );
    }

    res.json(
      crossrefEnvelope({
        matcher: "territorio_nombre",
        cobertura: inversiones.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
        restriccion:
          "La API de radar-inversiones no expone UBIGEO; el territorio se resuelve por departamento/provincia/distrito.",
        dependencias: [dependency],
        corte: { departamento, extraidoEl: inversiones[0]?.fuente?.extraidoEl ?? null },
        resultados,
      })
    );
  })
);

crossrefRouter.get(
  "/obras",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(DepartamentoQuerySchema, req.query, res);
    if (!parsed) return;
    const departamento = parsed.departamento?.toUpperCase().trim() ?? "LA LIBERTAD";

    let obras;
    let dependency: DependencyStatus;
    try {
      ({ obras, dependency } = await fetchInfobrasObras(departamento));
    } catch (error) {
      const dep = (error as { dependency?: DependencyStatus }).dependency;
      if (dep) {
        res.status(502).json(dependencyError(dep));
        return;
      }
      throw error;
    }

    const { rows: crosswalkRows } = await pool.query<{
      departamento: string;
      provincia: string | null;
      distrito: string | null;
      ubigeo: string | null;
      match_status: string;
    }>(
      `SELECT departamento, provincia, distrito, ubigeo, match_status
       FROM territory_name_crosswalk
       WHERE departamento = $1 AND source = 'infobras'`,
      [departamento]
    );
    const crosswalk = new Map(
      crosswalkRows.map((row) => [
        `${row.departamento}|${row.provincia ?? ""}|${row.distrito ?? ""}`,
        row,
      ])
    );

    const resultados = [];
    for (const obra of obras) {
      const key = `${obra.departamento?.toUpperCase() ?? ""}|${obra.provincia?.toUpperCase() ?? ""}|${obra.distrito?.toUpperCase() ?? ""}`;
      const cached = crosswalk.get(key);
      let territory = null;
      let matchStatus: "confirmada" | "candidata" | "sin_match" = "sin_match";

      if (cached?.ubigeo && cached.match_status !== "sin_match") {
        territory = await getTerritoryByUbigeo(cached.ubigeo);
        matchStatus = cached.match_status as "confirmada" | "candidata";
      } else {
        const lookup = await lookupTerritoryByNames(obra.departamento, obra.provincia, obra.distrito);
        territory = lookup.territory;
        matchStatus = lookup.matchStatus;
      }

      const nearbyInfrastructure = territory
        ? await findNearbyInfrastructure(territory.ubigeo, 50)
        : [];

      resultados.push(
        enrichWithTerritory({
          territory,
          matchStatus,
          nearbyInfrastructure,
          payload: {
            obra: {
              codigoInfobras: obra.codigoInfobras,
              nombreObra: obra.nombreObra,
              cui: obra.cui,
              departamento: obra.departamento,
              provincia: obra.provincia,
              distrito: obra.distrito,
              estadoEjecucion: obra.estadoEjecucion,
              fuente: obra.fuente,
            },
          },
        })
      );
    }

    res.json(
      crossrefEnvelope({
        matcher: "territorio_nombre",
        cobertura: obras.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
        restriccion: "INFOBRAS no publica coordenadas ni UBIGEO; no usar point-in-polygon.",
        dependencias: [dependency],
        corte: { departamento, extraidoEl: obras[0]?.fuente?.extraidoEl ?? null },
        resultados,
      })
    );
  })
);

crossrefRouter.get(
  "/ejecucion",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(UbigeoQuerySchema, req.query, res);
    if (!parsed) return;

    const territory = await getTerritoryByUbigeo(parsed.ubigeo);
    if (!territory) {
      res.status(404).json({ error: "UBIGEO no encontrado en ceplan-geo." });
      return;
    }

    let filasSede;
    let filasNacionalDirigido;
    let dependency: DependencyStatus;
    try {
      ({ filasSede, filasNacionalDirigido, dependency } = await fetchEjecucionByUbigeo(
        parsed.ubigeo,
        territory.departamento
      ));
    } catch (error) {
      const dep = (error as { dependency?: DependencyStatus }).dependency;
      if (dep) {
        res.status(502).json(dependencyError(dep));
        return;
      }
      throw error;
    }

    const nearbyInfrastructure = await findNearbyInfrastructure(parsed.ubigeo, 50);

    res.json(
      crossrefEnvelope({
        matcher: "ubigeo_exacto",
        cobertura: filasSede.length + filasNacionalDirigido.length > 0 ? "PARCIAL" : "SIN_DATOS_EN_FUENTE",
        restriccion:
          "Ejecución por sede (ubigeo) y gasto nacional dirigido (metaDepartamento) se entregan en secciones separadas; no deben sumarse.",
        dependencias: [dependency],
        corte: { ubigeo: parsed.ubigeo },
        resultados: [
          {
            territorio: {
              ubigeo: territory.ubigeo,
              departamento: territory.departamento,
              provincia: territory.provincia,
              distrito: territory.distrito,
            },
            ejecucionSedeRegional: filasSede,
            ejecucionNacionalDirigida: filasNacionalDirigido,
            advertenciaGasto:
              "Mezclar ejecucionSedeRegional y ejecucionNacionalDirigida es el error más común en lecturas territoriales de Trujillo/La Libertad.",
            nearbyInfrastructure,
          },
        ],
      })
    );
  })
);
