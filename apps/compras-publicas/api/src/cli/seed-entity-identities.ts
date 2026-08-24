import { pool } from "../db/pool.js";

async function main(): Promise<void> {
  const result = await pool.query(`
    INSERT INTO entity_identity_links (
      subject_id, source_identifier_type, source_identifier_value,
      target_identifier_type, target_identifier_value, relation_type,
      method, strength, evidence_source, evidence_field
    )
    SELECT municipality_id, 'MUNICIPALITY_ID', municipality_id, 'RUC', ruc,
           'MISMA_ENTIDAD', 'FUENTE_OFICIAL', 'VERIFICADA', source, 'municipalities.ruc'
      FROM municipalities WHERE ruc IS NOT NULL AND ruc <> ''
    ON CONFLICT DO NOTHING`);
  const ubigeo = await pool.query(`
    INSERT INTO entity_identity_links (
      subject_id, source_identifier_type, source_identifier_value,
      target_identifier_type, target_identifier_value, relation_type,
      method, strength, evidence_source, evidence_field
    )
    SELECT municipality_id, 'MUNICIPALITY_ID', municipality_id, 'UBIGEO', ubigeo,
           'MISMA_ENTIDAD', 'FUENTE_OFICIAL', 'VERIFICADA', source, 'municipalities.ubigeo'
      FROM municipalities WHERE ubigeo IS NOT NULL AND ubigeo <> ''
    ON CONFLICT DO NOTHING`);
  const oece = await pool.query(`
    INSERT INTO entity_identity_links (
      subject_id, source_identifier_type, source_identifier_value,
      target_identifier_type, target_identifier_value, relation_type,
      method, strength, evidence_source, evidence_field
    )
    SELECT municipality_id, 'MUNICIPALITY_ID', municipality_id, 'OECE_CODE', entity_code_oece,
           'ENTIDAD_CONTRATANTE_DE', 'FUENTE_OFICIAL', 'VERIFICADA', source, 'municipalities.entity_code_oece'
      FROM municipalities WHERE entity_code_oece IS NOT NULL AND entity_code_oece <> ''
    ON CONFLICT DO NOTHING`);
  console.log(JSON.stringify({ ruc: result.rowCount, ubigeo: ubigeo.rowCount, oece: oece.rowCount }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => pool.end());
