-- Reversión de 002_cooperativas.sql: el Directorio Nacional de Cooperativas
-- (PRODUCE) quedó desactualizado frente a SUNAT (representante legal
-- confirmado obsoleto en RUC 20129156083 — PRODUCE reportaba a Zamalloa
-- Bravo, Hernán como gerente; SUNAT registra a Ochoa Rua Timoteo desde
-- 2023). Se reemplaza por `ficha_ruc` (ver 004_ficha_ruc.sql), que consulta
-- la ficha individual de SUNAT directamente — decisión explícita del
-- usuario del proyecto, 2026-09-18.
--
-- Las migraciones son append-only por convención de este proyecto (no se
-- reescribe 002 ya aplicada/pusheada) — esta migración revierte su efecto
-- en vez de editar el archivo original.
DROP TABLE IF EXISTS cooperativas_rejected;
DROP TABLE IF EXISTS cooperativas;
DROP TABLE IF EXISTS raw_cooperativas_batches;
