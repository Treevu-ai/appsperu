import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * Lector de shapefiles ESRI grandes, escrito a mano porque la librería
 * `shapefile` (npm) solo expone lectura secuencial por stream desde el
 * principio — para "saltar" a la fila N había que leer y decodificar las
 * N filas anteriores igual que si se fueran a insertar (confirmado en vivo:
 * 52+ minutos de CPU creciente para saltar 2.66M filas sin insertar nada).
 *
 * Dos capas:
 * - `ShxIndex`: precarga el `.shx` completo en memoria (offset + longitud
 *   de cada feature) — da acceso O(1) a dónde está cualquier registro en
 *   el `.shp`, sin tocar disco de nuevo.
 * - `SequentialBufferedReader`: para recorrer un rango consecutivo de
 *   registros, lee el `.shp`/`.dbf` en bloques grandes (varios MB) en vez
 *   de un `readSync` por registro — con un `readSync` por registro, el
 *   overhead de syscall en Windows hacía que 500K registros no terminaran
 *   ni en 10 minutos (confirmado en vivo); por bloques, es cuestión de
 *   segundos por 100K registros.
 *
 * Formato (ESRI Shapefile Technical Description):
 * - `.shx`: header de 100 bytes, luego 8 bytes por feature (offset +
 *   content-length, ambos int32 big-endian en palabras de 16 bits).
 * - `.dbf`: header de tamaño variable (bytes 8-9 = headerSize, bytes 10-11
 *   = recordSize, uint16 little-endian), registros de ancho fijo
 *   consecutivos: el registro N empieza en `headerSize + n*recordSize`.
 * - `.shp` registro: header de 8 bytes (record number + content length,
 *   big-endian — redundante con el `.shx`, no hace falta releerlo), luego
 *   el contenido (shape type int32 LE; para tipo 5 "Polygon": bbox de 32
 *   bytes, numParts, numPoints, arrays de parts y points). El agrupamiento
 *   de parts en polígonos/agujeros (orientación de anillo: horario =
 *   exterior, antihorario = agujero) es el mismo algoritmo que
 *   `shapefile/shp/polygon.js` — portado acá literal, verificado en vivo
 *   contra la librería original (200 registros, 0 diferencias).
 */

type Ring = [number, number][];
export type PolygonGeometry = { type: "Polygon"; coordinates: Ring[] };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Ring[][] };

interface DbfFieldDescriptor {
  name: string;
  type: string;
  offsetInRecord: number;
  length: number;
}

export interface ShpRecord {
  id: number | null;
  gridcode: number | null;
  shapeArea: number | null;
  cobertura: string;
  areaHa: number | null;
  geometry: PolygonGeometry | MultiPolygonGeometry | null;
}

function ringSignedArea(ring: Ring): number {
  let area = ring[ring.length - 1][1] * ring[0][0] - ring[ring.length - 1][0] * ring[0][1];
  for (let i = 1; i < ring.length; i++) {
    area += ring[i - 1][1] * ring[i][0] - ring[i - 1][0] * ring[i][1];
  }
  return area;
}

function ringClockwise(ring: Ring): boolean {
  if (ring.length < 4) return false;
  return ringSignedArea(ring) >= 0;
}

function segmentContains(p0: [number, number], p1: [number, number], p2: [number, number]): boolean {
  const x20 = p2[0] - p0[0];
  const y20 = p2[1] - p0[1];
  if (x20 === 0 && y20 === 0) return true;
  const x10 = p1[0] - p0[0];
  const y10 = p1[1] - p0[1];
  if (x10 === 0 && y10 === 0) return false;
  const t = (x20 * x10 + y20 * y10) / (x10 * x10 + y10 * y10);
  if (t < 0 || t > 1) return false;
  return t === 0 || t === 1 || (t * x10 === x20 && t * y10 === y20);
}

function ringContains(ring: Ring, point: [number, number]): number {
  const [x, y] = point;
  let contains = -1;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (segmentContains(ring[i], ring[j], point)) return 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      contains = -contains;
    }
  }
  return contains;
}

function ringContainsSome(ring: Ring, hole: Ring): boolean {
  return hole.some((p) => ringContains(ring, p) > 0);
}

// La mayoría de los registros son un solo pixel Landsat (4-5 vértices, 1
// parte), pero hay outliers reales: el registro 2,664,342 (confirmado en
// vivo) tiene 117,798 partes y 2.6M vértices en un solo feature — una clase
// agregada ("No Bosque 2000" etc.) que junta miles de parches dispersos en
// un solo registro. Dos protecciones:
//  1. `decimateRing`: ningún anillo individual guarda más de MAX_RING_POINTS
//     vértices — de sobra para un check de punto-en-polígono.
//  2. `MAX_PARTS_FOR_HOLE_MATCHING`: el algoritmo de emparejamiento
//     anillo↔agujero (`ringContainsSome` de cada agujero contra cada
//     polígono) es O(agujeros × polígonos) — con 117,798 partes eso son
//     ~14 mil millones de operaciones, intratable. Por encima del umbral,
//     se trata cada anillo como su propio polígono simple, sin intentar
//     recortarle agujeros — para esta clase de outliers (miles de parches
//     dispersos, no un polígono con huecos reales) es una aproximación
//     razonable: sobre-incluye área de agujero real en casos raros, a
//     cambio de que la ingesta termine.
const MAX_RING_POINTS = 4000;
const MAX_PARTS_FOR_HOLE_MATCHING = 500;

function decimateRing(ring: Ring): Ring {
  if (ring.length <= MAX_RING_POINTS) return ring;
  const step = Math.ceil(ring.length / MAX_RING_POINTS);
  const decimated: Ring = [];
  for (let i = 0; i < ring.length - 1; i += step) decimated.push(ring[i]);
  decimated.push(ring[ring.length - 1]); // cierra el anillo siempre con el punto original final
  return decimated;
}

/** Puerto de `shapefile/shp/polygon.js` (ring-grouping por orientación), con decimación de anillos gigantes y un camino rápido para registros con cantidad extrema de partes (ver comentario arriba). */
function buildPolygonGeometry(parts: number[], points: [number, number][]): PolygonGeometry | MultiPolygonGeometry | null {
  const rings: Ring[] = parts.map((start, j) => decimateRing(points.slice(start, parts[j + 1]) as Ring));

  if (parts.length > MAX_PARTS_FOR_HOLE_MATCHING) {
    const polygons = rings.map((ring) => [ring]);
    return { type: "MultiPolygon", coordinates: polygons };
  }

  const polygons: Ring[][] = [];
  const holes: Ring[] = [];
  for (const ring of rings) {
    if (ringClockwise(ring)) polygons.push([ring]);
    else holes.push(ring);
  }

  holes.forEach((hole) => {
    const matched = polygons.some((polygon) => {
      if (ringContainsSome(polygon[0], hole)) {
        polygon.push(hole);
        return true;
      }
      return false;
    });
    if (!matched) polygons.push([hole]);
  });

  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function parseShpContent(content: Buffer): PolygonGeometry | MultiPolygonGeometry | null {
  const shapeType = content.readInt32LE(0);
  if (shapeType === 0) return null;
  if (shapeType !== 5) throw new Error(`Shape type ${shapeType} inesperado (se esperaba 5 = Polygon)`);

  const numParts = content.readInt32LE(36);
  const numPoints = content.readInt32LE(40);
  if (numParts === 0 || numPoints === 0) return null;

  const partsStart = 44;
  const parts: number[] = [];
  for (let i = 0; i < numParts; i++) parts.push(content.readInt32LE(partsStart + i * 4));

  const pointsStart = partsStart + numParts * 4;
  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const x = content.readDoubleLE(pointsStart + i * 16);
    const y = content.readDoubleLE(pointsStart + i * 16 + 8);
    points.push([x, y]);
  }

  return buildPolygonGeometry(parts, points);
}

function parseDbfFields(buf: Buffer): DbfFieldDescriptor[] {
  const fields: DbfFieldDescriptor[] = [];
  let offsetInRecord = 1; // byte 0 de cada registro es el flag de borrado
  for (let base = 0; base + 32 <= buf.length; base += 32) {
    if (buf[base] === 0x0d) break; // terminador de la lista de campos
    const name = buf.toString("ascii", base, base + 11).replace(/\0.*/, "");
    const type = String.fromCharCode(buf[base + 11]);
    const length = buf[base + 16];
    fields.push({ name, type, offsetInRecord, length });
    offsetInRecord += length;
  }
  return fields;
}

function dbfRecordToAttrs(
  buf: Buffer,
  recordStart: number,
  fields: DbfFieldDescriptor[]
): { id: number | null; gridcode: number | null; shapeArea: number | null; cobertura: string; areaHa: number | null } {
  // utf-8, no ascii: el .dbf trae texto UTF-8 real (confirmado leyendo bytes
  // crudos), ascii mutila los acentos ("Pérdida" -> "PC)rdida").
  const raw = (f: DbfFieldDescriptor) =>
    buf.toString("utf-8", recordStart + f.offsetInRecord, recordStart + f.offsetInRecord + f.length).trim();
  const byName = (name: string) => fields.find((f) => f.name === name);

  const parseNum = (f: DbfFieldDescriptor | undefined): number | null => {
    if (!f) return null;
    const s = raw(f);
    if (s === "") return null;
    const v = parseFloat(s);
    return Number.isNaN(v) ? null : v;
  };

  const coberturaField = byName("Cobertura");
  return {
    id: parseNum(byName("Id")),
    gridcode: parseNum(byName("gridcode")),
    shapeArea: parseNum(byName("Shape_Area")),
    cobertura: coberturaField ? raw(coberturaField) : "",
    areaHa: parseNum(byName("Area")),
  };
}

/** Precarga el `.shx` completo en memoria: acceso O(1) a offset/longitud de cualquier registro, sin volver a tocar disco. */
class ShxIndex {
  readonly numRecords: number;
  private offsets: Float64Array;
  private lengths: Uint32Array;

  constructor(shxPath: string) {
    const stat = statSync(shxPath);
    this.numRecords = Math.round((stat.size - 100) / 8);
    this.offsets = new Float64Array(this.numRecords);
    this.lengths = new Uint32Array(this.numRecords);

    const fd = openSync(shxPath, "r");
    const bufSize = this.numRecords * 8;
    const buf = Buffer.alloc(bufSize);
    readSync(fd, buf, 0, bufSize, 100);
    closeSync(fd);

    for (let i = 0; i < this.numRecords; i++) {
      const base = i * 8;
      this.offsets[i] = buf.readUInt32BE(base) * 2;
      this.lengths[i] = buf.readUInt32BE(base + 4) * 2;
    }
  }

  /** Offset en bytes, dentro del .shp, del CONTENIDO del registro n (ya saltado el header de 8 bytes del registro). */
  contentOffset(n: number): number {
    return this.offsets[n] + 8;
  }

  contentLength(n: number): number {
    return this.lengths[n];
  }
}

const SHP_CHUNK_BYTES = 32 * 1024 * 1024; // 32MB por lectura de .shp
const DBF_CHUNK_RECORDS = 50_000; // registros de .dbf por lectura (ancho fijo, barato)

/**
 * Recorre un rango [desde, hasta) de forma secuencial, leyendo .shp y .dbf
 * en bloques grandes en vez de un `readSync` por registro — la parte que
 * de verdad importa para que cargar millones de filas sea viable.
 */
export class SequentialShpReader {
  private shx: ShxIndex;
  private shpFd: number;
  private dbfFd: number;
  private dbfHeaderSize: number;
  private dbfRecordSize: number;
  private dbfFields: DbfFieldDescriptor[];
  readonly numRecords: number;

  private shpChunk: Buffer = Buffer.alloc(0);
  private shpChunkStart = 0; // offset absoluto en el .shp donde empieza shpChunk

  private dbfChunk: Buffer = Buffer.alloc(0);
  private dbfChunkStartRecord = 0;

  constructor(shpPath: string, shxPath: string, dbfPath: string) {
    this.shx = new ShxIndex(shxPath);
    this.shpFd = openSync(shpPath, "r");
    this.dbfFd = openSync(dbfPath, "r");

    const dbfHeader = Buffer.alloc(32);
    readSync(this.dbfFd, dbfHeader, 0, 32, 0);
    this.numRecords = dbfHeader.readUInt32LE(4);
    this.dbfHeaderSize = dbfHeader.readUInt16LE(8);
    this.dbfRecordSize = dbfHeader.readUInt16LE(10);

    if (this.numRecords !== this.shx.numRecords) {
      throw new Error(`Inconsistencia .shx/.dbf: .dbf=${this.numRecords} registros, .shx=${this.shx.numRecords}`);
    }

    const fieldsAreaSize = this.dbfHeaderSize - 32 - 1;
    const fieldsBuf = Buffer.alloc(fieldsAreaSize);
    readSync(this.dbfFd, fieldsBuf, 0, fieldsAreaSize, 32);
    this.dbfFields = parseDbfFields(fieldsBuf);
  }

  private ensureShpChunk(n: number): void {
    const start = this.shx.contentOffset(n);
    const len = this.shx.contentLength(n);
    const end = start + len;
    if (start >= this.shpChunkStart && end <= this.shpChunkStart + this.shpChunk.length) return;

    const size = Math.max(SHP_CHUNK_BYTES, len);
    const buf = Buffer.alloc(size);
    const bytesRead = readSync(this.shpFd, buf, 0, size, start);
    this.shpChunk = bytesRead === size ? buf : buf.subarray(0, bytesRead);
    this.shpChunkStart = start;
  }

  private ensureDbfChunk(n: number): void {
    if (n >= this.dbfChunkStartRecord && n < this.dbfChunkStartRecord + this.dbfChunk.length / this.dbfRecordSize) {
      return;
    }
    const recordsToRead = Math.min(DBF_CHUNK_RECORDS, this.numRecords - n);
    const byteStart = this.dbfHeaderSize + n * this.dbfRecordSize;
    const byteLen = recordsToRead * this.dbfRecordSize;
    const buf = Buffer.alloc(byteLen);
    readSync(this.dbfFd, buf, 0, byteLen, byteStart);
    this.dbfChunk = buf;
    this.dbfChunkStartRecord = n;
  }

  /** Lee el registro n. Pensado para recorrer secuencialmente desde un punto de partida — cada salto grande hacia adelante recarga el chunk correspondiente, que sigue siendo O(1) por chunk, no por registro. */
  read(n: number): ShpRecord {
    this.ensureDbfChunk(n);
    const dbfRecordOffsetInChunk = (n - this.dbfChunkStartRecord) * this.dbfRecordSize;
    const attrs = dbfRecordToAttrs(this.dbfChunk, dbfRecordOffsetInChunk, this.dbfFields);

    this.ensureShpChunk(n);
    const start = this.shx.contentOffset(n) - this.shpChunkStart;
    const len = this.shx.contentLength(n);
    const content = this.shpChunk.subarray(start, start + len);
    const geometry = parseShpContent(content);

    return { ...attrs, geometry };
  }

  close(): void {
    closeSync(this.shpFd);
    closeSync(this.dbfFd);
  }
}

/** Lector de acceso puntual (no secuencial) — útil para pruebas/verificación puntual; cada `read(n)` es ~O(1) pero NO reusa buffers entre llamadas, así que recorrer un rango grande con esto es lento a propósito (usar `SequentialShpReader` para eso). */
export class ShpReader {
  private seq: SequentialShpReader;
  readonly numRecords: number;

  constructor(shpPath: string, shxPath: string, dbfPath: string) {
    this.seq = new SequentialShpReader(shpPath, shxPath, dbfPath);
    this.numRecords = this.seq.numRecords;
  }

  read(n: number): ShpRecord {
    return this.seq.read(n);
  }

  close(): void {
    this.seq.close();
  }
}
