/**
 * Fórmulas del Índice de Vulnerabilidad Portuaria (v1 estructural, v2-tráfico y v3-OCDE/TBML).
 * Módulo puro sin dependencias de DB — extraído de routes/vulnerabilidad-portuaria.ts para que
 * los tests de estas fórmulas puedan correr sin DATABASE_URL (antes quedaban atrapados en el
 * describe.skipIf(!CON_DB) de __tests__/vulnerabilidad.test.ts porque ese archivo importa el
 * router, que importa el pool al tope del módulo).
 *
 * v1/v2 se dejan exactamente como están (ver docs/metodologia-indice-vulnerabilidad-portuaria.md
 * y docs/indice-vulnerabilidad-trafico-v2.md) — sus resultados ya publicados no cambian. v3 es
 * una fórmula aparte, con rigor metodológico distinto (normalización 0-1 estilo OCDE/JRC Handbook
 * on Constructing Composite Indicators, pesos documentados, análisis de sensibilidad) y una
 * dimensión nueva (TBML vía SUNAT aduanas) que los dos anteriores no tenían. Ver
 * docs/indice-vulnerabilidad-v3-oecd-tbml.md para la justificación completa.
 */

/** Scoring por estado de conservación (0-75) */
function estadoScore(estado: string | null): number {
  switch (estado?.toLowerCase()) {
    case "bueno":
      return 10;
    case "regular":
      return 25;
    case "malo":
      return 50;
    case "muy malo":
      return 75;
    default:
      return 50; // null o desconocido = riesgo alto
  }
}

/** Scoring por concesión (concesionados suelen tener mejor mantenimiento) */
function concesionScore(esConcesionado: boolean | null): number {
  return esConcesionado === true ? 5 : 30;
}

/** Scoring por alcance geográfico */
function alcanceScore(alcance: string | null): number {
  switch (alcance?.toLowerCase()) {
    case "nacional":
      return 5;
    case "regional":
      return 15;
    case "local":
      return 25;
    default:
      return 20;
  }
}

/** Scoring por ámbito */
function ambitoScore(ambito: string | null): number {
  switch (ambito?.toLowerCase()) {
    case "marítimo":
      return 15;
    case "fluvial":
      return 20;
    case "lacustre":
      return 10;
    default:
      return 15;
  }
}

/** Scoring por geolocalización (sin geo no se puede supervisar) */
function geoScore(tieneGeo: boolean): number {
  return tieneGeo ? 0 : 20;
}

/**
 * Calcula el score de vulnerabilidad para un terminal.
 * Fórmula: estado*0.25 + concesion*0.20 + alcance*0.15 + ambito*0.10 + geo*0.10
 */
export function calcularScoreVulnerabilidad(params: {
  estadoConservacion: string | null;
  esConcesionado: boolean | null;
  alcance: string | null;
  ambito: string | null;
  tieneGeolocalizacion: boolean;
}): { score: number; componentes: Record<string, number> } {
  const estadoS = estadoScore(params.estadoConservacion);
  const concesionS = concesionScore(params.esConcesionado);
  const alcanceS = alcanceScore(params.alcance);
  const ambitoS = ambitoScore(params.ambito);
  const geoS = geoScore(params.tieneGeolocalizacion);

  const score =
    estadoS * 0.25 +
    concesionS * 0.20 +
    alcanceS * 0.15 +
    ambitoS * 0.10 +
    geoS * 0.10;

  return {
    score: Math.round(score * 100) / 100,
    componentes: {
      estadoConservacion: estadoS,
      esConcesionado: concesionS,
      alcance: alcanceS,
      ambito: ambitoS,
      tieneGeolocalizacion: geoS,
    },
  };
}

/**
 * Fórmula v2-tráfico (VUL-12, PRD-004 §3 "Paso 2"): extiende el v1 con volumen histórico de
 * carga (peso 20%) y variación 2015→2017 (peso 10%). Terminales sin match en el histórico APN
 * (ver matchTerminalToPuerto en ingest/cargas-portuarias-join.ts) quedan con
 * `volumenScore`/`variacionScore` en null y NO reciben el default "dato faltante = riesgo alto"
 * que sí usan los componentes v1 — la mayoría de los 151 terminales del inventario son
 * embarcaderos pequeños fuera del alcance del anuario 2010-2017 por construcción, no por un
 * vacío de reporte; tratarlos como máximo riesgo aquí duplicaría la señal que ya capturan
 * alcance/ambito bajo otro nombre. Ver apps/infraestructura-mtc/docs/indice-vulnerabilidad-trafico-v2.md.
 */
export function calcularScoreVulnerabilidadTrafico(params: {
  estadoConservacion: string | null;
  esConcesionado: boolean | null;
  alcance: string | null;
  ambito: string | null;
  tieneGeolocalizacion: boolean;
  volumenScore: number | null;
  variacionScore: number | null;
}): { score: number; componentes: Record<string, number | null> } {
  const v1 = calcularScoreVulnerabilidad(params);
  const volumenContribucion = (params.volumenScore ?? 0) * 0.20;
  const variacionContribucion = (params.variacionScore ?? 0) * 0.10;

  return {
    score: Math.round((v1.score + volumenContribucion + variacionContribucion) * 100) / 100,
    componentes: {
      ...v1.componentes,
      volumenHistorico: params.volumenScore,
      variacion3Anios: params.variacionScore,
    },
  };
}

// ─── v3: normalización OCDE + dimensión TBML ───────────────────────────────

/**
 * Máximo posible de cada componente crudo (0-100-ish, heredado de v1/v2) — necesario para
 * rescalar cada uno a [0,1] antes de ponderar (OCDE/JRC Handbook §5, método "re-scaling": todos
 * los indicadores deben llevarse a un rango común antes de agregarlos, porque sumar puntajes de
 * escalas distintas con pesos fijos — lo que hacían v1/v2 — hace que el peso "real" de un
 * componente dependa de su escala, no solo del peso nominal asignado).
 */
export const MAXIMOS_COMPONENTES_V3 = {
  estadoConservacion: 75,
  esConcesionado: 30,
  alcance: 25,
  ambito: 20,
  tieneGeolocalizacion: 20,
  volumenHistorico: 75,
  variacion3Anios: 75,
  tbml: 100, // computeTbmlScore ya devuelve 0-100
} as const;

/**
 * Pesos de v3 (deben sumar 1.00). No se re-ponderaron los 7 componentes heredados de v1/v2 con
 * un criterio nuevo — eso sería una decisión editorial no justificada por ninguna fuente. En vez
 * de eso, se comprimieron proporcionalmente sus pesos nominales de v1/v2 (25/20/15/10/10/20/10,
 * que ya sumaban 110% "nominal" sin normalizar) por un factor 85/110, dejando 15 puntos
 * porcentuales para la dimensión TBML — la única del índice que mide exposición a tráfico
 * ilícito directamente, que es lo que pide PRD-004 §1 y que ni v1 ni v2 miden (ver diagnóstico en
 * docs/indice-vulnerabilidad-v3-oecd-tbml.md §1). El 15% para TBML es una elección deliberada, no
 * derivada de los datos — se documenta como tal, y se valida con análisis de sensibilidad (ver
 * doc) en vez de presentarse como la única ponderación posible.
 */
export const PESOS_V3 = {
  estadoConservacion: 0.1932,
  esConcesionado: 0.1545,
  alcance: 0.1159,
  ambito: 0.0773,
  tieneGeolocalizacion: 0.0773,
  volumenHistorico: 0.1545,
  variacion3Anios: 0.0773,
  tbml: 0.15,
} as const;

/**
 * v3: toma los componentes crudos ya calculados por v1/v2 (sin recalcularlos — reusa
 * `calcularScoreVulnerabilidadTrafico` para no duplicar las reglas de estado/concesión/etc.),
 * los normaliza a [0,1] y les aplica `PESOS_V3`. Score final en 0-100, pero ya NO comparable
 * numéricamente con v1/v2 (que suman puntajes crudos con pesos que no normalizan a 100%) — es
 * una escala distinta, por diseño.
 *
 * `tbmlScore` en `null` (terminal sin match de aduana SUNAT, o aduana sin benchmark robusto para
 * ninguna subpartida) se trata igual que `volumenScore`/`variacionScore` en `null`: contribuye 0,
 * no el default "dato faltante = riesgo alto" de v1 — mismo razonamiento que v2 (ver
 * `calcularScoreVulnerabilidadTrafico` arriba): la ausencia de match con el anuario SUNAT es
 * estructural (la mayoría de los 151 terminales son embarcaderos sin comercio exterior
 * registrado bajo esa aduana), no un vacío de reporte.
 */
export function calcularScoreVulnerabilidadV3(params: {
  estadoConservacion: string | null;
  esConcesionado: boolean | null;
  alcance: string | null;
  ambito: string | null;
  tieneGeolocalizacion: boolean;
  volumenScore: number | null;
  variacionScore: number | null;
  tbmlScore: number | null;
}): { score: number; componentes: Record<string, number | null> } {
  const base = calcularScoreVulnerabilidadTrafico(params);

  const crudos: Record<keyof typeof PESOS_V3, number> = {
    estadoConservacion: base.componentes.estadoConservacion as number,
    esConcesionado: base.componentes.esConcesionado as number,
    alcance: base.componentes.alcance as number,
    ambito: base.componentes.ambito as number,
    tieneGeolocalizacion: base.componentes.tieneGeolocalizacion as number,
    volumenHistorico: params.volumenScore ?? 0,
    variacion3Anios: params.variacionScore ?? 0,
    tbml: params.tbmlScore ?? 0,
  };

  let score = 0;
  const normalizados: Record<string, number> = {};
  for (const key of Object.keys(PESOS_V3) as (keyof typeof PESOS_V3)[]) {
    const normalizado = crudos[key] / MAXIMOS_COMPONENTES_V3[key];
    normalizados[key] = Math.round(normalizado * 1000) / 1000;
    score += normalizado * PESOS_V3[key];
  }

  return {
    score: Math.round(score * 100 * 100) / 100,
    componentes: {
      ...normalizados,
      tbmlCrudo: params.tbmlScore,
      volumenHistoricoCrudo: params.volumenScore,
      variacion3AniosCrudo: params.variacionScore,
    },
  };
}
