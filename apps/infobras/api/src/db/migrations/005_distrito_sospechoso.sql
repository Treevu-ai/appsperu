-- DQ-14 (2026-09-08): 7 de las 1,336 obras de la provincia de Pataz traían un
-- `distrito` ajeno al departamento declarado (dos distritos reales de la
-- provincia de Quispicanchi, Cusco; una variante mal escrita de "URPAY") —
-- confirmado que tanto el nombre de la obra como la entidad ejecutora
-- identifican sin ambigüedad el distrito real. El ingest nunca validaba
-- `distrito` contra ningún catálogo de territorios, así que el mismo error
-- podría repetirse sin ser notado en cualquier otro departamento.
--
-- Esta columna marca (nunca rechaza) filas cuyo `distrito` no pertenece al
-- universo real de su `departamento`, según el catálogo nacional de
-- ingest/distritos-conocidos.ts (derivado de la tabla `territories` de
-- ceplan-geo, 1,874 distritos, ver comentario en ese archivo). `false` por
-- defecto también cuando no hay catálogo disponible para el departamento —
-- ausencia de chequeo no es lo mismo que "verificado y correcto".

ALTER TABLE public_works
  ADD COLUMN IF NOT EXISTS distrito_sospechoso BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_public_works_distrito_sospechoso
  ON public_works (distrito_sospechoso) WHERE distrito_sospechoso = true;
