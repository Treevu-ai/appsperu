#!/usr/bin/env node
/**
 * Genera el corte semanal explícito (ver plan "corte semanal explícito" y
 * docs/ESTADO.md) — consulta el espacio finito y enumerable de vistas de
 * dashboard (ficha de sector, comparativo, benchmark, obras/activos/
 * integridad INFOBRAS, crossref, proveedores por departamento) contra las
 * 14 APIs corriendo en local (scripts/dev-local.sh), y escribe
 * src/data/snapshot.json — que `api-client.ts` lee en producción cuando
 * las APIs en vivo no están publicadas.
 *
 * Deliberadamente NO cubre Proveedor.tsx (por RUC) ni Buscar.tsx (texto
 * libre): aceptan cualquier input del usuario, el espacio no es finito.
 * Esas vistas siguen mostrando "no disponible" fuera del corte.
 *
 * Uso: node scripts/export-snapshot.mjs [--base http://localhost]
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(HERE, "..", "src", "data", "snapshot.json");

const baseFlagIndex = process.argv.indexOf("--base");
const BASE = baseFlagIndex !== -1 ? process.argv[baseFlagIndex + 1] : "http://localhost";

const PORTS = {
  "radar-ejecucion": 4000,
  "compras-publicas": 4001,
  infobras: 4003,
  "ceplan-geo": 4005,
};

const ANIO = 2026;
const DEPARTAMENTO = "LA LIBERTAD";
const SECTORES = ["TRANSPORTE", "SALUD", "EDUCACION", "AGRICULTURA", "VIVIENDA"];
const ENTITY_CODES = ["831", "832", "999"];
const DEPARTAMENTOS_PROVEEDORES = ["LA LIBERTAD", "LAMBAYEQUE", "PIURA", "CAJAMARCA", "CUSCO"];
// Distritos ya ejercitados por la suite E2E (e2e/distrito.spec.ts) — curado,
// no exhaustivo. Agregar acá cuando se agregue un distrito nuevo a la demo.
const UBIGEOS_DISTRITO = ["130101", "060101"];

/** Réplica de snapshotKey() en src/lib/snapshot-key.ts — mantener en sync. */
function snapshotKey(appKey, path, query) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!query) return `${appKey}:${normalizedPath}`;
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
  if (parts.length === 0) return `${appKey}:${normalizedPath}`;
  const qs = parts.map(([k, v]) => `${k}=${v}`).join("&");
  return `${appKey}:${normalizedPath}?${qs}`;
}

function buildManifest() {
  const entries = [];

  for (const sector of SECTORES) {
    entries.push({
      appKey: "radar-ejecucion",
      path: `/api/sectores/${sector}/ficha`,
      query: { anio: ANIO, departamento: DEPARTAMENTO },
    });
  }

  entries.push({
    appKey: "radar-ejecucion",
    path: "/api/sectores/comparativo",
    query: { anio: ANIO, departamento: DEPARTAMENTO, sectores: SECTORES.join(",") },
  });

  for (const entityCode of ENTITY_CODES) {
    entries.push({
      appKey: "radar-ejecucion",
      path: `/api/benchmark/${entityCode}`,
      query: { anio: ANIO },
    });
  }

  entries.push({
    appKey: "radar-ejecucion",
    path: "/api/infraestructura/integridad",
    query: { departamento: DEPARTAMENTO, estricto: true },
  });
  entries.push({
    appKey: "radar-ejecucion",
    path: "/api/infraestructura/activos",
    query: { departamento: DEPARTAMENTO },
  });

  entries.push({
    appKey: "infobras",
    path: "/api/public-works",
    query: { departamento: DEPARTAMENTO },
  });
  for (const confidence of ["confirmada", "candidata", undefined]) {
    entries.push({
      appKey: "infobras",
      path: "/api/crossref/ejecucion",
      query: confidence ? { confidence } : undefined,
    });
  }

  for (const ubigeo of UBIGEOS_DISTRITO) {
    entries.push({ appKey: "ceplan-geo", path: "/api/territories", query: { ubigeo } });
  }

  for (const departamento of DEPARTAMENTOS_PROVEEDORES) {
    entries.push({
      appKey: "compras-publicas",
      path: "/api/suppliers",
      query: { departamento },
    });
  }

  return entries;
}

async function fetchOne({ appKey, path: p, query }) {
  const port = PORTS[appKey];
  const url = new URL(p, `${BASE}:${port}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} en ${url}`);
  }
  return res.json();
}

async function main() {
  const manifest = buildManifest();
  const entries = {};
  let ok = 0;
  let failed = 0;

  for (const item of manifest) {
    const key = snapshotKey(item.appKey, item.path, item.query);
    try {
      entries[key] = await fetchOne(item);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`[export-snapshot] FALLÓ ${key}: ${err.message}`);
    }
  }

  if (ok === 0) {
    console.error("[export-snapshot] 0 de", manifest.length, "consultas exitosas — no se escribe snapshot.json (¿están las APIs levantadas? ver scripts/dev-local.sh)");
    process.exit(1);
  }

  const payload = { corte: new Date().toISOString(), entries };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  console.log(`[export-snapshot] OK — ${ok}/${manifest.length} consultas (${failed} fallidas) escritas en ${OUT_PATH}`);
  if (failed > 0) process.exitCode = 1;
}

main();
