-- Diagnóstico de datos — residuos-solidos-per-capita-2024
-- Fecha de ejecución: 2026-10-19 · Proyecto Neon: appsperu (jolly-breeze-71813141)
-- Solo lectura. Ejecutar cada bloque en la base indicada en el comentario.

-- =====================================================================
-- [residuos_solidos] Cobertura general de la tabla principal
-- =====================================================================
SELECT count(*)                                                    AS filas,
       count(DISTINCT ubigeo)                                      AS ubigeos,
       count(DISTINCT departamento)                                AS departamentos,
       min(anio)                                                   AS anio_min,
       max(anio)                                                   AS anio_max,
       min(fecha_corte)::date                                      AS corte_min,
       max(fecha_corte)::date                                      AS corte_max,
       count(*) FILTER (WHERE poblacion_total IS NOT NULL AND poblacion_total > 0)   AS con_poblacion,
       count(*) FILTER (WHERE generacion_percapita_dom IS NOT NULL)                 AS con_percap_dom,
       count(*) FILTER (WHERE generacion_mun_tanio IS NOT NULL)                     AS con_gen_anual,
       count(*) FILTER (WHERE clasificacion_municipal_mef IS NOT NULL)              AS con_clasif_mef,
       count(*) FILTER (WHERE region_natural IS NOT NULL)                           AS con_region,
       count(*) FILTER (WHERE ubigeo IS NULL)                                        AS sin_ubigeo
FROM residuos_solidos_municipales;

-- =====================================================================
-- [residuos_solidos] Cobertura por año + calidad (nulos)
-- =====================================================================
SELECT anio,
       count(*)                                     AS filas,
       count(DISTINCT ubigeo)                       AS ubigeos,
       round(avg(generacion_percapita_dom)::numeric, 3) AS percap_prom,
       count(*) FILTER (WHERE generacion_percapita_dom IS NULL) AS sin_percap
FROM residuos_solidos_municipales
GROUP BY anio
ORDER BY anio;

-- =====================================================================
-- [residuos_solidos] Estadísticos de la variable dependiente (corte 2024)
-- =====================================================================
SELECT count(*) AS n,
       round(min(generacion_percapita_dom)::numeric, 3)      AS p_min,
       round(percentile_cont(0.10) WITHIN GROUP (ORDER BY generacion_percapita_dom)::numeric, 3) AS p10,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY generacion_percapita_dom)::numeric, 3) AS p50,
       round(percentile_cont(0.90) WITHIN GROUP (ORDER BY generacion_percapita_dom)::numeric, 3) AS p90,
       round(max(generacion_percapita_dom)::numeric, 3)      AS p_max,
       round(avg(generacion_percapita_dom)::numeric, 3)      AS media,
       round(avg(generacion_percapita_mun)::numeric, 3)      AS media_mun
FROM residuos_solidos_municipales
WHERE anio = 2024;

-- =====================================================================
-- [residuos_solidos] DV por clase MEF y por tipo de municipalidad (2024)
-- =====================================================================
SELECT clasificacion_municipal_mef,
       count(*) AS n,
       round(avg(generacion_percapita_dom)::numeric, 3) AS percap_prom
FROM residuos_solidos_municipales
WHERE anio = 2024
GROUP BY 1
ORDER BY 1;

-- =====================================================================
-- [actividad_empresarial] Cobertura de la covariable de empresas (2025)
-- =====================================================================
SELECT anio,
       count(DISTINCT ubigeo)          AS ubigeos,
       count(*)                        AS filas,
       sum(numero_empresas)            AS empresas_total,
       min(mes) AS mes_min, max(mes) AS mes_max
FROM empresas_privadas_distrito
GROUP BY anio
ORDER BY anio;

-- Ubigéos anómalos (no existen en el padrón MINAM de 1.891 distritos)
SELECT DISTINCT ubigeo
FROM empresas_privadas_distrito
WHERE ubigeo IN ('000401', '160109');

-- =====================================================================
-- [radar_inversiones] Inversión pública agregable por distrito
-- =====================================================================
SELECT count(*) AS proyectos,
       count(ubigeo) AS con_ubigeo,
       count(DISTINCT ubigeo) AS ubigeos,
       min(fecha_registro)::date AS registro_min,
       max(fecha_registro)::date AS registro_max,
       count(*) FILTER (WHERE avance_ejecucion IS NOT NULL) AS con_avance
FROM investments;

-- =====================================================================
-- [programas_sociales] Cobertura de la covariable social
-- =====================================================================
SELECT min(fecha_corte)::date AS corte_min,
       max(fecha_corte)::date AS corte_max,
       count(DISTINCT ubigeo) AS ubigeos,
       count(*)               AS filas
FROM cobertura_social;

-- =====================================================================
-- [radar_ejecucion] Descarte documentado: solo 84 gobiernos locales
-- =====================================================================
SELECT nivel_gobierno,
       count(*) AS entidades,
       count(DISTINCT ubigeo) AS con_ubigeo
FROM entities
GROUP BY 1
ORDER BY 2 DESC;
