CREATE TABLE raw_serfor_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  capa TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catastro_forestal_titulos (
  id BIGSERIAL PRIMARY KEY,
  capa TEXT NOT NULL,
  objectid INTEGER NOT NULL,
  fuente TEXT,
  doc_reg TEXT,
  fec_reg DATE,
  observ TEXT,
  zon_utm INTEGER,
  origen INTEGER,
  nom_dis TEXT,
  nom_pro TEXT,
  nom_dep TEXT,
  aut_for INTEGER,
  fec_ini DATE,
  fec_ter DATE,
  situac INTEGER,
  sup_sig DOUBLE PRECISION,
  sup_apr DOUBLE PRECISION,
  doc_leg TEXT,
  fec_leg DATE,
  atributos_extra JSONB,
  source_batch_id BIGINT NOT NULL REFERENCES raw_serfor_batches(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catastro_forestal_titulos_capa ON catastro_forestal_titulos (capa);
CREATE INDEX idx_catastro_forestal_titulos_ubigeo ON catastro_forestal_titulos (nom_dep, nom_pro, nom_dis);

CREATE TABLE catastro_forestal_titulos_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES raw_serfor_batches(id),
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL,
  rejected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
