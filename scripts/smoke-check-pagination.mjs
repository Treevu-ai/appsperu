#!/usr/bin/env node
// DQ-10 (docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md): smoke test
// genérico que, para cada endpoint de listado con `total`/`limit`/`offset`/
// `hasMore`, pagina el universo completo y compara la suma de filas contra
// el `total` declarado — el mismo chequeo manual que encontró el LIMIT 1000
// oculto de DQ-01 (radar-ejecucion) y que habría detectado el `groupBy`
// ignorado de DQ-06 si hubiera existido antes.
//
// Alcance deliberado de esta primera versión: SOLO on-demand contra
// servidores ya corriendo (local o de otro entorno vía API_BASE), no está
// cableado a un workflow de CI con Postgres+seed propios. Los jobs de CI de
// .github/workflows/ci.yml corren `npm test` con el pool de Postgres
// mockeado (sin datos reales) — habilitar esto como chequeo periódico en CI
// requeriría levantar Postgres + ingerir datos reales dentro del workflow,
// una pieza de infraestructura nueva y más cara que este script en sí. Se
// deja documentado como decisión explícita (criterio de aceptación de DQ-10)
// en vez de construirla sin que alguien la pida.
//
// Uso:
//   node scripts/smoke-check-pagination.mjs               # http://127.0.0.1:<puerto>
//   API_BASE=https://api.rastro.pe node scripts/smoke-check-pagination.mjs

const API_BASE = process.env.API_BASE?.replace(/\/$/, "") || null;

// Cada entrada: endpoint real que expone {total, limit, offset, hasMore} y
// soporta paginación real (confirmado leyendo la ruta, no solo la respuesta
// de una sola página) — no todos los endpoints de listado del catálogo la
// tienen (ej. infobras GET /api/public-works no pagina hoy, fuera del
// alcance de este chequeo).
const ENDPOINTS = [
  { app: "radar-ejecucion", port: 4000, path: "/api/execution", query: "departamento=LA%20LIBERTAD", pageSize: 1000 },
  { app: "infraestructura-mtc", port: 4026, path: "/api/aerodromos", query: "", pageSize: 500 },
  { app: "infraestructura-mtc", port: 4026, path: "/api/terminales-portuarios", query: "", pageSize: 500 },
  { app: "residuos-solidos", port: 4025, path: "/api/residuos", query: "", pageSize: 200 },
  { app: "instituciones-educativas", port: 4022, path: "/api/instituciones", query: "departamento=LA%20LIBERTAD", pageSize: 1000 },
];

function baseUrlFor(entry) {
  if (API_BASE) return `${API_BASE}/${entry.app}`;
  return `http://127.0.0.1:${entry.port}`;
}

async function checkEndpoint(entry) {
  const base = baseUrlFor(entry);
  const sep = entry.query ? "&" : "?";
  let offset = 0;
  let declaredTotal = null;
  let summed = 0;
  let pages = 0;

  for (;;) {
    const url = `${base}${entry.path}?${entry.query}${entry.query ? "&" : ""}limit=${entry.pageSize}&offset=${offset}`;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      return { entry, ok: false, reason: `no se pudo conectar a ${url}: ${err.message}` };
    }
    if (!res.ok) {
      return { entry, ok: false, reason: `${url} devolvió HTTP ${res.status}` };
    }
    const body = await res.json();
    if (typeof body.total !== "number") {
      return { entry, ok: false, reason: `${url} no expone un campo "total" numérico — endpoint fuera del contrato esperado` };
    }
    declaredTotal = body.total;
    const rows = Array.isArray(body.resultados) ? body.resultados.length : 0;
    summed += rows;
    pages += 1;

    if (!body.hasMore || rows === 0) break;
    offset += entry.pageSize;
    if (pages > 200) {
      return { entry, ok: false, reason: `más de 200 páginas sin que hasMore se vuelva false — posible loop infinito, abortado` };
    }
  }

  if (summed !== declaredTotal) {
    return {
      entry,
      ok: false,
      reason: `total declarado (${declaredTotal}) no coincide con la suma de filas paginadas (${summed}) tras ${pages} página(s)`,
    };
  }
  return { entry, ok: true, total: declaredTotal, pages };
}

const results = await Promise.all(ENDPOINTS.map(checkEndpoint));

let anyFail = false;
for (const r of results) {
  const label = `${r.entry.app} ${r.entry.path}`;
  if (r.ok) {
    console.log(`OK   ${label} — total=${r.total} en ${r.pages} página(s)`);
  } else {
    anyFail = true;
    console.error(`FAIL ${label} — ${r.reason}`);
  }
}

console.log("");
const okCount = results.filter((r) => r.ok).length;
console.log(`${okCount}/${results.length} endpoints con total = suma de filas paginadas.`);

process.exit(anyFail ? 1 : 0);
