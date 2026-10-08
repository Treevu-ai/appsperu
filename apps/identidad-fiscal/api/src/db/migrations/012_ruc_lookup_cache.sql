-- Caché del fallback en vivo (openruc.com) para RUCs que no están en
-- `ficha_ruc` (la ficha completa, importada manualmente por el bloqueo de
-- reCAPTCHA de e-consultaruc.sunat.gob.pe — ver 004_ficha_ruc.sql). Evita
-- pegarle a openruc.com en cada request repetido del mismo RUC.
CREATE TABLE IF NOT EXISTS ruc_lookup_cache (
  ruc             TEXT PRIMARY KEY,
  razon_social    TEXT NOT NULL,
  estado          TEXT,
  condicion       TEXT,
  direccion       TEXT,
  ubigeo          TEXT,
  fuente          TEXT NOT NULL DEFAULT 'openruc.com',
  as_of           TEXT,
  consultado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
