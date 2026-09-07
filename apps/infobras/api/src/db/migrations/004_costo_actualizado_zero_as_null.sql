-- CX-14 (2026-09-07): "Costo Actualizado de la inversión" viene en 0 para el 100% de las
-- 191,180 filas del export nacional de INFOBRAS, confirmado en vivo descargando y recorriendo
-- el archivo completo sin una sola excepción — no es un bug de índice de columna (Monto Viable,
-- columna adyacente, sí varía con normalidad). Es casi seguro que INFOBRAS solo popula ese
-- campo ante una reformulación presupuestal formal, que el export de Datos Abiertos no
-- backfillea para el resto. Un "0" real sería estadísticamente indistinguible de "0 = no
-- reportado" con esta evidencia — se trata como ausencia de dato (NULL), no como un costo
-- actualizado real de cero. `normalize.ts` ya aplica esta regla para ingestas futuras; esta
-- migración corrige las filas ya persistidas antes del fix.
--
-- Ver docs/adr/0020-umbral-sobrecosto-unificado.md (actualización 2026-09-07) para el detalle
-- completo de la investigación.

UPDATE public_works SET costo_actualizado = NULL WHERE costo_actualizado = 0;
