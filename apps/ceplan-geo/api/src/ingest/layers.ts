export const TERRITORY_LAYERS = {
  DISTRICT: "geoceplan:cb_limdistx",
  DEPARTMENT: "geoceplan:cb_limdptog",
  PROVINCE: "geoceplan:cb_limprovg",
} as const;

export const INFRASTRUCTURE_LAYERS = {
  AIRPORTS: "geoceplan:cn_aeropuertosx",
  PORTS: "geoceplan:cn_puertosx",
} as const;

export type TerritoryLayerName = (typeof TERRITORY_LAYERS)[keyof typeof TERRITORY_LAYERS];
export type InfrastructureLayerName = (typeof INFRASTRUCTURE_LAYERS)[keyof typeof INFRASTRUCTURE_LAYERS];
