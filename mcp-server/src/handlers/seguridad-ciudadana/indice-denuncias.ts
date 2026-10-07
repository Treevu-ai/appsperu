import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface DenunciaRow extends NeonRow {
  nivel_geo: string;
  modalidad: string;
  total_denuncias: number | string;
  distritos_activos: number | string;
}

interface PoblacionRow extends NeonRow {
  poblacion: number | string;
  fuente: string;
  vintage: string;
}

interface ResultadoItem {
  nivelGeo: string;
  modalidad: string;
  totalDenuncias: number;
  distritosActivos: number;
  poblacion: number | null;
  tasaPor10mil: number | null;
  fuentePoblacion: string | null;
  vintage: string | null;
  ranking: number | null;
  totalModalidades: number | null;
}

/**
 * Handler para `seguridad_ciudadana_indice_denuncias` — GET /api/indices/denuncias.
 * Origen: apps/seguridad-ciudadana/api/src/routes/indice-denuncias.ts.
 */
export async function list(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase();
  const provincia = args.provincia as string | undefined;
  const modalidad = args.modalidad as string | undefined;
  const orden = (args.orden as string | undefined) ?? "tasa_desc";

  let anioFinal = args.anio ? Number(args.anio) : undefined;
  if (anioFinal === undefined) {
    const { rows: yearRows } = await db.query<{ max_anio: number | string | null }>(
      `SELECT MAX(anio) AS max_anio FROM police_reports WHERE departamento = $1`,
      [departamento]
    );
    anioFinal = Number(yearRows[0]?.max_anio) || 2024;
  }

  const condiciones: string[] = [`pr.anio = $1`, `pr.departamento = $2`];
  const params: unknown[] = [anioFinal, departamento];
  if (provincia) { params.push(provincia.toUpperCase()); condiciones.push(`pr.provincia = $${params.length}`); }
  if (modalidad) { params.push(modalidad); condiciones.push(`pr.modalidad = $${params.length}`); }
  const where = `WHERE ${condiciones.join(" AND ")}`;

  const { rows: pobRows } = await db.query<PoblacionRow>(
    `SELECT poblacion, fuente, vintage FROM poblacion_departamental WHERE departamento = $1`,
    [departamento]
  );
  if (pobRows.length === 0) {
    return {
      status: 422,
      body: {
        error: `No hay población departamental para "${departamento}".`,
        departamento,
        detalle: "Verificar que se corrió la ingesta de población departamental.",
      },
    };
  }
  const { poblacion, fuente, vintage } = pobRows[0];

  const nivelAgr = provincia ? "provincia" : "departamento";
  const { rows: denuncias } = await db.query<DenunciaRow>(
    `SELECT
       ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"} AS nivel_geo,
       pr.modalidad,
       SUM(pr.cantidad) AS total_denuncias,
       COUNT(DISTINCT pr.distrito) AS distritos_activos
     FROM police_reports pr
     ${where}
     GROUP BY ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"}, pr.modalidad
     ORDER BY ${nivelAgr === "provincia" ? "pr.provincia" : "pr.departamento"}, pr.modalidad`,
    params
  );

  if (denuncias.length === 0) {
    return { status: 404, body: { error: "Sin datos de denuncias para los filtros dados.", anio: anioFinal, departamento } };
  }

  // Sin población a nivel provincia, dividir el numerador de una provincia
  // por la población de TODO el departamento infla artificialmente la tasa.
  // La tasa solo es válida a nivel departamental; a nivel provincia se
  // devuelve null explícito (ver nota en la ruta HTTP homónima).
  const resultados: ResultadoItem[] = denuncias.map((r) => ({
    nivelGeo: r.nivel_geo,
    modalidad: r.modalidad,
    totalDenuncias: Number(r.total_denuncias),
    distritosActivos: Number(r.distritos_activos),
    poblacion: nivelAgr === "departamento" ? Number(poblacion) : null,
    tasaPor10mil:
      nivelAgr === "departamento"
        ? Math.round((Number(r.total_denuncias) / Number(poblacion)) * 10000 * 10) / 10
        : null,
    fuentePoblacion: nivelAgr === "departamento" ? fuente : null,
    vintage: nivelAgr === "departamento" ? vintage : null,
    ranking: null,
    totalModalidades: null,
  }));

  const grupos = new Map<string, ResultadoItem[]>();
  for (const r of resultados) {
    if (!grupos.has(r.nivelGeo)) grupos.set(r.nivelGeo, []);
    grupos.get(r.nivelGeo)!.push(r);
  }
  for (const [, grupo] of grupos) {
    grupo.sort((a, b) =>
      nivelAgr === "departamento"
        ? (b.tasaPor10mil ?? 0) - (a.tasaPor10mil ?? 0)
        : b.totalDenuncias - a.totalDenuncias
    );
    for (let i = 0; i < grupo.length; i++) {
      const item = resultados.find((r) => r.nivelGeo === grupo[i].nivelGeo && r.modalidad === grupo[i].modalidad)!;
      item.ranking = i + 1;
      item.totalModalidades = grupo.length;
    }
  }

  if (orden === "tasa_desc") resultados.sort((a, b) => (b.tasaPor10mil ?? -1) - (a.tasaPor10mil ?? -1));
  else if (orden === "tasa_asc") resultados.sort((a, b) => (a.tasaPor10mil ?? 999999) - (b.tasaPor10mil ?? 999999));
  else if (orden === "denuncias_desc") resultados.sort((a, b) => b.totalDenuncias - a.totalDenuncias);
  else {
    resultados.sort((a, b) => {
      const geoDiff = a.nivelGeo.localeCompare(b.nivelGeo);
      return geoDiff !== 0 ? geoDiff : a.modalidad.localeCompare(b.modalidad);
    });
  }

  const resumenModalidades =
    nivelAgr === "departamento"
      ? (() => {
          const porModalidad = new Map<string, { denuncias: number; tasas: number[]; niveles: number }>();
          for (const r of resultados) {
            const existing = porModalidad.get(r.modalidad) ?? { denuncias: 0, tasas: [], niveles: 0 };
            porModalidad.set(r.modalidad, {
              denuncias: existing.denuncias + r.totalDenuncias,
              tasas: [...existing.tasas, r.tasaPor10mil ?? 0],
              niveles: existing.niveles + 1,
            });
          }
          return [...porModalidad.entries()]
            .map(([modalidad, data]) => ({
              modalidad,
              totalDenuncias: data.denuncias,
              tasaPromedio: data.niveles > 0 ? Math.round((data.tasas.reduce((a, b) => a + b, 0) / data.niveles) * 10) / 10 : null,
              departamentosActivos: data.niveles,
            }))
            .sort((a, b) => (b.tasaPromedio ?? 0) - (a.tasaPromedio ?? 0));
        })()
      : [];

  return {
    status: 200,
    body: {
      meta: {
        cobertura: "Nacional (SIDPOL/MININTER)",
        fuentePoblacion: fuente,
        vintage,
        metodologia: "Tasa = (total_denuncias × 10,000) / poblacion_departamento. Población = padrón electoral RENIEC 2026 (mayores de 18 años). Solo disponible a nivel departamento — no hay población provincial.",
        limitaciones: [
          "SIDPOL mide solo denuncias hechas en comisaría — no incluye hechos no denunciados.",
          "Un departamento con alta tasa puede reflejar buena cultura de denuncia, no necesariamente más criminalidad.",
          "La modalidad puede variar de clasificación entre años.",
          "La población es proxy (mayores de 18 años) — excluye menores.",
          "La agregación es departamental: diferencias intra-departamentales (provincias/distritos) no se capturan en la tasa.",
          "Al filtrar por provincia, tasaPor10mil es null (no hay población provincial) — solo se muestra totalDenuncias.",
        ],
        filtros: { anio: anioFinal, departamento, provincia: provincia ?? null, modalidad: modalidad ?? null },
        nivelGeografico: nivelAgr,
        stats: { totalFilas: resultados.length, modalidadesUnicas: new Set(resultados.map((r) => r.modalidad)).size, poblacionDepartamental: Number(poblacion) },
      },
      resumenPorModalidad: resumenModalidades,
      resultados,
    },
  };
}

interface SerieRow extends NeonRow {
  anio: number | string;
  modalidad: string;
  total_denuncias: number | string;
}

/**
 * Handler para `seguridad_ciudadana_indice_denuncias_comparativo` — GET /api/indices/denuncias/comparativo.
 * Origen: apps/seguridad-ciudadana/api/src/routes/indice-denuncias.ts.
 */
export async function comparativo(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db, args } = ctx;
  const departamento = ((args.departamento as string | undefined) ?? "LA LIBERTAD").toUpperCase();
  const anioInicio = args.anioInicio ? Number(args.anioInicio) : undefined;
  const anioFin = args.anioFin ? Number(args.anioFin) : undefined;

  // Años disponibles PARA ESE DEPARTAMENTO — tomar el rango de toda la tabla
  // (todos los departamentos) podía dejar el default fuera del rango real
  // de datos del departamento solicitado.
  const { rows: yearRows } = await db.query<{ anio: number | string }>(
    `SELECT DISTINCT anio FROM police_reports WHERE departamento = $1 ORDER BY anio`,
    [departamento]
  );
  const aniosDisponibles = yearRows.map((r) => Number(r.anio));
  if (aniosDisponibles.length === 0) {
    return { status: 404, body: { error: `Sin datos en police_reports para "${departamento}".` } };
  }

  const anioFinReal = anioFin ?? Math.max(...aniosDisponibles);
  const anioInicioReal = anioInicio ?? Math.min(...aniosDisponibles);
  if (anioFinReal <= anioInicioReal) {
    return { status: 400, body: { error: "anioFin debe ser mayor que anioInicio." } };
  }

  const { rows: series } = await db.query<SerieRow>(
    `SELECT
       pr.anio,
       pr.modalidad,
       SUM(pr.cantidad) AS total_denuncias
     FROM police_reports pr
     WHERE pr.departamento = $1
       AND pr.anio BETWEEN $2 AND $3
     GROUP BY pr.anio, pr.modalidad
     ORDER BY pr.anio, pr.modalidad`,
    [departamento, anioInicioReal, anioFinReal]
  );
  if (series.length === 0) {
    return { status: 404, body: { error: `Sin datos para el departamento "${departamento}".` } };
  }

  const { rows: pobRows } = await db.query<PoblacionRow>(
    `SELECT poblacion, fuente, vintage FROM poblacion_departamental WHERE departamento = $1`,
    [departamento]
  );
  if (pobRows.length === 0) {
    return { status: 422, body: { error: `No hay población departamental para "${departamento}".`, departamento } };
  }
  const poblacion = Number(pobRows[0].poblacion);
  const { fuente, vintage } = pobRows[0];

  const seriesConTasa = series.map((r) => ({
    anio: Number(r.anio),
    modalidad: r.modalidad,
    totalDenuncias: Number(r.total_denuncias),
    tasaPor10mil: Math.round((Number(r.total_denuncias) / poblacion) * 10000 * 10) / 10,
  }));

  const modalidades = [...new Set(series.map((r) => r.modalidad))];
  const evolucion = modalidades.map((modalidad) => {
    const puntos = seriesConTasa.filter((r) => r.modalidad === modalidad);
    const primerAnio = puntos.find((r) => r.anio === anioInicioReal);
    const ultimoAnio = puntos.find((r) => r.anio === anioFinReal);

    // `variacionPct` se calcula sobre `totalDenuncias` (conteo crudo), no
    // sobre `tasaPor10mil` (ya redondeada a 1 decimal) — la población es
    // constante entre años para el mismo departamento, el % de variación es
    // idéntico, pero partir del conteo crudo evita amplificar el error de
    // redondeo de la tasa.
    const variacion =
      primerAnio !== undefined && ultimoAnio !== undefined && primerAnio.totalDenuncias !== 0
        ? Math.round(((ultimoAnio.totalDenuncias - primerAnio.totalDenuncias) / primerAnio.totalDenuncias) * 1000) / 10
        : null;

    return {
      modalidad,
      tasaInicio: primerAnio?.tasaPor10mil ?? null,
      tasaFin: ultimoAnio?.tasaPor10mil ?? null,
      variacionPct: variacion,
      tendencia:
        variacion === null
          ? null
          : variacion > 20
            ? "EMPEORO_SIGNIFICATIVO"
            : variacion > 0
              ? "EMPEORO"
              : variacion > -20
                ? "MEJORA"
                : "MEJORA_SIGNIFICATIVA",
    };
  });

  return {
    status: 200,
    body: {
      meta: {
        departamento,
        anios: { inicio: anioInicioReal, fin: anioFinReal },
        poblacion,
        fuentePoblacion: fuente,
        vintage,
        limitacion: "Variación > 0 no necesariamente significa más criminalidad — puede ser más denuncias. Población = padrón electoral 2026 (proxy mayores de 18 años). variacionPct se calcula sobre el conteo crudo de denuncias, no sobre la tasa redondeada.",
      },
      evolucion,
      series: seriesConTasa,
    },
  };
}
