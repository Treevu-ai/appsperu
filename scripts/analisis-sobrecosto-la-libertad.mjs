#!/usr/bin/env node
/**
 * Análisis de sobrecosto — La Libertad
 * Fuente: DETALLE_INVERSIONES.csv (MEF / Invierte.pe)
 */
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { writeFileSync } from "node:fs";

const FILE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv";
const RANGES = [
  [0, 52428800 - 1],
  [52428800, 104857600 - 1],
  [104857600, 157286400 - 1],
  [157286400, 209715200 - 1],
  [209715200, 246344021],
];

async function fetchRange(start, end) {
  const res = await fetch(FILE_URL, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} for ${start}-${end}`);
  return res.text();
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toText(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function pct(a, b) {
  if (!b) return null;
  return Math.round((a / b) * 1000) / 10;
}

function variacion(mv, ca) {
  if (mv == null || ca == null || mv <= 0) return null;
  return Math.round(((ca - mv) / mv) * 1000) / 10;
}

function fmt(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);
}

function fmtM(n) {
  if (n == null) return "—";
  return `S/ ${(n / 1e6).toFixed(1)}M`;
}

function fmtB(n) {
  if (n == null) return "—";
  return `S/ ${(n / 1e9).toFixed(2)}B`;
}

async function loadLaLibertad() {
  let headerLine = "";
  const byCui = new Map();

  for (let i = 0; i < RANGES.length; i++) {
    const [start, end] = RANGES[i];
    process.stderr.write(`Descargando rango ${i + 1}/${RANGES.length}...\n`);

    if (start > 0 && !headerLine) {
      const h = await fetchRange(0, 4095);
      headerLine = h.slice(0, h.indexOf("\n"));
    }

    let text = await fetchRange(start, end);
    const lastNl = text.lastIndexOf("\n");
    if (lastNl > 0) text = text.slice(0, lastNl);
    if (start > 0) {
      const firstNl = text.indexOf("\n");
      if (firstNl > 0) text = text.slice(firstNl + 1);
      text = `${headerLine}\n${text}`;
    }

    const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, bom: true });
    for (const raw of rows) {
      if (toText(raw.DEPARTAMENTO)?.toUpperCase() !== "LA LIBERTAD") continue;
      const cui = toText(raw.CODIGO_UNICO);
      if (!cui) continue;
      byCui.set(cui, {
        cui,
        nombre: toText(raw.NOMBRE_INVERSION),
        entidad: toText(raw.ENTIDAD),
        secEjec: toText(raw.SEC_EJEC),
        sector: toText(raw.SECTOR),
        nivel: toText(raw.NIVEL),
        estado: toText(raw.ESTADO),
        situacion: toText(raw.SITUACION),
        provincia: toText(raw.PROVINCIA),
        distrito: toText(raw.DISTRITO),
        funcion: toText(raw.FUNCION),
        tipoInversion: toText(raw.TIPO_INVERSION),
        montoViable: toNum(raw.MONTO_VIABLE),
        costoActualizado: toNum(raw.COSTO_ACTUALIZADO),
        fechaViabilidad: toText(raw.FECHA_VIABILIDAD),
      });
    }
  }

  return [...byCui.values()];
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item) ?? "SIN DATO";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

function summarizePortfolio(rows) {
  const withBoth = rows.filter((r) => r.montoViable != null && r.costoActualizado != null && r.montoViable > 0);
  const conSobrecosto = withBoth.filter((r) => r.costoActualizado > r.montoViable);
  const subcosto = withBoth.filter((r) => r.costoActualizado < r.montoViable);
  const igual = withBoth.filter((r) => r.costoActualizado === r.montoViable);

  const sumViable = withBoth.reduce((s, r) => s + r.montoViable, 0);
  const sumActualizado = withBoth.reduce((s, r) => s + r.costoActualizado, 0);
  const delta = sumActualizado - sumViable;

  return {
    total: rows.length,
    conMontos: withBoth.length,
    conSobrecosto: conSobrecosto.length,
    pctSobrecosto: pct(conSobrecosto.length, withBoth.length),
    subcosto: subcosto.length,
    igual: igual.length,
    sumViable,
    sumActualizado,
    delta,
    pctAgregado: variacion(sumViable, sumActualizado),
    conSobrecostoRows: conSobrecosto,
  };
}

function aggByKey(rows, keyFn) {
  const groups = groupBy(rows, keyFn);
  const out = [];
  for (const [key, items] of groups) {
    const s = summarizePortfolio(items);
    out.push({
      key,
      ...s,
      deltaAbs: s.delta,
      deltaM: s.delta / 1e6,
    });
  }
  return out.sort((a, b) => b.deltaAbs - a.deltaAbs);
}

function topProjects(rows, n = 15) {
  return rows
    .filter((r) => r.montoViable > 0 && r.costoActualizado != null)
    .map((r) => ({
      ...r,
      variacionPct: variacion(r.montoViable, r.costoActualizado),
      deltaAbs: r.costoActualizado - r.montoViable,
    }))
    .filter((r) => r.variacionPct != null && r.variacionPct > 0)
    .sort((a, b) => b.variacionPct - a.variacionPct)
    .slice(0, n);
}

function topByDelta(rows, n = 15) {
  return rows
    .filter((r) => r.montoViable > 0 && r.costoActualizado != null && r.costoActualizado > r.montoViable)
    .map((r) => ({
      ...r,
      variacionPct: variacion(r.montoViable, r.costoActualizado),
      deltaAbs: r.costoActualizado - r.montoViable,
    }))
    .sort((a, b) => b.deltaAbs - a.deltaAbs)
    .slice(0, n);
}

function distribution(rows) {
  const buckets = [
    { label: "0% (sin variación)", min: 0, max: 0 },
    { label: "0.1% – 10%", min: 0.1, max: 10 },
    { label: "10.1% – 25%", min: 10.1, max: 25 },
    { label: "25.1% – 50%", min: 25.1, max: 50 },
    { label: "50.1% – 100%", min: 50.1, max: 100 },
    { label: "> 100%", min: 100.1, max: Infinity },
  ];
  const withVar = rows
    .filter((r) => r.montoViable > 0 && r.costoActualizado != null)
    .map((r) => ({ ...r, v: variacion(r.montoViable, r.costoActualizado) }));

  return buckets.map((b) => {
    const items = withVar.filter((r) => {
      if (b.min === 0 && b.max === 0) return r.v === 0;
      return r.v > b.min && r.v <= b.max;
    });
    const delta = items.reduce((s, r) => s + (r.costoActualizado - r.montoViable), 0);
    return { ...b, count: items.length, delta };
  });
}

const all = await loadLaLibertad();
const activos = all.filter((r) => r.estado === "ACTIVO");
const activosViables = activos.filter((r) => r.situacion === "VIABLE" || r.situacion === "APROBADO" || r.situacion === "REGISTRADO");

const portfolio = summarizePortfolio(activos);
const byProvincia = aggByKey(activos, (r) => r.provincia);
const byFuncion = aggByKey(activos, (r) => r.funcion);
const byEntidad = aggByKey(activos, (r) => r.entidad);
const byNivel = aggByKey(activos, (r) => r.nivel);
const byTipo = aggByKey(activos, (r) => r.tipoInversion);

const topPct = topProjects(activos, 20);
const topDelta = topByDelta(activos, 20);
const dist = distribution(activos);

// Funciones con mayor % sobrecosto (mín 10 proyectos)
const funcionesPct = byFuncion
  .filter((g) => g.conMontos >= 10)
  .map((g) => ({ funcion: g.key, pct: g.pctSobrecosto, n: g.conMontos, deltaM: g.deltaM }))
  .sort((a, b) => b.pct - a.pct);

const provinciasPct = byProvincia
  .filter((g) => g.conMontos >= 5)
  .map((g) => ({ provincia: g.key, pct: g.pctSobrecosto, n: g.conMontos, deltaM: g.deltaM, pctAgregado: g.pctAgregado }))
  .sort((a, b) => b.pct - a.pct);

const entidadesDelta = byEntidad
  .filter((g) => g.conMontos >= 3)
  .map((g) => ({ entidad: g.key, provincia: g.conSobrecostoRows[0]?.provincia, n: g.conMontos, pct: g.pctSobrecosto, deltaM: g.deltaM, pctAgregado: g.pctAgregado }))
  .sort((a, b) => b.deltaM - a.deltaM)
  .slice(0, 15);

const saneamiento = activos.filter((r) => r.funcion === "SANEAMIENTO");
const transporte = activos.filter((r) => r.funcion === "TRANSPORTE");
const saneamientoSum = summarizePortfolio(saneamiento);
const transporteSum = summarizePortfolio(transporte);

const result = {
  meta: {
    fuente: FILE_URL,
    generado: new Date().toISOString(),
    totalCuiLaLibertad: all.length,
    activos: activos.length,
    checksum: createHash("sha256").update(String(all.length)).digest("hex").slice(0, 12),
  },
  portfolio,
  distribucion: dist,
  porProvincia: provinciasPct,
  porFuncionPct: funcionesPct.slice(0, 12),
  porFuncionDelta: byFuncion.filter((g) => g.conMontos >= 5).slice(0, 12).map((g) => ({
    funcion: g.key, n: g.conMontos, pctSobrecosto: g.pctSobrecosto, viable: g.sumViable, actualizado: g.sumActualizado, deltaM: g.deltaM, pctAgregado: g.pctAgregado,
  })),
  porNivel: byNivel.map((g) => ({ nivel: g.key, n: g.conMontos, pctSobrecosto: g.pctSobrecosto, deltaM: g.deltaM })),
  porTipo: byTipo.map((g) => ({ tipo: g.key, n: g.conMontos, pctSobrecosto: g.pctSobrecosto, deltaM: g.deltaM })),
  entidadesTopDelta: entidadesDelta,
  topPorcentaje: topPct.map((r) => ({
    cui: r.cui, nombre: r.nombre?.slice(0, 80), entidad: r.entidad, provincia: r.provincia, funcion: r.funcion,
    viable: r.montoViable, actualizado: r.costoActualizado, variacionPct: r.variacionPct, deltaAbs: r.deltaAbs,
  })),
  topDeltaAbsoluto: topDelta.map((r) => ({
    cui: r.cui, nombre: r.nombre?.slice(0, 80), entidad: r.entidad, provincia: r.provincia, funcion: r.funcion,
    viable: r.montoViable, actualizado: r.costoActualizado, variacionPct: r.variacionPct, deltaAbs: r.deltaAbs,
  })),
  sectoresCriticos: {
    saneamiento: { n: saneamientoSum.conMontos, pctSobrecosto: saneamientoSum.pctSobrecosto, deltaM: saneamientoSum.delta / 1e6, pctAgregado: saneamientoSum.pctAgregado },
    transporte: { n: transporteSum.conMontos, pctSobrecosto: transporteSum.pctSobrecosto, deltaM: transporteSum.delta / 1e6, pctAgregado: transporteSum.pctAgregado },
  },
};

writeFileSync("/workspace/artifacts/sobrecosto-la-libertad-analysis.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
