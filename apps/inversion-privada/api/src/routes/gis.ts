import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const gisRouter = Router();

const GIS_DASHBOARD_IFRAME_URL = "https://vertix.proinversion.gob.pe/gis/dashboard/index";
const GIS_PUBLIC_PAGE_URL = "https://www.investinperu.pe/gis-vertix/";

gisRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const { rows: geoRows } = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM private_investment_projects
       WHERE url_geo IS NOT NULL AND btrim(url_geo) <> ''`
    );

    const { rows: vertixRows } = await pool.query<{ total: number; fetched_at: string | null }>(
      `SELECT COUNT(*)::int AS total,
              (SELECT fetched_at FROM raw_vertix_batches ORDER BY fetched_at DESC LIMIT 1) AS fetched_at
       FROM private_investment_projects`
    );

    res.json({
      cobertura: "PARCIAL",
      restriccion:
        "El mapa público de investinperu.pe/gis-vertix embebe un iframe autenticado en vertix.proinversion.gob.pe; " +
        "no hay geometría descargable sin login. La cartera APP/PA en vertixService.php no publica coordenadas " +
        "(url_geo vacío en el corte actual).",
      publicPageUrl: GIS_PUBLIC_PAGE_URL,
      dashboardIframeUrl: GIS_DASHBOARD_IFRAME_URL,
      proyectosVertixConUrlGeo: geoRows[0]?.total ?? 0,
      proyectosVertixTotales: vertixRows[0]?.total ?? 0,
      extraidoElVertix: vertixRows[0]?.fetched_at ?? null,
      alternativaTerritorial:
        "Usar departamentos inferidos del buscador VERTIX y cruces contextuales vía GET /api/crossref.",
    });
  })
);
