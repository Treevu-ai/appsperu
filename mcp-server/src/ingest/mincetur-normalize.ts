/**
 * Normalización y agregación del dataset "Comercio Exterior de Bienes" de
 * MINCETUR (DGIECE). Encabezado REAL verificado en vivo el 2026-10-14 contra
 * `Comercio_exterior_bienes_2024.xlsx`:
 *
 *   A FECHA_CORTE | B FLUJO_COMERCIAL | C ANIO | D MES | E SUBPARTIDA
 *   F DESCRIPCION  | G SECTOR | H TIPO | I CODIGO_PAIS | J DESTINO_ORIGEN
 *   K CONTINENTE   | L BLOQUE_1 | M BLOQUE_2 | N USD_MILLONES | O TM
 *   P CUODE        | Q CODIGO_VIA | R VIA_TRANSPORTE
 *
 * Decisiones de Normalización, todas explícitas:
 * - El archivo es mensual (~631.118 filas por año); se agrega a nivel
 *   (anio, flujo, subpartida, pais, via) sumando USD_MILLONES y TM. El nivel
 *   mensual no se conserva: la agenda de investigación que motiva esta fuente
 *   (desempeño exportador por producto y destino) es anual, y conservar el mes
 *   multiplicaría por 12 el almacenamiento sin uso.
 * - SUBPARTIDA se conserva como texto: es código de 10 dígitos con cero inicial
 *   significativo ("0101210000") — como número perdería el primer dígito.
 * - Los números vienen con decimal en coma y separador de miles punto
 *   ("1.234,5"): `parseNumeroEs` los convierte sin inventar valor.
 * - FECHA_CORTE es única por archivo (la del snapshot de la fuente) y se guarda
 *   como texto YYYYMMDD tal cual.
 */
import { parseRowCells } from "./xlsx-rows.js";

export interface ComercioBienesFila {
  fechaCorte: string;
  flujo: string;
  anio: number;
  mes: number | null;
  subpartida: string;
  descripcion: string;
  sector: string;
  tipo: string;
  paisCodigo: string;
  paisNombre: string;
  continente: string;
  bloque1: string;
  bloque2: string;
  cuode: string;
  viaCodigo: string;
  viaNombre: string;
  usdMillones: number | null;
  tm: number | null;
}

/** Fila agregada a nivel (anio, flujo, subpartida, pais, via). */
export interface ComercioBienesAgregada {
  anio: number;
  flujo: string;
  subpartida: string;
  descripcion: string;
  sector: string;
  tipo: string;
  paisCodigo: string;
  paisNombre: string;
  continente: string;
  bloque1: string;
  bloque2: string;
  cuode: string;
  viaCodigo: string;
  viaNombre: string;
  usdMillones: number;
  tm: number | null;
  filasOrigen: number;
  fechaCorte: string;
}

/** Número en formato español: "0,063" → 0.063; "1.234,5" → 1234.5; "2" → 2. */
export function parseNumeroEs(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const limpio = raw.trim();
  if (limpio === "" || limpio === "-") return null;
  if (!/[0-9]/.test(limpio)) return null;
  const sinMiles = limpio.replace(/\./g, "").replace(",", ".");
  const valor = Number(sinMiles);
  return Number.isFinite(valor) ? valor : null;
}

/** Entero tolerante: "2024" → 2024; "" o basura → null. */
function parseEntero(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const limpio = raw.trim();
  if (!/^\d+$/.test(limpio)) return null;
  return Number(limpio);
}

/** Texto normalizado: recorta y colapsa espacios dobles de la fuente. */
function texto(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Convierte una fila cruda (18 celdas) en la fila normalizada. Devuelve `null`
 * si la fila no tiene la forma mínima exigida (anio, flujo, subpartida y país
 * presentes): una fila incompleta no se agrega a medias.
 */
export function normalizarFila(rowXml: string): ComercioBienesFila | null {
  const c = parseRowCells(rowXml);
  if (c.length < 18) return null;
  const anio = parseEntero(c[2]);
  const flujo = texto(c[1]);
  const subpartida = texto(c[4]);
  const paisCodigo = texto(c[8]);
  if (anio === null || flujo === "" || subpartida === "" || paisCodigo === "") return null;
  return {
    fechaCorte: texto(c[0]),
    flujo,
    anio,
    mes: parseEntero(c[3]),
    subpartida,
    descripcion: texto(c[5]),
    sector: texto(c[6]),
    tipo: texto(c[7]),
    paisCodigo,
    paisNombre: texto(c[9]),
    continente: texto(c[10]),
    bloque1: texto(c[11]),
    bloque2: texto(c[12]),
    cuode: texto(c[15]),
    viaCodigo: texto(c[16]),
    viaNombre: texto(c[17]),
    usdMillones: parseNumeroEs(c[13]),
    tm: parseNumeroEs(c[14]),
  };
}

function clave(f: ComercioBienesFila): string {
  return [f.anio, f.flujo, f.subpartida, f.paisCodigo, f.viaCodigo].join("|");
}

/**
 * Agrega filas normalizadas a nivel (anio, flujo, subpartida, pais, via).
 *
 * Las dimensiones descriptivas (descripcion, sector, bloques, vía) se toman de
 * la primera fila vista para la clave: en esta fuente son funcionalmente
 * dependientes de la clave (mismo subpartida → misma descripción). Los montos
 * se suman; `filasOrigen` cuenta cuántas filas mensuales se fusionaron, para
 * que el dato agregado nunca parezca más granular de lo que es.
 */
export class AgregadorComercio {
  private mapa = new Map<string, ComercioBienesAgregada>();

  add(fila: ComercioBienesFila): void {
    const key = clave(fila);
    const previa = this.mapa.get(key);
    if (!previa) {
      this.mapa.set(key, {
        anio: fila.anio,
        flujo: fila.flujo,
        subpartida: fila.subpartida,
        descripcion: fila.descripcion,
        sector: fila.sector,
        tipo: fila.tipo,
        paisCodigo: fila.paisCodigo,
        paisNombre: fila.paisNombre,
        continente: fila.continente,
        bloque1: fila.bloque1,
        bloque2: fila.bloque2,
        cuode: fila.cuode,
        viaCodigo: fila.viaCodigo,
        viaNombre: fila.viaNombre,
        usdMillones: fila.usdMillones ?? 0,
        tm: fila.tm,
        filasOrigen: 1,
        fechaCorte: fila.fechaCorte,
      });
      return;
    }
    previa.usdMillones += fila.usdMillones ?? 0;
    if (fila.tm !== null) previa.tm = (previa.tm ?? 0) + fila.tm;
    previa.filasOrigen += 1;
    if (fila.fechaCorte > previa.fechaCorte) previa.fechaCorte = fila.fechaCorte;
  }

  get filas(): number {
    return this.mapa.size;
  }

  toArray(): ComercioBienesAgregada[] {
    return [...this.mapa.values()];
  }
}
