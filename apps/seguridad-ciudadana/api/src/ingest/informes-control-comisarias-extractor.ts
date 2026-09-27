/**
 * Connector 1 (Fase 2 - Datos Reales): informes-control-comisarias-extractor.ts
 * 
 * Parsea informes de auditoría de la Contraloría (vía API informes-control),
 * descarga PDFs, extrae menciones de comisarías en Lima + hallazgos.
 * 
 * Usa pdf-parse para extraer texto, regex + NER simple para identificar comisarías.
 */

import { pool } from "../db/pool.js";
import { PDFParse } from "pdf-parse";

// Config
const INFORMES_CONTROL_URL = process.env.INFORMES_CONTROL_URL || "http://localhost:4017";

interface ComisariaHallazgo {
  anio: number;
  hallazgo_tipo: "infraestructura" | "personal" | "equipamiento" | "seguridad";
  description: string;
  severity: "critica" | "mayor" | "menor";
}

interface ExtractedComisaria {
  nombre: string;
  departamento: string;
  provincia: string;
  distrito: string;
  ubicacion_aprox?: string;
  anio_auditoria: number;
  fuente_informe_id: string;
  fuente_informe_url: string;
  hallazgos: ComisariaHallazgo[];
}

/**
 * Extrae nombres de comisarías de texto (patrones: "Comisaría [NOMBRE]",
 * "comisarías de [NOMBRE1], [NOMBRE2] y [NOMBRE3]", "Comisaría de [NOMBRE] ...")
 */
function extractComisariaNames(text: string): string[] {
  const names = new Set<string>();

  const pattern = /(?:comisaría|comisarías)\s+(?:de\s+)?([^\n.]+)/gi;
  const connectorPattern = /\s+(?:en|con|a\b|para|por|sobre|también|fue\s|visitad[oa]|que\b)\s+/gi;

  for (const match of text.matchAll(pattern)) {
    const raw = match[1].trim();

    const commaParts = raw.split(/\s*,\s*/);

    for (const part of commaParts) {
      const yParts = part.split(/\s+y\s+/i);

      for (const yPart of yParts) {
        const trimmed = yPart.trim();
        if (trimmed.length === 0) continue;

        const name = trimmed.split(connectorPattern)[0].trim();

        if (name.length > 2 && name.length < 50) {
          names.add(name);
        }
      }
    }
  }

  return Array.from(names);
}

/**
 * Extrae hallazgos por palabras clave en el texto
 */
function extractHallazgos(text: string, anio: number): ComisariaHallazgo[] {
  const hallazgos: ComisariaHallazgo[] = [];

  // Hallazgos de infraestructura
  const infraPatterns = [
    { regex: /hacinamiento|abarrotad|sobrecarg/i, desc: "Hacinamiento de celdas" },
    { regex: /estructura (?:dañad|deteriorad|en mal estado)/i, desc: "Daño estructural" },
    { regex: /ventilación|sanitario|agua|drenaje/i, desc: "Deficiencias en servicios básicos" },
    { regex: /techo|pared|piso.*(?:roto|dañad|fracturad)/i, desc: "Daño en infraestructura" },
  ];

  // Hallazgos de personal
  const personalPatterns = [
    { regex: /insuficiente|falta.*personal|escaso.*efectivo/i, desc: "Personal insuficiente" },
    { regex: /entrenamiento|capacitación.*ausente|sin.*especialización/i, desc: "Falta de capacitación" },
  ];

  // Hallazgos de equipamiento
  const equipPatterns = [
    {
      regex: /(?:flota|vehículo|patrullero).*(?:fuera de servicio|operativ|disponible)/i,
      desc: "Flota con baja operatividad",
    },
    { regex: /comunicación.*(?:anticuad|obsolet|insuficiente)/i, desc: "Sistemas de comunicación obsoletos" },
  ];

  // Hallazgos de seguridad
  const secPatterns = [
    { regex: /incomunicabilidad|detenido.*incomunicad/i, desc: "Incomunicabilidad de detenidos" },
    { regex: /riesgo.*fuga|seguridadcomprometi|vigilancia.*insuficiente/i, desc: "Riesgos de seguridad" },
  ];

  for (const { regex, desc } of infraPatterns) {
    if (regex.test(text)) {
      hallazgos.push({
        anio,
        hallazgo_tipo: "infraestructura",
        description: desc,
        severity: "mayor",
      });
    }
  }

  for (const { regex, desc } of personalPatterns) {
    if (regex.test(text)) {
      hallazgos.push({
        anio,
        hallazgo_tipo: "personal",
        description: desc,
        severity: "mayor",
      });
    }
  }

  for (const { regex, desc } of equipPatterns) {
    if (regex.test(text)) {
      hallazgos.push({
        anio,
        hallazgo_tipo: "equipamiento",
        description: desc,
        severity: "mayor",
      });
    }
  }

  for (const { regex, desc } of secPatterns) {
    if (regex.test(text)) {
      hallazgos.push({
        anio,
        hallazgo_tipo: "seguridad",
        description: desc,
        severity: "critica",
      });
    }
  }

  // Si no encontró hallazgos específicos, al menos menciona que fue auditado
  if (hallazgos.length === 0) {
    hallazgos.push({
      anio,
      hallazgo_tipo: "infraestructura",
      description: "Comisaría auditada (detalles no especificados en el extracto)",
      severity: "menor",
    });
  }

  return hallazgos;
}

/**
 * Descarga un PDF desde una URL y extrae texto
 */
async function downloadAndParsePDF(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Fallo descargando PDF: ${response.status} ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? null;
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.error(`Error parseando PDF ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Consulta API informes-control y procesa cada informe
 */
async function fetchAndParseInformesControlLima(): Promise<ExtractedComisaria[]> {
  console.log(`[Connector 1] Consultando API informes-control en ${INFORMES_CONTROL_URL}...`);

  try {
    // Buscar informes sobre PNP en Lima
    const searchUrl = `${INFORMES_CONTROL_URL}/api/informes?texto=comisaría&departamento=LIMA&limit=50`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      throw new Error(`Fallo en API informes-control: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const informes = data.informes || [];
    console.log(`[Connector 1] Encontrados ${informes.length} informes relevantes.`);

    const extractedComisarias = new Map<string, ExtractedComisaria>();

    // Procesar cada informe
    for (const informe of informes) {
      console.log(`[Connector 1] Procesando informe: ${informe.titulo} (${informe.anio})`);

      // Descargar PDF si está disponible
      let pdfText = null;
      if (informe.url_descarga_pdf) {
        pdfText = await downloadAndParsePDF(informe.url_descarga_pdf);
      }

      // Usar texto del informe o del PDF
      const fullText = pdfText || informe.resumen || "";

      // Extraer nombres de comisarías
      const comisariaNames = extractComisariaNames(fullText);
      console.log(`  → Comisarías encontradas: ${comisariaNames.join(", ")}`);

      // Para cada comisaría mencionada
      for (const comisariaName of comisariaNames) {
        const key = `${comisariaName}_LIMA`;

        // Si ya la procesamos, agregar hallazgos
        if (extractedComisarias.has(key)) {
          const existing = extractedComisarias.get(key)!;
          const newHallazgos = extractHallazgos(fullText, informe.anio);
          existing.hallazgos.push(...newHallazgos);
        } else {
          // Nueva comisaría
          const hallazgos = extractHallazgos(fullText, informe.anio);

          extractedComisarias.set(key, {
            nombre: comisariaName,
            departamento: "LIMA",
            provincia: "LIMA",
            distrito: comisariaName,
            ubicacion_aprox: `${comisariaName}, Lima`,
            anio_auditoria: informe.anio,
            fuente_informe_id: informe.id,
            fuente_informe_url: informe.url,
            hallazgos,
          });
        }
      }
    }

    return Array.from(extractedComisarias.values());
  } catch (err) {
    console.error("[Connector 1] Error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Inserta comisarías en BD
 */
async function saveComisariasAuditadas(comisarias: ExtractedComisaria[]): Promise<number> {
  let inserted = 0;

  for (const comisaria of comisarias) {
    try {
      const result = await pool.query(
        `
        INSERT INTO comisarias_auditadas (
          nombre, departamento, provincia, distrito, ubicacion_aprox,
          anio_auditoria, fuente_informe_id, fuente_informe_url, hallazgos, ultima_actualizacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (nombre, departamento) DO UPDATE SET
          hallazgos = $9, anio_auditoria = $6, fuente_informe_id = $7, ultima_actualizacion = now()
        RETURNING id;
        `,
        [
          comisaria.nombre,
          comisaria.departamento,
          comisaria.provincia,
          comisaria.distrito,
          comisaria.ubicacion_aprox || null,
          comisaria.anio_auditoria,
          comisaria.fuente_informe_id,
          comisaria.fuente_informe_url,
          JSON.stringify(comisaria.hallazgos),
        ]
      );
      inserted += result.rows.length;
    } catch (err) {
      console.error(`Error insertando comisaría ${comisaria.nombre}:`, err);
    }
  }

  return inserted;
}

async function recordBatch(recordCount: number, checksum?: string) {
  await pool.query(
    `INSERT INTO comisarias_extraction_batches (batch_type, source_name, checksum, record_count)
     VALUES ($1, $2, $3, $4);`,
    ["informes_control_parser", "Contraloría LIMA (HTTP + PDF-Parse)", checksum, recordCount]
  );
}

async function main() {
  console.log("[Connector 1] Iniciando extracción de comisarías (Fase 2: Datos Reales)...");

  try {
    const comisarias = await fetchAndParseInformesControlLima();
    console.log(`[Connector 1] Extraídas ${comisarias.length} comisarías únicas.`);

    if (comisarias.length === 0) {
      console.log("[Connector 1] No se encontraron comisarías. Verifica que informes-control esté corriendo.");
      return;
    }

    const inserted = await saveComisariasAuditadas(comisarias);
    console.log(`[Connector 1] Insertadas ${inserted} comisarías.`);

    await recordBatch(inserted);
    console.log("[Connector 1] ✓ Ingesta completada.");
  } catch (err) {
    console.error("[Connector 1] Fatal error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("informes-control-comisarias-extractor.ts")) {
  main();
}

export { fetchAndParseInformesControlLima, extractComisariaNames, extractHallazgos, saveComisariasAuditadas };
