-- INFOBRAS publica algunos porcentajes con una escala/valor no convencional
-- (por ejemplo, 1000000 en vez de 100.00). La migración 002 llegó hasta
-- NUMERIC(8,2), insuficiente para esas filas observables fuera de La Libertad.
-- Se conserva el valor fuente; normalizarlo o interpretarlo requiere una
-- regla semántica separada y no debe hacerse silenciosamente durante ingesta.
ALTER TABLE public_works ALTER COLUMN avance_fisico_prog_pct TYPE NUMERIC(18, 2);
ALTER TABLE public_works ALTER COLUMN avance_fisico_real_pct TYPE NUMERIC(18, 2);
ALTER TABLE public_works ALTER COLUMN ejecucion_financiera_pct TYPE NUMERIC(18, 2);
