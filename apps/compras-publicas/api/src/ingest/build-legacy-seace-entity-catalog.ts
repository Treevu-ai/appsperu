import { writeFile } from "node:fs/promises";
import path from "node:path";

interface TerritoryTarget {
  ubigeo: string;
  province: string;
  district: string;
  entityName: string;
  entityType: "PROVINCIAL" | "DISTRICT";
  fiscalLookupUbigeo?: string;
  exceptionNote?: string;
}

interface FiscalCandidate {
  ruc: string;
  razonSocial: string;
  estadoContribuyente: string | null;
  condicionDomicilio: string | null;
  ubigeo: string | null;
}

interface CatalogRow extends TerritoryTarget {
  ruc: string | null;
  officialName: string | null;
  fiscalUbigeo: string;
  verification: "CONFIRMED_EXACT" | "CONFIRMED_EXCEPTION" | "REQUIRES_REVIEW";
  candidateCount: number;
}

// Catálogo territorial de 84 distritos de La Libertad. `entityName` es el
// nombre que debe encontrar el padrón para la municipalidad competente: en
// capitales provinciales puede diferir del nombre del distrito (p.ej.
// PACASMAYO / SAN PEDRO DE LLOC).
const TARGETS: TerritoryTarget[] = [
  ["130101","TRUJILLO","TRUJILLO","TRUJILLO","PROVINCIAL"], ["130102","TRUJILLO","EL PORVENIR","EL PORVENIR","DISTRICT"], ["130103","TRUJILLO","FLORENCIA DE MORA","FLORENCIA DE MORA","DISTRICT"], ["130104","TRUJILLO","HUANCHACO","HUANCHACO","DISTRICT"], ["130105","TRUJILLO","LA ESPERANZA","LA ESPERANZA","DISTRICT"], ["130106","TRUJILLO","LAREDO","LAREDO","DISTRICT"], ["130107","TRUJILLO","MOCHE","MOCHE","DISTRICT"], ["130108","TRUJILLO","POROTO","POROTO","DISTRICT"], ["130109","TRUJILLO","SALAVERRY","SALAVERRY","DISTRICT"], ["130110","TRUJILLO","SIMBAL","SIMBAL","DISTRICT"], ["130111","TRUJILLO","VICTOR LARCO HERRERA","VICTOR LARCO HERRERA","DISTRICT"], ["130112","TRUJILLO","ALTO TRUJILLO","ALTO TRUJILLO","DISTRICT","130102","El padrón devuelve el domicilio fiscal bajo 130102; la asignación territorial 130112 se conserva del catálogo MEF."],
  ["130201","ASCOPE","ASCOPE","ASCOPE","PROVINCIAL"], ["130202","ASCOPE","CHICAMA","CHICAMA","DISTRICT"], ["130203","ASCOPE","CHOCOPE","CHOCOPE","DISTRICT"], ["130204","ASCOPE","MAGDALENA DE CAO","MAGDALENA DE CAO","DISTRICT"], ["130205","ASCOPE","PAIJAN","PAIJAN","DISTRICT"], ["130206","ASCOPE","RAZURI","RAZURI","DISTRICT"], ["130207","ASCOPE","SANTIAGO DE CAO","SANTIAGO DE C","DISTRICT",undefined,"El padrón trunca la razón social como SANTIAGO DE C; el distrito territorial se conserva completo."], ["130208","ASCOPE","CASA GRANDE","CASA GRANDE","DISTRICT"],
  ["130301","BOLIVAR","BOLIVAR","BOLIVAR","PROVINCIAL"], ["130302","BOLIVAR","BAMBAMARCA","BAMBAMARCA","DISTRICT"], ["130303","BOLIVAR","CONDORMARCA","CONDORMARCA","DISTRICT"], ["130304","BOLIVAR","LONGOTEA","LONGOTEA","DISTRICT"], ["130305","BOLIVAR","UCHUMARCA","UCHUMARCA","DISTRICT"], ["130306","BOLIVAR","UCUNCHA","UCUNCHA","DISTRICT"],
  ["130401","CHEPEN","CHEPEN","CHEPEN","PROVINCIAL"], ["130402","CHEPEN","PACANGA","PACANGA","DISTRICT"], ["130403","CHEPEN","PUEBLO NUEVO","PUEBLO NUEVO","DISTRICT"],
  ["130501","JULCAN","JULCAN","JULCAN","PROVINCIAL"], ["130502","JULCAN","CALAMARCA","CALAMARCA","DISTRICT"], ["130503","JULCAN","CARABAMBA","CARABAMBA","DISTRICT"], ["130504","JULCAN","HUASO","HUASO","DISTRICT","130501","El padrón devuelve el domicilio fiscal bajo 130501; la asignación territorial 130504 se conserva del catálogo MEF."],
  ["130601","OTUZCO","OTUZCO","OTUZCO","PROVINCIAL"], ["130602","OTUZCO","AGALLPAMPA","AGALLPAMPA","DISTRICT"], ["130604","OTUZCO","CHARAT","CHARAT","DISTRICT"], ["130605","OTUZCO","HUARANCHAL","HUARANCHAL","DISTRICT"], ["130606","OTUZCO","LA CUESTA","LA CUESTA","DISTRICT"], ["130608","OTUZCO","MACHE","MACHE","DISTRICT"], ["130610","OTUZCO","PARANDAY","PARANDAY","DISTRICT"], ["130611","OTUZCO","SALPO","SALPO","DISTRICT"], ["130613","OTUZCO","SINSICAP","SINSICAP","DISTRICT"], ["130614","OTUZCO","USQUIL","USQUIL","DISTRICT"],
  ["130701","PACASMAYO","SAN PEDRO DE LLOC","PACASMAYO","PROVINCIAL"], ["130702","PACASMAYO","GUADALUPE","GUADALUPE","DISTRICT"], ["130703","PACASMAYO","JEQUETEPEQUE","JEQUETEPEQUE","DISTRICT"], ["130704","PACASMAYO","PACASMAYO","PACASMAYO","DISTRICT"], ["130705","PACASMAYO","SAN JOSE","SAN JOSE","DISTRICT"],
  ["130801","PATAZ","TAYABAMBA","PATAZ","PROVINCIAL"], ["130802","PATAZ","BULDIBUYO","BULDIBUYO","DISTRICT"], ["130803","PATAZ","CHILLIA","CHILLIA","DISTRICT"], ["130804","PATAZ","HUANCASPATA","HUANCASPATA","DISTRICT"], ["130805","PATAZ","HUAYLILLAS","HUAYLILLAS","DISTRICT"], ["130806","PATAZ","HUAYO","HUAYO","DISTRICT"], ["130807","PATAZ","ONGON","ONGON","DISTRICT"], ["130808","PATAZ","PARCOY","PARCOY","DISTRICT"], ["130809","PATAZ","PATAZ","PATAZ","DISTRICT"], ["130810","PATAZ","PIAS","PIAS","DISTRICT"], ["130811","PATAZ","SANTIAGO DE CHALLAS","SANTIAGO DE CHALLAS","DISTRICT"], ["130812","PATAZ","TAURIJA","TAURIJA","DISTRICT"], ["130813","PATAZ","URPAY","URPAY","DISTRICT"],
  ["130901","SANCHEZ CARRION","HUAMACHUCO","SANCHEZ CARRION","PROVINCIAL"], ["130902","SANCHEZ CARRION","CHUGAY","CHUGAY","DISTRICT"], ["130903","SANCHEZ CARRION","COCHORCO","COCHORCO","DISTRICT"], ["130904","SANCHEZ CARRION","CURGOS","CURGOS","DISTRICT"], ["130905","SANCHEZ CARRION","MARCABAL","MARCABAL","DISTRICT"], ["130906","SANCHEZ CARRION","SANAGORAN","SANAGORAN","DISTRICT"], ["130907","SANCHEZ CARRION","SARIN","SARIN","DISTRICT"], ["130908","SANCHEZ CARRION","SARTIMBAMBA","SARTIMBAMBA","DISTRICT"],
  ["131001","SANTIAGO DE CHUCO","SANTIAGO DE CHUCO","SANTIAGO DE CHUCO","PROVINCIAL"], ["131002","SANTIAGO DE CHUCO","ANGASMARCA","ANGASMARCA","DISTRICT"], ["131003","SANTIAGO DE CHUCO","CACHICADAN","CACHICADAN","DISTRICT"], ["131004","SANTIAGO DE CHUCO","MOLLEBAMBA","MOLLEBAMBA","DISTRICT"], ["131005","SANTIAGO DE CHUCO","MOLLEPATA","MOLLEPATA","DISTRICT"], ["131006","SANTIAGO DE CHUCO","QUIRUVILCA","QUIRUVILCA","DISTRICT"], ["131007","SANTIAGO DE CHUCO","SANTA CRUZ DE CHUCA","SANTA CRUZ DE CHUCA","DISTRICT"], ["131008","SANTIAGO DE CHUCO","SITABAMBA","SITABAMBA","DISTRICT"],
  ["131101","GRAN CHIMU","CASCAS","GRAN CHIMU","PROVINCIAL"], ["131102","GRAN CHIMU","LUCMA","LUCMA","DISTRICT"], ["131103","GRAN CHIMU","MARMOT","MARMOT","DISTRICT"], ["131104","GRAN CHIMU","SAYAPULLO","SAYAPULLO","DISTRICT"],
  ["131201","VIRU","VIRU","VIRU","PROVINCIAL"], ["131202","VIRU","CHAO","CHAO","DISTRICT"], ["131203","VIRU","GUADALUPITO","GUADALUPITO","DISTRICT"],
].map(([ubigeo, province, district, entityName, entityType, fiscalLookupUbigeo, exceptionNote]) => ({
  ubigeo: ubigeo!, province: province!, district: district!, entityName: entityName!, entityType: entityType as TerritoryTarget["entityType"], fiscalLookupUbigeo, exceptionNote,
}));

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/MUNICIPALIDAD|PROVINC\w*|DISTRITAL|DISTRITO|DIST\.?|DE|DEL|LA|EL|LOS|LAS/g, " ")
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function isExpectedType(candidate: FiscalCandidate, expected: TerritoryTarget["entityType"]): boolean {
  const name = normalizeName(candidate.razonSocial);
  // Se evalúa sobre el texto original porque normalizeName retira los tipos.
  return expected === "PROVINCIAL" ? /MUNICIPALIDAD\s+PROVINC/i.test(candidate.razonSocial) : /MUNICIPALIDAD\s+(DISTRITAL|DIST\b|DE\s)/i.test(candidate.razonSocial) && !/CENTRO\s+POBLADO|PROVINC/i.test(name);
}

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function candidatesFor(target: TerritoryTarget, apiBase: string): Promise<FiscalCandidate[]> {
  const ubigeo = target.fiscalLookupUbigeo ?? target.ubigeo;
  const url = new URL("/api/contribuyentes", apiBase);
  url.searchParams.set("ubigeo", ubigeo);
  url.searchParams.set("razonSocial", "MUNICIPALIDAD");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Identidad fiscal devolvió ${response.status} para ${ubigeo}.`);
  const body = await response.json() as { resultados?: FiscalCandidate[] };
  return body.resultados ?? [];
}

async function buildCatalog(apiBase: string): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  for (const target of TARGETS) {
    const candidates = await candidatesFor(target, apiBase);
    const sameName = candidates.filter((candidate) => normalizeName(candidate.razonSocial) === normalizeName(target.entityName));
    const typed = sameName.filter((candidate) => isExpectedType(candidate, target.entityType));
    const selected = typed.length === 1 ? typed[0] : sameName.length === 1 ? sameName[0] : null;
    rows.push({
      ...target, ruc: selected?.ruc ?? null, officialName: selected?.razonSocial ?? null,
      fiscalUbigeo: target.fiscalLookupUbigeo ?? target.ubigeo,
      verification: selected ? (target.fiscalLookupUbigeo || target.exceptionNote ? "CONFIRMED_EXCEPTION" : "CONFIRMED_EXACT") : "REQUIRES_REVIEW",
      candidateCount: candidates.length,
    });
  }
  return rows;
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const output = path.resolve(outputIndex >= 0 ? args[outputIndex + 1] ?? "" : "fixtures/la-libertad-legacy-seace-entities.csv");
const apiBase = process.env.IDENTIDAD_FISCAL_API_URL ?? "http://127.0.0.1:4006";
const catalog = await buildCatalog(apiBase);
const confirmed = catalog.filter((row) => row.verification !== "REQUIRES_REVIEW");
const headers = "ruc,official_name,department,province,district,ubigeo,verification,fiscal_ubigeo,exception_note";
const csv = [headers, ...confirmed.map((row) => [row.ruc, row.officialName, "LA LIBERTAD", row.province, row.district, row.ubigeo, row.verification, row.fiscalUbigeo, row.exceptionNote].map(csvCell).join(","))].join("\n");
await writeFile(output, csv, "utf8");
console.log(JSON.stringify({ output, expectedDistricts: TARGETS.length, confirmed: confirmed.length, exceptions: confirmed.filter((row) => row.verification === "CONFIRMED_EXCEPTION").map((row) => ({ ubigeo: row.ubigeo, ruc: row.ruc, note: row.exceptionNote })), requiresReview: catalog.filter((row) => row.verification === "REQUIRES_REVIEW").map((row) => ({ ubigeo: row.ubigeo, district: row.district, candidateCount: row.candidateCount })) }, null, 2));
