export type ScopeRule = "META_DEPARTAMENTO" | "SEDE_EJECUTORA";

export type SectorSeed = {
  sectorId: string;
  sectorNombre: string;
  entityCode: string;
  entityName: string;
  entityKind: "MINISTERIO" | "ORGANISMO" | "PROGRAMA" | "GOBIERNO_REGIONAL" | "UNIDAD_EJECUTORA";
  nivelGobierno: "GOBIERNO NACIONAL" | "GOBIERNOS REGIONALES";
  scopeRule: ScopeRule;
};

/**
 * Cohorte inicial tomada de los literales `entities.nombre` ya materializados
 * desde MEF. El seeder exige código y literal simultáneamente: si la fuente
 * cambia, no inserta una relación aproximada.
 */
export const INITIAL_SECTOR_SEEDS: SectorSeed[] = [
  { sectorId: "INFRAESTRUCTURA", sectorNombre: "Infraestructura", entityCode: "1750", entityName: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA - ANIN", entityKind: "ORGANISMO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "TRANSPORTE", sectorNombre: "Transporte", entityCode: "1072", entityName: "MINISTERIO DE TRANSPORTES Y COMUNICACIONES-ADMINISTRACION GENERAL", entityKind: "MINISTERIO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "TRANSPORTE", sectorNombre: "Transporte", entityCode: "1078", entityName: "MTC- PRO VIAS NACIONAL", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "TRANSPORTE", sectorNombre: "Transporte", entityCode: "1250", entityName: "MTC- PROVIAS DESCENTRALIZADO", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "VIVIENDA", sectorNombre: "Vivienda y saneamiento", entityCode: "1082", entityName: "MINISTERIO DE VIVIENDA, CONSTRUCCION Y SANEAMIENTO- ADM. GENERAL", entityKind: "MINISTERIO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "VIVIENDA", sectorNombre: "Vivienda y saneamiento", entityCode: "1085", entityName: "PROGRAMA NACIONAL DE SANEAMIENTO URBANO", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "VIVIENDA", sectorNombre: "Vivienda y saneamiento", entityCode: "1443", entityName: "PROGRAMA NACIONAL DE SANEAMIENTO RURAL", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "AGRARIO", sectorNombre: "Desarrollo agrario", entityCode: "155", entityName: "MINISTERIO DE AGRICULTURA-ADMINISTRACION CENTRAL", entityKind: "MINISTERIO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "AGRARIO", sectorNombre: "Desarrollo agrario", entityCode: "160", entityName: "INSTITUTO NACIONAL DE INNOVACION AGRARIA", entityKind: "ORGANISMO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "AGRARIO", sectorNombre: "Desarrollo agrario", entityCode: "157", entityName: "SERVICIO NACIONAL DE SANIDAD AGRARIA-SENASA", entityKind: "ORGANISMO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "AGRARIO", sectorNombre: "Desarrollo agrario", entityCode: "1296", entityName: "PROGRAMA DE DESARROLLO PRODUCTIVO AGRARIO RURAL - AGRORURAL", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "EDUCACION", sectorNombre: "Educación", entityCode: "1253", entityName: "M.E.-PROGRAMA NACIONAL DE INFRAESTRUCTURA  EDUCATIVA", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "EDUCACION", sectorNombre: "Educación", entityCode: "1728", entityName: "PROYECTO ESPECIAL DE INVERSION PUBLICA ESCUELAS BICENTENARIO", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "SALUD", sectorNombre: "Salud", entityCode: "1655", entityName: "PROGRAMA NACIONAL DE INVERSIONES EN SALUD", entityKind: "PROGRAMA", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "SALUD", sectorNombre: "Salud", entityCode: "1091", entityName: "SEGURO INTEGRAL DE SALUD", entityKind: "ORGANISMO", nivelGobierno: "GOBIERNO NACIONAL", scopeRule: "META_DEPARTAMENTO" },
  { sectorId: "REGIONAL_LL", sectorNombre: "Gobierno Regional La Libertad", entityCode: "831", entityName: "REGION LA LIBERTAD-SEDE CENTRAL", entityKind: "GOBIERNO_REGIONAL", nivelGobierno: "GOBIERNOS REGIONALES", scopeRule: "SEDE_EJECUTORA" },
  { sectorId: "TRANSPORTE", sectorNombre: "Transporte", entityCode: "833", entityName: "REGION LA LIBERTAD-TRANSPORTES", entityKind: "UNIDAD_EJECUTORA", nivelGobierno: "GOBIERNOS REGIONALES", scopeRule: "SEDE_EJECUTORA" },
  { sectorId: "AGRARIO", sectorNombre: "Desarrollo agrario", entityCode: "832", entityName: "REGION LA LIBERTAD-AGRICULTURA", entityKind: "UNIDAD_EJECUTORA", nivelGobierno: "GOBIERNOS REGIONALES", scopeRule: "SEDE_EJECUTORA" },
  { sectorId: "SALUD", sectorNombre: "Salud", entityCode: "845", entityName: "REGION LA LIBERTAD-SALUD", entityKind: "UNIDAD_EJECUTORA", nivelGobierno: "GOBIERNOS REGIONALES", scopeRule: "SEDE_EJECUTORA" },
  { sectorId: "EDUCACION", sectorNombre: "Educación", entityCode: "834", entityName: "REGION LA LIBERTAD-EDUCACION", entityKind: "UNIDAD_EJECUTORA", nivelGobierno: "GOBIERNOS REGIONALES", scopeRule: "SEDE_EJECUTORA" },
];

export function scopeLabel(rule: ScopeRule): string {
  return rule === "META_DEPARTAMENTO" ? "Gasto nacional dirigido al departamento" : "Ejecución de unidad con sede regional";
}
