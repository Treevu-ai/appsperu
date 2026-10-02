/**
 * Mapea el `fuente` de un `WithMetadata` (ej. "radar-ejecucion / radar_ejecucion_sector_ficha")
 * a la ficha ROF de la entidad dueña de esa fuente en `docs/normas/` — la base de conocimiento
 * legal (20 entidades) construida en esta misma sesión. Sin esto, esos 20 documentos de
 * investigación no tenían ningún punto de entrada desde el producto: se podía citar fuente/corte/
 * cobertura de un número, pero no el mandato legal exacto que autoriza a esa entidad a publicarlo.
 *
 * Deliberadamente derivado del prefijo de `fuente`, no de un enum de AppKey — cubre los números
 * que ya usan `metaNumber()` hoy sin importar si esa app tiene o no dashboard visual propio (ver
 * la distinción agentic-first vs. dashboard en `types.ts`, `APP_CATALOG`).
 */

export interface MandatoLegal {
  entidad: string;
  url: string;
}

const NORMAS_BASE = "https://github.com/Treevu-ai/appsperu/blob/master/docs/normas";

// Solo las 20 entidades con ROF documentado en docs/normas/README.md — el resto de apps
// (7 de 27) no tiene ficha todavía y queda sin mandatoLegal, no con un link roto.
const ENTIDAD_POR_APP: Record<string, MandatoLegal> = {
  "radar-ejecucion": { entidad: "MEF", url: `${NORMAS_BASE}/mef-rof.md` },
  "radar-inversiones": { entidad: "MEF", url: `${NORMAS_BASE}/mef-rof.md` },
  "compras-publicas": { entidad: "OECE", url: `${NORMAS_BASE}/oece-rof.md` },
  "proveedores-sancionados": { entidad: "OECE", url: `${NORMAS_BASE}/oece-rof.md` },
  "identidad-fiscal": { entidad: "SUNAT", url: `${NORMAS_BASE}/sunat-rof.md` },
  infobras: { entidad: "Contraloría General de la República", url: `${NORMAS_BASE}/contraloria-rof.md` },
  "informes-control": { entidad: "Contraloría General de la República", url: `${NORMAS_BASE}/contraloria-rof.md` },
  "instituciones-educativas": { entidad: "MINEDU", url: `${NORMAS_BASE}/minedu-rof.md` },
  "actividad-agraria": { entidad: "MIDAGRI", url: `${NORMAS_BASE}/midagri-rof.md` },
  "bcrp-comercio-exterior": { entidad: "BCRP", url: `${NORMAS_BASE}/bcrp-rof.md` },
  "bcrp-la-libertad": { entidad: "BCRP", url: `${NORMAS_BASE}/bcrp-rof.md` },
  "seguridad-ciudadana": { entidad: "MININTER", url: `${NORMAS_BASE}/mininter-rof.md` },
  "inversion-privada": { entidad: "PROINVERSIÓN", url: `${NORMAS_BASE}/proinversion-rof.md` },
  "servicios-salud": { entidad: "SUSALUD", url: `${NORMAS_BASE}/susalud-rof.md` },
  "programas-sociales": { entidad: "MIDIS", url: `${NORMAS_BASE}/midis-rof.md` },
  "actividad-empresarial": { entidad: "MTPE", url: `${NORMAS_BASE}/mtpe-rof.md` },
  mindef: { entidad: "MINDEF", url: `${NORMAS_BASE}/mindef-rof.md` },
  mimp: { entidad: "MIMP", url: `${NORMAS_BASE}/mimp-rof.md` },
  renamu: { entidad: "INEI", url: `${NORMAS_BASE}/inei-rof.md` },
  "autoridades-electas": { entidad: "JNE", url: `${NORMAS_BASE}/jne-rof.md` },
  "infracciones-ambientales": { entidad: "OEFA", url: `${NORMAS_BASE}/oefa-rof.md` },
  "red-vial-subnacional": { entidad: "MTC", url: `${NORMAS_BASE}/mtc-rof.md` },
  "infraestructura-mtc": { entidad: "MTC", url: `${NORMAS_BASE}/mtc-rof.md` },
  "residuos-solidos": { entidad: "MINAM", url: `${NORMAS_BASE}/minam-rof.md` },
  "ceplan-estrategico": { entidad: "CEPLAN", url: `${NORMAS_BASE}/ceplan-rof.md` },
  "ceplan-geo": { entidad: "CEPLAN", url: `${NORMAS_BASE}/ceplan-rof.md` },
};

/** `fuente` viene como "<app> / <tool>" o, en algunos casos, solo "<app>". */
export function mandatoLegalFromFuente(fuente: string): MandatoLegal | undefined {
  const appKey = fuente.split("/")[0]?.trim();
  return appKey ? ENTIDAD_POR_APP[appKey] : undefined;
}
