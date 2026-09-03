#!/usr/bin/env node
/**
 * Genera el corte semanal explícito (ver plan "corte semanal explícito" y
 * docs/ESTADO.md) contra las 14 APIs corriendo en local (scripts/dev-local.sh),
 * y escribe:
 *   - src/data/snapshot.json — que `api-client.ts` lee en producción cuando
 *     las APIs en vivo no están publicadas.
 *   - src/data/search-index.json — que `functions/api/search.ts` lee cuando
 *     sus 3 fuentes en vivo no responden.
 *
 * Dos fases:
 *   1. Manifiesto estático — el espacio finito y enumerable de vistas de
 *      dashboard (ficha de sector, comparativo, benchmark, obras/activos/
 *      integridad INFOBRAS, crossref, proveedores por departamento,
 *      proveedores nacional sin filtro, inversiones LA LIBERTAD).
 *   2. Manifiesto dinámico — deriva la lista de RUCs de la respuesta de
 *      "proveedores nacional sin filtro" de la fase 1, y precalcula
 *      identidad (SUNAT) + sanciones (Tribunal) para cada uno. Este es el
 *      universo real que cubre Proveedor.tsx (por RUC): no es el padrón
 *      completo de SUNAT (millones de RUCs), es solo los proveedores que ya
 *      aparecen en los datos de Rastro.
 *
 * Buscar.tsx (texto libre) reusa exactamente estos mismos datos ya
 * descargados (no hace llamadas nuevas) para armar search-index.json.
 *
 * Uso: node scripts/export-snapshot.mjs [--base http://localhost]
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_OUT_PATH = path.join(HERE, "..", "src", "data", "snapshot.json");
const SEARCH_INDEX_OUT_PATH = path.join(HERE, "..", "src", "data", "search-index.json");

const baseFlagIndex = process.argv.indexOf("--base");
const BASE = baseFlagIndex !== -1 ? process.argv[baseFlagIndex + 1] : "http://localhost";

const PORTS = {
  "radar-ejecucion": 4000,
  "compras-publicas": 4001,
  "radar-inversiones": 4002,
  infobras: 4003,
  "ceplan-geo": 4005,
  "identidad-fiscal": 4006,
  "proveedores-sancionados": 4008,
};

/** Pool de concurrencia simple — sin dependencias nuevas. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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

  // Sin filtro — trae TODOS los proveedores (nacional), en una sola llamada.
  // Resuelve la sección "Contrataciones" de Proveedor.tsx directo, y es la
  // fuente de RUCs para la fase 2 (identidad + sanciones por proveedor).
  entries.push({ appKey: "compras-publicas", path: "/api/suppliers", query: undefined });

  // Mismo query que usa functions/api/search.ts para buscar obras/inversiones
  // por texto — reusado acá para construir search-index.json.
  entries.push({
    appKey: "radar-inversiones",
    path: "/api/investments",
    query: { departamento: DEPARTAMENTO, limit: 2000 },
  });

  return entries;
}

/** Deriva los RUCs distintos de la respuesta de suppliers sin filtro (supplierId = "PE-RUC-<ruc>"). */
function extractRucs(suppliersResponse) {
  const rucs = new Set();
  for (const s of suppliersResponse?.resultados ?? []) {
    const m = /^PE-RUC-(\d{11})$/.exec(s.supplierId ?? "");
    if (m) rucs.add(m[1]);
  }
  return [...rucs];
}

function buildDynamicManifest(rucs) {
  const entries = [];
  for (const ruc of rucs) {
    entries.push({ appKey: "identidad-fiscal", path: `/api/contribuyentes/${ruc}`, query: undefined });
    entries.push({ appKey: "proveedores-sancionados", path: `/api/sanciones/${ruc}`, query: undefined });
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

/** Resuelve un manifiesto secuencial (fase 1, pocas entradas — no hace falta pool). */
async function resolveSequential(manifest, entries) {
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
  return { ok, failed };
}

/** Resuelve un manifiesto grande con concurrencia acotada (fase 2 — universo de RUCs). */
async function resolveConcurrent(manifest, entries, concurrency = 8) {
  let ok = 0;
  let failed = 0;
  await mapWithConcurrency(manifest, concurrency, async (item) => {
    const key = snapshotKey(item.appKey, item.path, item.query);
    try {
      entries[key] = await fetchOne(item);
      ok += 1;
    } catch (err) {
      failed += 1;
      console.error(`[export-snapshot] FALLÓ ${key}: ${err.message}`);
    }
  });
  return { ok, failed };
}

function buildSearchIndex(entries) {
  const items = [];

  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith("identidad-fiscal:/api/contribuyentes/") && value?.value?.ruc) {
      items.push({
        tipo: "ruc",
        identificador: value.value.ruc,
        descripcion: value.value.razonSocial ?? value.value.ruc,
        fuente: "identidad-fiscal / contribuyentes",
      });
    }
  }

  const obras = entries[snapshotKey("infobras", "/api/public-works", { departamento: DEPARTAMENTO })];
  for (const w of obras?.resultados ?? []) {
    items.push({
      tipo: "obra",
      identificador: w.codigoInfobras,
      descripcion: w.nombreObra,
      fuente: "infobras / public-works",
    });
  }

  const investments = entries[
    snapshotKey("radar-inversiones", "/api/investments", { departamento: DEPARTAMENTO, limit: 2000 })
  ];
  for (const inv of investments?.resultados ?? []) {
    items.push({
      tipo: "inversion",
      identificador: inv.cui,
      descripcion: inv.nombre,
      fuente: "radar-inversiones / investments",
    });
  }

  return items;
}

async function main() {
  const entries = {};

  // Fase 1: manifiesto estático (vistas de dashboard + suppliers sin filtro + inversiones).
  const staticManifest = buildManifest();
  const phase1 = await resolveSequential(staticManifest, entries);

  if (phase1.ok === 0) {
    console.error(
      "[export-snapshot] 0 de",
      staticManifest.length,
      "consultas exitosas — no se escribe nada (¿están las APIs levantadas? ver scripts/dev-local.sh)",
    );
    process.exit(1);
  }

  // Fase 2: universo de RUCs derivado de la respuesta de suppliers sin filtro.
  const suppliersKey = snapshotKey("compras-publicas", "/api/suppliers", undefined);
  const rucs = extractRucs(entries[suppliersKey]);
  console.log(`[export-snapshot] ${rucs.length} RUCs distintos encontrados en suppliers — precalculando identidad + sanciones...`);
  const dynamicManifest = buildDynamicManifest(rucs);
  const phase2 = dynamicManifest.length > 0 ? await resolveConcurrent(dynamicManifest, entries) : { ok: 0, failed: 0 };

  const ok = phase1.ok + phase2.ok;
  const failed = phase1.failed + phase2.failed;
  const total = staticManifest.length + dynamicManifest.length;

  const corte = new Date().toISOString();
  writeFileSync(SNAPSHOT_OUT_PATH, JSON.stringify({ corte, entries }, null, 2) + "\n", "utf-8");
  console.log(`[export-snapshot] snapshot.json — ${ok}/${total} consultas (${failed} fallidas) escritas en ${SNAPSHOT_OUT_PATH}`);

  const searchItems = buildSearchIndex(entries);
  writeFileSync(SEARCH_INDEX_OUT_PATH, JSON.stringify({ corte, items: searchItems }, null, 2) + "\n", "utf-8");
  console.log(`[export-snapshot] search-index.json — ${searchItems.length} entradas escritas en ${SEARCH_INDEX_OUT_PATH}`);

  if (failed > 0) process.exitCode = 1;
}

main();
