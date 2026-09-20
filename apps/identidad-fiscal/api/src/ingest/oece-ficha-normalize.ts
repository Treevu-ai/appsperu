/**
 * Parser de la respuesta de `ficha-proveedor-cns/1.0/ficha/{ruc}/resumen`
 * del Buscador de Proveedores del Estado (OECE, ex-OSCE). Confirmado en
 * vivo el 2026-09-20 contra ACOPAGRO (20404057805): `conformacion.socios`
 * viene vacío para cooperativas (el modelo de "socios/accionistas" es de
 * personería societaria tipo S.A.C., no de cooperativas) — el shape exacto
 * de sus campos NO está confirmado en vivo, solo inferido por simetría con
 * `representantes`/`organosAdm`. Ver docs/data-contracts/oece-ficha-proveedor.md.
 */

interface RawPersona {
  nroDocumento?: string | null;
  razonSocial?: string | null;
  apellidosNomb?: string | null;
  idTipoOrgano?: number | null;
  descTipoOrgano?: string | null;
  idCargo?: number | null;
  descCargo?: string | null;
  fechaIngreso?: string | null;
  idRepresentante?: number;
  idOrgano?: number;
  idSocio?: number;
}

interface RawResumen {
  datosSunat?: {
    ruc?: string | null;
    razon?: string | null;
    tipoEmpresa?: string | null;
    estado?: string | null;
    condicion?: string | null;
    departamento?: string | null;
    provincia?: string | null;
    distrito?: string | null;
  } | null;
  conformacion?: {
    proveedor?: { codigoRegistro?: string | null } | null;
    socios?: RawPersona[] | null;
    representantes?: RawPersona[] | null;
    organosAdm?: RawPersona[] | null;
  } | null;
}

export interface OeceFicha {
  ruc: string;
  razonSocial: string | null;
  tipoEmpresa: string | null;
  estadoSunat: string | null;
  condicionSunat: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  codigoRegistro: string | null;
}

export interface OecePersona {
  rol: "REPRESENTANTE" | "ORGANO_ADMINISTRACION" | "SOCIO";
  sourceId: number;
  dni: string | null;
  nombre: string;
  tipoOrgano: string | null;
  cargo: string | null;
  fechaIngreso: string | null;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" || trimmed === "null" ? null : trimmed;
}

/** `"DD/MM/YYYY"` -> `"YYYY-MM-DD"`, o null si no matchea el formato. */
function parseFechaDDMMYYYY(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseOeceFicha(ruc: string, raw: RawResumen): OeceFicha {
  const s = raw.datosSunat;
  return {
    ruc,
    razonSocial: emptyToNull(s?.razon),
    tipoEmpresa: emptyToNull(s?.tipoEmpresa),
    estadoSunat: emptyToNull(s?.estado),
    condicionSunat: emptyToNull(s?.condicion),
    departamento: emptyToNull(s?.departamento),
    provincia: emptyToNull(s?.provincia),
    distrito: emptyToNull(s?.distrito),
    codigoRegistro: emptyToNull(raw.conformacion?.proveedor?.codigoRegistro),
  };
}

function mapPersona(
  rol: "REPRESENTANTE" | "ORGANO_ADMINISTRACION" | "SOCIO",
  raw: RawPersona
): OecePersona | null {
  const sourceId = raw.idRepresentante ?? raw.idOrgano ?? raw.idSocio;
  if (sourceId === undefined) return null;
  const nombre = emptyToNull(raw.razonSocial ?? raw.apellidosNomb);
  if (nombre === null) return null;

  return {
    rol,
    sourceId,
    dni: emptyToNull(raw.nroDocumento),
    nombre,
    tipoOrgano: emptyToNull(raw.descTipoOrgano),
    cargo: emptyToNull(raw.descCargo),
    fechaIngreso: parseFechaDDMMYYYY(raw.fechaIngreso),
  };
}

export function parseOecePersonas(raw: RawResumen): OecePersona[] {
  const conf = raw.conformacion;
  if (!conf) return [];

  const personas: OecePersona[] = [];
  for (const r of conf.representantes ?? []) {
    const p = mapPersona("REPRESENTANTE", r);
    if (p) personas.push(p);
  }
  for (const r of conf.organosAdm ?? []) {
    const p = mapPersona("ORGANO_ADMINISTRACION", r);
    if (p) personas.push(p);
  }
  for (const r of conf.socios ?? []) {
    const p = mapPersona("SOCIO", r);
    if (p) personas.push(p);
  }
  return personas;
}
