-- Cruce persona-a-persona pedido por el usuario (2026-09-06): ¿alguna
-- persona sancionada directamente (RUC-10, persona natural) es también
-- socio/representante/miembro del órgano de administración de una empresa
-- activa en `supplier_conformacion` (compras-publicas)?
--
-- El RUC-10 peruano de persona natural tiene la forma "10" + 8 dígitos de
-- DNI + 1 dígito verificador (11 caracteres en total) — el DNI ya vive
-- incrustado en el campo `ruc` que este conector siempre ingirió tal cual
-- vino de la fuente. Esta migración no agrega ningún dato nuevo: solo
-- extrae, como columna generada (recalculada siempre desde `ruc`, nunca
-- escrita a mano), el DNI que ya estaba ahí. Verificado en vivo: 3,538
-- filas de `inhabilitaciones` y 1,970 de `multas` son RUC-10.
--
-- Mismo patrón de gobierno de dato que `supplier_conformacion.numero_documento`
-- (compras-publicas): vive en la base de datos para cruces internos, nunca
-- se expone completo en una respuesta pública — ver `personas-sancionadas.ts`.
ALTER TABLE inhabilitaciones
  ADD COLUMN IF NOT EXISTS dni TEXT
  GENERATED ALWAYS AS (
    CASE WHEN left(ruc, 2) = '10' AND length(ruc) = 11 THEN substring(ruc from 3 for 8) ELSE NULL END
  ) STORED;

ALTER TABLE multas
  ADD COLUMN IF NOT EXISTS dni TEXT
  GENERATED ALWAYS AS (
    CASE WHEN left(ruc, 2) = '10' AND length(ruc) = 11 THEN substring(ruc from 3 for 8) ELSE NULL END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_inhabilitaciones_dni ON inhabilitaciones (dni) WHERE dni IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_multas_dni ON multas (dni) WHERE dni IS NOT NULL;
