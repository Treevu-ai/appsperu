export const TERRITORY_LAYERS = {
  DISTRICT: "geoceplan:cb_limdistx",
  DEPARTMENT: "geoceplan:cb_limdptog",
  PROVINCE: "geoceplan:cb_limprovg",
} as const;

export const INFRASTRUCTURE_LAYERS = {
  AIRPORTS: "geoceplan:cn_aeropuertosx",
  PORTS: "geoceplan:cn_puertosx",
} as const;

/** Red hídrica principal — spike CG-25: 1,744 tramos, AUTOMATIZABLE */
export const HYDRO_LAYERS = {
  PRINCIPAL: "geoceplan:cb_redhidricaprinx",
} as const;

/** Proyectos sectoriales CEPLAN geo — muestra acotada, no reemplaza Invierte.pe */
export const PROJECT_LAYERS = {
  AGRO: "geoceplan:ip_prysecagr",
} as const;

export type TerritoryLayerName = (typeof TERRITORY_LAYERS)[keyof typeof TERRITORY_LAYERS];
export type InfrastructureLayerName = (typeof INFRASTRUCTURE_LAYERS)[keyof typeof INFRASTRUCTURE_LAYERS];
export type HydroLayerName = (typeof HYDRO_LAYERS)[keyof typeof HYDRO_LAYERS];
export type ProjectLayerName = (typeof PROJECT_LAYERS)[keyof typeof PROJECT_LAYERS];

export type InfraType =
  | "aeropuerto"
  | "puerto"
  | "red_hidrica_principal"
  | "proyecto_sectorial_agro";

export const INFRA_TYPE_VALUES = [
  "aeropuerto",
  "puerto",
  "red_hidrica_principal",
  "proyecto_sectorial_agro",
] as const satisfies readonly InfraType[];
