/**
 * Connector 2 (Fase 2 - Datos Reales): seace-pnp-equipamiento-connector.ts
 * 
 * Consulta API compras-publicas (SEACE awards), filtra por PNP,
 * agrega por tipo de equipamiento e inserta series históricas.
 */

import { pool } from "../db/pool.js";

// Config
const COMPRAS_PUBLICAS_URL = process.env.COMPRAS_PUBLICAS_URL || "http://localhost:4001";

interface SEACEAward {
  id: string;
  anio: number;
  supplier_name: string;
  subject: string;
  monto_soles?: number;
  valor_moneda?: string;
  fecha_adjudicacion?: string;
}

interface AggregatedEquipamiento {
  anio: number;
  tipo: string;
  cantidad: number;
  monto_soles: number;
  awards: SEACEAward[];
}

const EQUIPAMIENTO_KEYWORDS = {
  VEHICULO: ["PATRULLERO", "AUTO POLICIAL", "VEHICULO BLINDADO", "MOTOCICLETA", "CAMION", "FURGON", "AUTO BLINDADO"],
  ARMAMENTO: ["PISTOLA", "RIFLE", "MUNICION", "ESCOPETA", "ARMA CORTA", "ARMA LARGA", "REVOLVER"],
  COMUNICACIONES: [
    "RADIO COMUNICADOR",
    "SISTEMA COMUNICACIONES",
    "CENTRAL TELEFONICA",
    "EQUIPO RADIOCOMUNICACION",
    "REPEATER",
    "RADIOCOMUNICACION",
  ],
  EQUIPAMIENTO_SEGURIDAD: [
    "GILET",
    "CASCO",
    "EQUIPO PROTECCION",
    "VIDEOVIGILANCIA",
    "SISTEMA SEGURIDAD",
    "CHALECO",
  ],
};

/**
 * Consulta /api/awards de compras-publicas, filtra por PNP
 */
async function fetchSEACEAwardsPNP(anioDesde: number, anioHasta: number): Promise<SEACEAward[]> {
  const awards: SEACEAward[] = [];

  console.log(
    `[Connector 2] Consultando awards SEACE de PNP (${anioDesde}-${anioHasta}) en ${COMPRAS_PUBLICAS_URL}...`
  );

  try {
    // Paginar si es necesario
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        supplier_entity: "PNP|MININTER|POLICIA NACIONAL|INTERIOR",
        limit: String(limit),
        offset: String(offset),
      });

      const url = `${COMPRAS_PUBLICAS_URL}/api/awards?${params}`;
      console.log(`[Connector 2] GET ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        console.warn(`[Connector 2] Warning: ${response.status} en offset ${offset}, deteniendo paginación`);
        break;
      }

      const data = (await response.json()) as any;
      const batch = data.awards || data.results || [];

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Filtrar por año
      for (const award of batch) {
        if (award.anio >= anioDesde && award.anio <= anioHasta) {
          awards.push(award);
        }
      }

      offset += limit;
      hasMore = batch.length === limit; // Si sacó menos del limit, probablemente no hay más
    }

    console.log(`[Connector 2] Obtenidos ${awards.length} awards de PNP.`);
    return awards;
  } catch (err) {
    console.error("[Connector 2] Error fetchSEACEAwardsPNP:", err instanceof Error ? err.message : err);
    return [];
  }
}

function classifyEquipamiento(subject: string): string | null {
  const subjectUpper = subject.toUpperCase();

  for (const [tipo, keywords] of Object.entries(EQUIPAMIENTO_KEYWORDS)) {
    if (keywords.some((kw) => subjectUpper.includes(kw))) {
      return tipo;
    }
  }

  return null;
}

function aggregateAwards(awards: SEACEAward[]): Map<string, AggregatedEquipamiento> {
  const agg = new Map<string, AggregatedEquipamiento>();

  for (const award of awards) {
    const tipo = classifyEquipamiento(award.subject);
    if (!tipo) continue;

    const key = `${award.anio}:${tipo}`;
    if (!agg.has(key)) {
      agg.set(key, {
        anio: award.anio,
        tipo,
        cantidad: 0,
        monto_soles: 0,
        awards: [],
      });
    }

    const entry = agg.get(key)!;
    entry.cantidad += 1;
    entry.monto_soles += award.monto_soles || 0;
    entry.awards.push(award);
  }

  return agg;
}

async function savePNPEquipamiento(aggregated: Map<string, AggregatedEquipamiento>): Promise<number> {
  let inserted = 0;

  for (const entry of aggregated.values()) {
    try {
      const contratoRef = entry.awards[0];

      const result = await pool.query(
        `
        INSERT INTO pnp_equipamiento_seace (
          anio, tipo_equipamiento, cantidad_comprada, monto_soles,
          proveedor, contrato_seace_id, contrato_url, observacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (anio, tipo_equipamiento, contrato_seace_id) DO UPDATE SET
          monto_soles = $4, cantidad_comprada = $3, observacion = $8
        RETURNING id;
        `,
        [
          entry.anio,
          entry.tipo,
          entry.cantidad,
          entry.monto_soles,
          contratoRef.supplier_name,
          contratoRef.id,
          `https://www.gob.pe/osce/busqueda/${contratoRef.id}`,
          `${entry.cantidad} contrato(s) SEACE en ${entry.anio}. Monto: S/. ${entry.monto_soles.toLocaleString("es-PE")}`,
        ]
      );
      inserted += result.rows.length;
    } catch (err) {
      console.error(`Error insertando equipamiento ${entry.anio}/${entry.tipo}:`, err);
    }
  }

  return inserted;
}

async function recordBatch(recordCount: number, checksum?: string) {
  await pool.query(
    `INSERT INTO comisarias_extraction_batches (batch_type, source_name, checksum, record_count)
     VALUES ($1, $2, $3, $4);`,
    ["seace_pnp_equipamiento", "SEACE Awards PNP (HTTP Real)", checksum, recordCount]
  );
}

async function main() {
  console.log("[Connector 2] Iniciando ingesta de equipamiento PNP desde SEACE (Fase 2: Datos Reales)...");

  try {
    const awards = await fetchSEACEAwardsPNP(2020, 2026);

    if (awards.length === 0) {
      console.log("[Connector 2] No se encontraron awards. Verifica que compras-publicas esté corriendo.");
      return;
    }

    console.log(`[Connector 2] Recuperados ${awards.length} awards de SEACE.`);

    const aggregated = aggregateAwards(awards);
    console.log(`[Connector 2] Agregados en ${aggregated.size} categorías.`);

    const inserted = await savePNPEquipamiento(aggregated);
    console.log(`[Connector 2] Insertadas ${inserted} filas.`);

    await recordBatch(inserted);
    console.log("[Connector 2] ✓ Ingesta completada.");
  } catch (err) {
    console.error("[Connector 2] Fatal error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seace-pnp-equipamiento-connector.ts")) {
  main();
}

export { fetchSEACEAwardsPNP, classifyEquipamiento, aggregateAwards, savePNPEquipamiento };
