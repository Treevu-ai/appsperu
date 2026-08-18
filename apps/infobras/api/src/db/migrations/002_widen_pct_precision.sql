-- Dato real observado en la ingesta: al menos un campo de porcentaje en el
-- dataset real excede el rango [-999.99, 999.99] que permitía NUMERIC(5,2)
-- (probablemente un error de tipeo de la entidad al reportar avance, ej.
-- "1500" en vez de "15.00" — honestidad radical: se persiste tal cual viene,
-- no se trunca ni se rechaza la fila completa por un solo campo fuera de
-- rango razonable).
ALTER TABLE public_works ALTER COLUMN avance_fisico_prog_pct TYPE NUMERIC(8, 2);
ALTER TABLE public_works ALTER COLUMN avance_fisico_real_pct TYPE NUMERIC(8, 2);
ALTER TABLE public_works ALTER COLUMN ejecucion_financiera_pct TYPE NUMERIC(8, 2);
