-- Corrige la clave de upsert de sbn_supervision_predios (hallazgo 2026-09-22,
-- ver docs/ESTADO.md): UNIQUE (numero_informe, cus) colisiona cuando un mismo
-- informe cubre varios predios y el CSV deja `cus` vacío en más de uno -- el
-- ON CONFLICT DO UPDATE los iba pisando entre sí, perdiendo el 24% de las
-- filas fuente (1762 parseadas -> 1384 en tabla) incluyendo 134 de 279 casos
-- reales de zona_playa_protegida=true.
--
-- `item` es el correlativo de fila que SBN asigna en el CSV fuente y es
-- único en todo el dataset (1762 filas, 1762 items distintos, verificado en
-- vivo) -- reemplaza a (numero_informe, cus) como clave natural.

ALTER TABLE sbn_supervision_predios DROP CONSTRAINT sbn_supervision_predios_numero_informe_cus_key;
ALTER TABLE sbn_supervision_predios ADD CONSTRAINT sbn_supervision_predios_item_key UNIQUE (item);
