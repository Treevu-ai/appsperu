-- Cruce de conformación societaria contra adjudicaciones: identifica personas
-- naturales vinculadas (socio/representante/órgano de administración) a más
-- de un RUC, y expone las adjudicaciones (OCDS + menor a 8 UIT) ganadas por
-- cada uno de esos RUCs. El endpoint que consume esta vista filtra además a
-- casos donde las adjudicaciones abarcan más de una entidad convocante — una
-- sola empresa con varios contratos de la misma entidad no es el patrón de
-- interés; dos empresas de la misma persona ganando en entidades distintas sí.
--
-- Validado manualmente el 2026-09-04 contra 1,442 RUCs de muestra: ya produjo
-- un caso real (ver docs/HALLAZGOS_CONFORMACION_SOCIETARIA.md, no comiteado).

CREATE OR REPLACE VIEW vw_conformacion_multi_ruc AS
SELECT
  numero_documento,
  nombre,
  array_agg(DISTINCT ruc ORDER BY ruc) AS rucs,
  count(DISTINCT ruc) AS num_rucs
FROM supplier_conformacion
WHERE numero_documento IS NOT NULL
GROUP BY numero_documento, nombre
HAVING count(DISTINCT ruc) > 1;

CREATE OR REPLACE VIEW vw_conformacion_multi_ruc_awards AS
SELECT
  p.numero_documento,
  p.nombre,
  r.ruc,
  a.buyer_name AS entidad,
  a.ocid AS proceso,
  a.fecha,
  a.valor_monto AS monto,
  'OCDS' AS fuente
FROM vw_conformacion_multi_ruc p
CROSS JOIN LATERAL unnest(p.rucs) AS r(ruc)
JOIN awards a ON a.supplier_id = 'PE-RUC-' || r.ruc
UNION ALL
SELECT
  p.numero_documento,
  p.nombre,
  r.ruc,
  mc.municipality_id AS entidad,
  mc.contracting_id AS proceso,
  mc.award_date::date AS fecha,
  mc.awarded_amount AS monto,
  'MENOR_8UIT' AS fuente
FROM vw_conformacion_multi_ruc p
CROSS JOIN LATERAL unnest(p.rucs) AS r(ruc)
JOIN minor_contracts mc ON mc.winning_supplier_id = 'PE-RUC-' || r.ruc;
