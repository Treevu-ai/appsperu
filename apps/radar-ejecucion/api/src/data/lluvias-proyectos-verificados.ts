/**
 * Evidencia territorial de proyectos de inversión vinculados a lluvias.
 *
 * No se une por semejanza de nombres con `budget_execution_proyectos`: el
 * CSV de gasto mensual del MEF no publica CUI. Esta lista solo conserva
 * relaciones que una fuente pública identifica de manera expresa.
 */
export type ProyectoLluviasVerificado = {
  entidadResponsable: string;
  cui: string;
  actividad: string;
  departamento: string;
  pia2026: number | null;
  pim: number | null;
  devengado: number | null;
  distritoBeneficiado: string[];
  distritoBeneficiadoEstado: string;
  alertaConsistenciaTerritorial: string | null;
  fuentes: Array<{ etiqueta: string; url: string; detalle: string }>;
};

export const PROYECTOS_LLUVIA_VERIFICADOS: ProyectoLluviasVerificado[] = [
  {
    entidadResponsable: "AUTORIDAD NACIONAL DE INFRAESTRUCTURA (ANIN)",
    cui: "2539202",
    actividad:
      "CREACION DEL SERVICIO DE DRENAJE PLUVIAL EN EL AMBITO URBANO DE 5 DISTRITOS DE LA PROVINCIA DE TRUJILLO - DEPARTAMENTO DE LA LIBERTAD",
    departamento: "LA LIBERTAD",
    // Es PIA aprobado por la Ley de Presupuesto 2026, no PIM vigente.
    pia2026: 11_490_390,
    pim: null,
    devengado: null,
    distritoBeneficiado: ["ALTO TRUJILLO", "LA ESPERANZA", "EL PORVENIR", "FLORENCIA DE MORA", "TRUJILLO", "VICTOR LARCO HERRERA"],
    distritoBeneficiadoEstado: "PUBLICADO_POR_ANIN_EN_DOCUMENTO_DEL_CONGRESO",
    alertaConsistenciaTerritorial:
      "El título y la Ley de Presupuesto se refieren a 5 distritos; una presentación de ANIN ante el Congreso enumera 6. ALSOL conserva ambos datos y no reduce ni amplía la lista por inferencia.",
    fuentes: [
      {
        etiqueta: "Ley de Presupuesto 2026, Anexo 5",
        url: "https://www.mef.gob.pe/contenidos/presu_publ/anexos/ppto2026/Anexo_5.PDF",
        detalle: "Identifica el CUI 2539202 y una asignación PIA 2026 de S/ 11,490,390 para el pliego ANIN.",
      },
      {
        etiqueta: "Presentación de ANIN ante la Comisión de Fiscalización del Congreso",
        url: "https://www.congreso.gob.pe/Docs/comisiones2024/Fiscalizacion/files/sesiones_extraordinarias/pre-anin2.pdf",
        detalle: "Identifica el CUI 2539202 y enumera Alto Trujillo, La Esperanza, El Porvenir, Florencia de Mora, Trujillo y Víctor Larco Herrera.",
      },
    ],
  },
];
