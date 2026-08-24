# ADR-0009: Observatorio de contratos menores dentro de `compras-publicas`

**Estado:** Aceptado
**Fecha:** 2026-08-23

## Contexto

El piloto requiere reconstruir contratos menores de municipalidades distritales de La Libertad en 2026, hasta S/44,000, sin que una ausencia de evidencia se presente como incumplimiento. `compras-publicas` ya conserva lotes OCDS crudos y adjudicaciones OECE, pero no tenía la unidad canónica de contratación menor, versiones de señales ni su trazabilidad.

## Decisión

Se incorpora un módulo de observatorio dentro de la API existente. La materialización `npm run materialize:minor-contracts` toma únicamente adjudicaciones OECE que cumplen: departamento La Libertad, año 2026 por publicación, municipalidad distrital, bienes/servicios y monto adjudicado de S/0 a S/44,000. Cada contratación conserva OCID, adjudicación, lote RAW y URL de fuente.

`npm run signals:minor-contracts` crea una corrida inmutable con versiones de regla, normalizador, modelo y marco normativo. Las señales son INFO y explican su limitación. S03 no se emite si la validez de las cotizaciones es desconocida; S10 queda disponible en el modelo, pero no se produce hasta capturar documentos/campos independientes que permitan contrastarlos.

Como fuente de cobertura del piloto se añade `npm run ingest:minor-contracts`. Consulta el buscador público de contratos menores de SEACE para La Libertad, captura su búsqueda y cada detalle crudo en `raw_minor_contract_batches`, y sólo materializa ítems adjudicados de municipalidades distritales, bienes/servicios y hasta S/44,000. La fuente es una interfaz pública observada; no se etiqueta como API documentada. Por defecto procesa 100 contratos candidatos; `MINOR_CONTRACT_MAX_CONTRACTS=0` habilita una corrida completa y debe ejecutarse de forma controlada.

Para consumo territorial se incorpora `GET /api/analytics/territorial`. Entrega simultáneamente `byProvince` y `byDistrict`, con contratos, monto, ticket promedio, proveedores, CR1 y CR3. Acepta `year`, `category=goods|services` y `dateBasis=source_year|publication_year`. `source_year` filtra el año informado por la fuente; `publication_year` filtra la fecha pública del contrato. La respuesta declara el campo temporal aplicado para impedir comparaciones ambiguas.

## Consecuencias

- Se reutiliza la API y el lake OCDS sin inferir RUC, documentos o cotizaciones no publicados.
- Se exponen `GET /api/contracts`, `/api/municipalities`, `/api/signals` y `/api/analytics/*` para el piloto.
- S06 es una preselección léxica explícitamente exploratoria, no embeddings calibrados ni una conclusión jurídica.
- La capa semántica es opcional y explícita: `npm run embeddings:minor-contracts` sólo se ejecuta cuando se configuran `SEMANTIC_EMBEDDINGS_URL` y `SEMANTIC_EMBEDDINGS_MODEL`. Vectoriza únicamente `object_normalized` (no proveedor, monto ni fecha), conserva hash, proveedor y modelo, y nunca envía texto a un servicio no configurado.
- S11 identifica pares de objetos semánticamente comparables; S12 añade una ventana de hasta 90 días; S13 añade el mismo proveedor. Las tres son INFO y alimentan `/api/semantic-review-queue`, una bandeja para solicitar TDR, cotizaciones, evaluación y actas. No determinan misma necesidad, favorecimiento, fraccionamiento ni direccionamiento.
- La ingesta fuente sigue siendo parcial; materializar cero contratos no prueba que no existan contratos menores en una entidad.
- El detalle público publicado entrega adjudicatario y monto para ítems adjudicados, pero no demuestra la validez de todas las cotizaciones ni publica de forma uniforme los documentos. Esos campos quedan como `UNKNOWN`/ausentes y bloquean S03/S10 hasta obtener evidencia independiente.

## Operación de la capa semántica

1. Configurar un proveedor compatible con el endpoint `/embeddings` en variables de entorno locales. La clave, si la requiere el proveedor, vive sólo en `SEMANTIC_EMBEDDINGS_API_KEY`; no se versiona.
2. Ejecutar una corrida inicialmente acotada: `SEMANTIC_EMBEDDING_LIMIT=50 npm run embeddings:minor-contracts`.
3. Ejecutar `npm run signals:minor-contracts`. La corrida inmutable registra el modelo utilizado y emite S11--S13 sólo para vectores disponibles y del mismo modelo.
4. Abrir `/revision-semantica`. Cada fila debe terminar en revisión documental, descarte razonado o solicitud de evidencia adicional; no en una afirmación automática.
- Cada evidencia de fuente referencia exactamente un lote OCDS o un lote SEACE; la evidencia derivada de una señal no inventa un lote y queda vinculada al `signal_id` que la produjo.
