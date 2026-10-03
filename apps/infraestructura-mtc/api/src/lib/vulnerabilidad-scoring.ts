/**
 * Fórmulas del Índice de Vulnerabilidad Portuaria (v1 estructural y v2-tráfico). Módulo puro
 * sin dependencias de DB — extraído de routes/vulnerabilidad-portuaria.ts para que los tests de
 * estas fórmulas puedan correr sin DATABASE_URL (antes quedaban atrapados en el
 * describe.skipIf(!CON_DB) de __tests__/vulnerabilidad.test.ts porque ese archivo importa el
 * router, que importa el pool al tope del módulo).
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
