import { pool } from "../db/pool.js";
import { radarPool } from "../db/radar-pool.js";

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const [identity, signals, territorial, coverage, projects] = await Promise.all([
    pool.query(`SELECT COUNT(*)::integer AS total,
                       COUNT(*) FILTER (WHERE strength IN ('EXACTA', 'VERIFICADA'))::integer AS verificados,
                       COUNT(*) FILTER (WHERE target_identifier_type = 'MEF_ENTITY_CODE')::integer AS mef_links
                  FROM entity_identity_links`),
    pool.query(`SELECT COUNT(*)::integer AS signals,
                       COUNT(*) FILTER (WHERE human_review_status = 'PENDING')::integer AS pendientes,
                       COUNT(*) FILTER (WHERE human_review_status IN ('REVIEWED', 'DISMISSED'))::integer AS resueltas,
                       (SELECT COUNT(*)::integer FROM signal_review_events) AS eventos_revision
                  FROM contract_signals`),
    pool.query(`SELECT COUNT(*)::integer AS contratos,
                       COUNT(*) FILTER (WHERE execution_department = 'LA LIBERTAD')::integer AS con_departamento_ejecucion,
                       COUNT(*) FILTER (WHERE execution_province IS NOT NULL AND execution_district IS NOT NULL)::integer AS con_provincia_distrito
                  FROM minor_contracts`),
    radarPool.query(`SELECT origen_cobertura, departamento, nivel_gobierno, anio_fiscal, fecha_corte, estado_cobertura, record_count
                       FROM budget_coverage_snapshots WHERE activo = true
                      ORDER BY anio_fiscal DESC, origen_cobertura, departamento, nivel_gobierno`),
    radarPool.query(`SELECT p.cui, p.actividad_literal, p.departamento,
                            COUNT(l.id) FILTER (WHERE l.link_status = 'VINCULO_OFICIAL')::integer AS vinculos_oficiales,
                            COUNT(l.id) FILTER (WHERE l.link_status <> 'VINCULO_OFICIAL')::integer AS candidatos_no_usados
                       FROM project_evidence_links p
                  LEFT JOIN project_budget_links l ON l.cui = p.cui
                      GROUP BY p.cui, p.actividad_literal, p.departamento
                      ORDER BY p.cui`),
  ]);

  const report = {
    reporte: "integridad_interfuentes",
    generadoEn: new Date().toISOString(),
    identidadInstitucional: {
      total: asNumber(identity.rows[0]?.total), verificados: asNumber(identity.rows[0]?.verificados),
      vinculosMef: asNumber(identity.rows[0]?.mef_links),
      regla: "Un código MEF solo se usa cuando existe un vínculo verificable; cero no se interpreta como ausencia de equivalencia institucional.",
    },
    senales: {
      total: asNumber(signals.rows[0]?.signals), pendientes: asNumber(signals.rows[0]?.pendientes),
      resueltas: asNumber(signals.rows[0]?.resueltas), eventosRevision: asNumber(signals.rows[0]?.eventos_revision),
      regla: "Una señal pendiente o revisada es una unidad de trabajo documental, no una conclusión jurídica.",
    },
    territorioContratosMenores: {
      contratos: asNumber(territorial.rows[0]?.contratos),
      conDepartamentoEjecucion: asNumber(territorial.rows[0]?.con_departamento_ejecucion),
      conProvinciaDistrito: asNumber(territorial.rows[0]?.con_provincia_distrito),
      regla: "El territorio ejecutado se reporta solo cuando la fuente lo publica; no se reemplaza por la sede de la entidad.",
    },
    presupuesto: coverage.rows.map((row) => ({
      particion: `${row.origen_cobertura}:${row.departamento}:${row.nivel_gobierno}`,
      anioFiscal: row.anio_fiscal, fechaCorte: row.fecha_corte, registros: asNumber(row.record_count), estado: row.estado_cobertura,
    })),
    proyectosCui: projects.rows.map((row) => ({
      cui: row.cui, actividad: row.actividad_literal, departamento: row.departamento,
      vinculosOficialesPresupuesto: asNumber(row.vinculos_oficiales), candidatosNoUsados: asNumber(row.candidatos_no_usados),
    })),
    limitacion: "El informe prueba reglas y cortes de la evidencia materializada. No certifica cobertura total externa ni convierte similitud de texto, fecha o nombre en identidad o vínculo presupuestal.",
  };

  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("ALSOL | Integridad interfuentes");
    console.table([report.identidadInstitucional, report.senales, report.territorioContratosMenores]);
    console.log("\nCobertura presupuestal activa:"); console.table(report.presupuesto);
    console.log("\nProyectos CUI y vínculos a presupuesto:"); console.table(report.proyectosCui);
    console.log(report.limitacion);
  }
}

main()
  .catch((error) => { console.error("No se pudo generar el informe de integridad:", error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => { await Promise.all([pool.end(), radarPool.end()]); });
