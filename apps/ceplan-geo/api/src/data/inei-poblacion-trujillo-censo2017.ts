/**
 * Población por UBIGEO — Censo Nacional 2017 (INEI).
 * Fuente: Resultados Censales Nacionales 2017, provincia Trujillo, La Libertad.
 * Solo distritos de la provincia Trujillo para comparaciones intra-provincia.
 */
export type PopulationRecord = {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  poblacion: number;
  fuente: string;
  vintage: string;
};

export const TRUJILLO_PROVINCE_POPULATION_CENSO_2017: PopulationRecord[] = [
  { ubigeo: "130101", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "TRUJILLO", poblacion: 286549, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130102", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "EL PORVENIR", poblacion: 191025, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130103", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "FLORENCIA DE MORA", poblacion: 42209, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130104", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "HUANCHACO", poblacion: 78285, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130105", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "LA ESPERANZA", poblacion: 151845, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130106", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "LAREDO", poblacion: 25691, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130107", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "MOCHE", poblacion: 29641, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130108", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "POROTO", poblacion: 1642, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130109", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "SALAVERRY", poblacion: 10731, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130110", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "SIMBAL", poblacion: 5898, fuente: "INEI Censo 2017", vintage: "2017" },
  { ubigeo: "130111", departamento: "LA LIBERTAD", provincia: "TRUJILLO", distrito: "VICTOR LARCO HERRERA", poblacion: 130706, fuente: "INEI Censo 2017", vintage: "2017" },
];
