/**
 * Mapeo de columnas del CSV del MEF al modelo canónico.
 *
 * Confirmado el 2026-08-16 contra el diccionario oficial y una ingesta real
 * (docs/data-contracts/mef-presupuesto-ejecucion.md, vía
 * Gastos_Diccionario.csv del portal + `2026-Gasto-Mensual.csv` real). El
 * ancho/relleno de los códigos de departamento/provincia/distrito (ver
 * `buildUbigeo`) quedó confirmado al observar un ubigeo real (`010101`)
 * producido durante la ingesta.
 */

export interface MefFieldMapping {
  entityCode: string;
  entityName: string;
  nivelGobierno: string;
  funcion: string;
  departamentoCodigo: string;
  departamentoNombre: string;
  provinciaCodigo: string;
  provinciaNombre: string;
  distritoCodigo: string;
  distritoNombre: string;
  /** A dónde se dirige el gasto (solo nivel departamento) — distinto de dónde
   * tiene sede la entidad ejecutora. Relevante para programas nacionales con
   * sede en Lima que ejecutan metas en otros departamentos. */
  metaDepartamentoNombre: string;
  /** Clasificación económica de primer nivel del gasto (personal, bienes y
   * servicios, inversión, etc.) — ver ADR-0006 Decisión 1. Nivel más alto de
   * la jerarquía GENERICA→SUBGENERICA→...→ESPECIFICA_DET; los niveles más
   * finos existen en el CSV pero no se ingieren (sin caso de uso hoy). */
  generica: string;
  genericaNombre: string;
  /** Nombre real del proyecto/actividad/obra — el nivel de detalle que
   * confirma QUÉ construye una entidad, no solo bajo qué función/genérica
   * cae (ej. "RECUPERACION DE HOSPITALES" para ANIN). Se usa en
   * `budget_execution_proyectos`, no en el modelo agregado principal. */
  proyectoNombre: string;
  programaPptoNombre: string;
  anioFiscal: string;
  pia: string;
  pim: string;
  devengado: string;
}

export const CONFIRMED_MEF_FIELD_MAPPING: MefFieldMapping = {
  entityCode: "SEC_EJEC",
  entityName: "EJECUTORA_NOMBRE",
  nivelGobierno: "NIVEL_GOBIERNO_NOMBRE",
  funcion: "FUNCION_NOMBRE",
  departamentoCodigo: "DEPARTAMENTO_EJECUTORA",
  departamentoNombre: "DEPARTAMENTO_EJECUTORA_NOMBRE",
  provinciaCodigo: "PROVINCIA_EJECUTORA",
  provinciaNombre: "PROVINCIA_EJECUTORA_NOMBRE",
  distritoCodigo: "DISTRITO_EJECUTORA",
  distritoNombre: "DISTRITO_EJECUTORA_NOMBRE",
  metaDepartamentoNombre: "DEPARTAMENTO_META_NOMBRE",
  generica: "GENERICA",
  genericaNombre: "GENERICA_NOMBRE",
  proyectoNombre: "ACTIVIDAD_ACCION_OBRA_NOMBRE",
  programaPptoNombre: "PROGRAMA_PPTO_NOMBRE",
  anioFiscal: "ANO_EJE",
  pia: "MONTO_PIA",
  pim: "MONTO_PIM",
  devengado: "MONTO_DEVENGADO",
};

/**
 * Combina los 3 códigos separados del MEF en un UBIGEO de 6 dígitos.
 * Formato confirmado contra datos reales (ver comentario del archivo).
 * Devuelve null ante cualquier código faltante o con forma inesperada, en
 * vez de arriesgar un ubigeo incorrecto.
 */
export function buildUbigeo(
  departamento: unknown,
  provincia: unknown,
  distrito: unknown
): string | null {
  const parts = [departamento, provincia, distrito].map((v) => String(v ?? "").trim());
  if (parts.some((p) => p === "")) return null;

  const padded = parts.map((p) => p.padStart(2, "0"));
  if (padded.some((p) => p.length !== 2 || !/^\d{2}$/.test(p))) return null;

  return padded.join("");
}
