-- Fase 0 + construcción (2026-09-06): "Intervenciones en Redes Viales Subnacionales"
-- (Provías Descentralizado / MTC), confirmado en vivo con el enlace real que dio el usuario
-- (el fetch automático sobre la página del dataset no lograba renderizar el recurso). Ver
-- docs/data-contracts/mtc-pvd-intervenciones.md.
--
-- Nivel de detalle: ruta/tramo dentro de una provincia (departamental/vecinal, gestión de
-- Provías Descentralizado) — no baja a distrito exacto, una ruta puede cruzar más de uno.
-- Sin dato de persona natural: es infraestructura, no contratistas ni personal.

CREATE TABLE IF NOT EXISTS raw_pvd_batches (
  id            BIGSERIAL PRIMARY KEY,
  source_url    TEXT NOT NULL,
  checksum      TEXT NOT NULL,
  record_count  INTEGER NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intervenciones_viales (
  id                      BIGSERIAL PRIMARY KEY,
  id_intervencion         TEXT,
  codigo_unico_inversion  TEXT,
  jerarquia               TEXT,
  codigo_ruta             TEXT,
  trayectoria             TEXT,
  inicio_km               TEXT,
  final_km                TEXT,
  id_departamento         TEXT,
  id_provincia            TEXT,
  departamento            TEXT NOT NULL,
  provincia               TEXT NOT NULL,
  estado                  TEXT,
  superficie              TEXT,
  convenio                TEXT,
  longitud_km             NUMERIC,
  responsable             TEXT,
  componente              TEXT,
  corredor_vial           TEXT,
  nivel_intervencion      TEXT,
  tramo                   TEXT,
  fecha_corte             DATE,
  -- (id_intervencion, codigo_ruta, tramo) no es una clave única confirmada (una intervención
  -- puede reaparecer en más de un tramo/ruta con el mismo trío en filas legítimamente
  -- distintas) — se usa un hash de contenido, mismo patrón que `infracciones-ambientales`.
  row_hash                TEXT NOT NULL,
  source_batch_id         BIGINT NOT NULL REFERENCES raw_pvd_batches(id),
  UNIQUE (row_hash)
);

CREATE TABLE IF NOT EXISTS intervenciones_viales_rejected (
  id                BIGSERIAL PRIMARY KEY,
  source_batch_id   BIGINT NOT NULL REFERENCES raw_pvd_batches(id),
  raw_row           JSONB NOT NULL,
  reason            TEXT NOT NULL,
  rejected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervenciones_viales_dpto_prov
  ON intervenciones_viales (departamento, provincia);
CREATE INDEX IF NOT EXISTS idx_intervenciones_viales_estado ON intervenciones_viales (estado);
