/**
 * Formas confirmadas en vivo (2026-08-17) del JSON real de ObservaPerú:
 * https://observaperu.ceplan.gob.pe/assets/data/seguimiento-estrategico/indicadores_priorizados_gestion_estrategica_estado.json
 * — asset estático versionado (`schemaVersion: "observatorio-sye.indicadores.v1"`), no
 * requiere sesión ni formulario. Encontrado inspeccionando las llamadas de red que hace
 * el botón "Descargar (Excel)" del sitio (el Excel se arma client-side desde este JSON).
 */

export interface ObservaObservacionRaw {
  periodo: string;
  valor: number | null;
  unidad?: string;
  nota?: string;
}

export interface ObservaSerieRaw {
  id: string;
  nombre: string;
  filtros?: Record<string, string>;
  observaciones: ObservaObservacionRaw[];
}

export interface ObservaIndicadorRaw {
  id: string;
  codigo: string;
  nombre: string;
  pilar: string;
  dimension: string;
  subdimension: string;
  tipo: string;
  unidad?: { tipo: string; simbolo: string };
  frecuencia: string;
  sentidoDeseable?: string;
  definicion?: string;
  fuente?: { institucion: string; documento: string };
  series: ObservaSerieRaw[];
}

export interface ObservaCollectionRaw {
  schemaVersion: string;
  coleccion: {
    nombre: string;
    pais: string;
    descripcion?: string;
    fuentePrincipal?: { institucion: string; documento: string; anioReferencia: number };
    generadoEn: string;
  };
  indicadores: ObservaIndicadorRaw[];
}

/** Nivel de gobierno que sí se puede cruzar con `radar-ejecucion` (ver data contract). */
export const CROSSREFEABLE_NIVELES_GOBIERNO = new Set(["GN", "GR"]);
