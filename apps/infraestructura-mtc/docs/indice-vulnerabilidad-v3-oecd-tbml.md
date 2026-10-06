# Índice de Vulnerabilidad Portuaria — v3 (`MTC+CARGAS+SUNAT_V3`)

> **Fecha:** 2026-10-05. Investigación de metodologías externas + implementación, misma sesión.

---

## 1. Por qué un v3, y no un ajuste a v1/v2

PRD-004 §1 define el índice para "rankear terminales según su exposición a riesgos de **lavado,
contrabando y tráfico ilegal**". v1 mide abandono institucional (estado, concesión, alcance,
ámbito, geo); v2-tráfico agrega volumen/crecimiento de carga. **Ninguno de los dos mide
exposición a crimen directamente** — son proxies de negligencia institucional y tráfico legal.
Confirmado con grounding real: Callao y Paita son los dos puertos con decomisos de narcotráfico
y contrabando documentados en 2026 (SUNAT, prensa — ver fuentes al final), y ninguno de los dos
aparece como atípico en v1/v2 por esa razón específica.

v1 y v2 **no se modifican** — sus resultados ya publicados (`indice-vulnerabilidad-portuaria-v1.csv`,
`indice-vulnerabilidad-trafico-v2.md`) siguen siendo válidos para lo que miden. v3 es una fórmula
aparte, con una dimensión nueva y un rigor metodológico distinto.

## 2. Metodologías externas revisadas

Investigación completa (research + fuentes) en la conversación de 2026-10-05. Resumen de lo que
se adoptó y por qué:

| Fuente | Qué aporta | Uso en v3 |
|---|---|---|
| OECD/JRC *Handbook on Constructing Composite Indicators* | Normalización 0-1 antes de ponderar, pesos documentados, análisis de sensibilidad obligatorio | Base metodológica de toda la sección 3-4 |
| FATF *Trade-Based Money Laundering Risk Indicators* (2021) | Red flag: "discrepancia significativa" entre valor declarado y benchmark (FATF no fija un número) | Umbral `UMBRAL_DESVIACION=0.20` en `aduanas-tbml-join.ts` — el 20% es una elección propia de este índice, no un valor tomado de FATF |
| GAFILAT *Informe de Amenazas Regionales LA/FT* | Tipologías regionales (empresas fachada, testaferros) — NO implementado esta sesión | Pendiente, ver §6 |
| Nautical Port Risk Index (ANP) | Pesos derivados de comparación pareada de expertos en vez de fijos | **No adoptado**: requiere panel de expertos, fuera de alcance de esta sesión. Se usó compresión proporcional en su lugar (§3) |
| PortMATE (TRAFFIC) | 9 categorías de capacidad de interdicción — mayoría requiere auditoría de campo | No aplicable con datos abiertos, salvo "integridad/anticorrupción" (ya cubierto indirectamente por sanciones del operador, no implementado aquí) |
| GFI/AEP *Emerging Threats to Cargo and Port Security* | Socioeconomía del entorno + composición de carga de alto riesgo | No implementado esta sesión (requeriría cruce con `ceplan-geo`) |

## 3. La dimensión nueva: TBML vía SUNAT aduanas

`apps/infraestructura-mtc/api/src/ingest/aduanas-tbml-join.ts`. Cruza `terminales_portuarios`
contra `port_subpartida_imports` de `sunat-aduanas` (Anuario SUNAT cdro_16: FOB/CIF por
aduana × subpartida × año, 2023-2024).

**Por qué razón CIF/FOB y no precio-por-unidad**: `port_subpartida_imports` no tiene columna de
cantidad/peso, solo valores en USD — no se puede calcular precio-por-kg contra un benchmark
externo (UN Comtrade, que es lo que FATF realmente recomienda). La señal computable con lo que
ya existe es la razón CIF/FOB: el flete+seguro declarado como fracción del FOB debería ser
razonablemente estable entre aduanas para la misma subpartida. Una desviación grande frente a la
**mediana nacional de esa subpartida** (benchmark interno, no externo) es la misma lógica del
red flag FATF de "discrepancia significativa de valor declarado".

- Mediana calculada por (subpartida, año) — nunca mezclando 2023 y 2024, porque el flete
  internacional varía por año.
- Solo se calcula mediana con ≥3 aduanas reportando esa subpartida/año (`MIN_ADUANAS_PARA_MEDIANA`)
  — con 1-2 observaciones, "mediana" es ruido, no un benchmark.
- Umbral de anomalía: desviación relativa >20% (`UMBRAL_DESVIACION`) — elección propia de este índice; FATF solo describe el red flag como "discrepancia significativa" sin fijar un número.
- Agregación por aduana: fracción del **valor FOB** (no del conteo de filas) que cae en
  subpartidas anómalas — una fila grande anómala pesa más que diez chicas normales.
- Match terminal→aduana en `matchTerminalToAduana`: overrides verificados (mismas 9 entradas de
  la bahía del Callao que ya usa `cargas-portuarias-join.ts` para el join APN, menos San
  Nicolás/Huarmey, que no tienen aduana SUNAT propia) + alias corto para nombres compuestos
  (Callao/Matarani) + palabra completa para el resto.

### Hallazgo real, honesto: la señal actual es casi nula

**Nota sobre un bug corregido en el camino**: la primera corrida de esta sección (y toda la
investigación inicial) se hizo contra datos de `sunat-aduanas` corruptos — el parser
`normalizeCdro16()` asumía una columna vacía en el XLSX que no existe en el archivo real,
desalineando `subpartida` (quedaba con el texto de la descripción) y `product_desc` (quedaba
con un número). CodeRabbit lo señaló en la review de este PR; se verificó en vivo contra el
XLSX real con `XLSX.utils.sheet_to_json`, se corrigió el parser, se agregó test de regresión y
se re-ingestó `sunat-aduanas` localmente (627 → 712 filas correctas). Los números de abajo son
de la corrida **después** de ese fix — ver también `apps/sunat-aduanas/api/src/ingest/normalize.ts`.

Corrida completa contra los datos reales locales, ya corregidos (712 filas, 19 aduanas, 2023-2024):

| Aduana | % valor anómalo | Filas evaluadas |
|---|---:|---:|
| DESAGUADERO | 1.4% | 9 |
| **Las otras 16 aduanas con benchmark** | **0.0%** | 2-27 cada una |

De 455 combinaciones (subpartida, año), solo 53 tienen ≥3 aduanas reportando (benchmark
robusto). El hallazgo cualitativo es el mismo que con los datos corruptos — la razón CIF/FOB es
estable entre aduanas para casi todas las subpartidas — pero ahora está respaldado por códigos
arancelarios reales, no por texto de descripción colisionando como clave de agrupación.

**Esto no es un bug: es el resultado real del proxy con los datos disponibles.** Dos lecturas
posibles, ninguna descartable con la evidencia actual:
1. El flete/seguro declarado es genuinamente estable entre aduanas peruanas para la mayoría de
   subpartidas — el mecanismo de TBML más común no pasa por inflar el componente CIF-FOB, sino
   por sub/sobrefacturar el valor FOB de la mercancía frente a su precio de mercado real (lo que
   FATF mide con benchmarks de Comtrade, no con CIF/FOB interno).
2. Dos años (2023-2024) y 17 aduanas no dan suficiente varianza estadística para que el método
   de mediana-nacional detecte algo, incluso si existiera.

**Conclusión práctica**: la dimensión queda implementada, probada y conectada end-to-end (38/151
terminales con match de aduana, con datos de SUNAT ya corregidos), pero **hoy no aporta señal
real** — es infraestructura lista para cuando haya más años de datos SUNAT o, mejor, un cruce
con un benchmark de precios externo (UN Comtrade/Banco Mundial), que es lo que FATF realmente
recomienda y lo que PRD-004 original nunca tuvo presupuestado.

## 4. Normalización y pesos (OECD/JRC)

Cada componente crudo se divide por su máximo posible antes de ponderar (`MAXIMOS_COMPONENTES_V3`
en `vulnerabilidad-scoring.ts`) — método de "re-scaling" del Handbook. Sumar puntajes crudos de
escalas distintas con pesos fijos (lo que hacían v1/v2) hace que el peso *real* de un componente
dependa de su escala, no solo del peso nominal.

**Pesos**: no se re-ponderaron los 7 componentes heredados con un criterio nuevo (eso sería
editorial, no justificado por ninguna fuente). Se comprimieron proporcionalmente los pesos
nominales de v1/v2 (25/20/15/10/10/20/10, que sumaban 110% sin normalizar) por un factor 85/110,
dejando 15 puntos porcentuales para TBML — la única dimensión que mide exposición a tráfico
ilícito directamente. El 15% es una elección deliberada, documentada como tal, no derivada de los
datos.

```
PESOS_V3 = {
  estadoConservacion: 19.32%, esConcesionado: 15.45%, alcance: 11.59%,
  ambito: 7.73%, tieneGeolocalizacion: 7.73%, volumenHistorico: 15.45%,
  variacion3Anios: 7.73%, tbml: 15.00%
}  // suma = 100.00%
```

## 5. Análisis de sensibilidad (OECD/JRC, obligatorio antes de publicar un ranking)

Corrido contra los 151 terminales reales (local, 2026-10-05, con los datos de SUNAT ya
corregidos), comparando el top-10 del ranking base contra dos escenarios alternativos:

| Escenario | Overlap top-10 vs. base |
|---|---:|
| Pesos iguales (1/8 cada componente) | 8/10 |
| TBML duplicado (30%, resto comprimido a 70%) | 10/10 |

El overlap de 10/10 con TBML duplicado **no es evidencia de robustez** — es consecuencia directa
de que la señal TBML es ~0 en casi todos los terminales (§3): duplicar el peso de un componente
que vale 0 no mueve nada. El overlap de 8/10 con pesos iguales es la comparación más informativa
hoy: el ranking es razonablemente estable (80% de coincidencia en el top-10) ante un esquema de
pesos bastante distinto al elegido, lo que es la señal que el Handbook pide antes de publicar.

## 6. Pendiente, fuera de alcance de esta sesión

- **GAFILAT / tipologías regionales**: cruzar operador-concesionario del puerto contra
  `proveedores-sancionados` (sanciones OSCE) — necesita el crosswalk entidad↔RUC, no construido
  aquí.
- **GFI/AEP (socioeconomía del entorno)**: indicador de pobreza/informalidad distrital vía
  `ceplan-geo` — no implementado.
- **Benchmark externo de precios (UN Comtrade/Banco Mundial)**: la mejora que realmente
  destrabaría la dimensión TBML (ver §3) — requiere integrar una API externa nueva, no solo
  cruzar datos ya existentes en Rastro.
- **Pesos vía ANP/comparación pareada de expertos**: descartado por alcance (requiere panel de
  expertos), se usó compresión proporcional documentada en su lugar.

## 7. Verificación en vivo (2026-10-05, local, con el bug de `sunat-aduanas` ya corregido)

- `POST /api/terminales/vulnerabilidad/calcular {"fuente":"MTC+CARGAS+SUNAT_V3"}`: 151/151
  terminales procesados e insertados. Cobertura tráfico 60/151 (igual que v2). Cobertura TBML
  38/151 (tras corregir el matcher de aduana para incluir los 9 overrides de la bahía del
  Callao y el alias `mollendo` — sin los overrides de Callao, 23/151).
- Guard nuevo: `POST /calcular` con `fuente:"MTC+CARGAS+SUNAT_V3"` devuelve 409 si
  `port_subpartida_imports` no tiene filas o no hay ningún grupo (subpartida, año) con
  benchmark robusto — nunca un v3 degradado en silencio a `tbmlScore: null` en todos los
  terminales (mismo patrón que el guard de tráfico de v2, hallazgo de review de este PR).
- `apps/infraestructura-mtc/api` — 113 tests en verde (22 se saltan sin `DATABASE_URL`).
- `apps/sunat-aduanas/api` — 2 tests nuevos de regresión para `normalizeCdro16` (el bug del
  column-swap), suite completa en verde.
- `tsc --noEmit` limpio en ambas apps.
- Re-análisis de sensibilidad (§5) corrido contra los datos de SUNAT ya corregidos: mismos
  resultados (8/10 y 10/10) — confirma que el hallazgo de señal TBML ~0 no era un artefacto de
  la corrupción de datos.

## Fuentes de la investigación de metodologías

- [OECD/JRC Handbook on Constructing Composite Indicators](https://www.oecd.org/content/dam/oecd/en/publications/reports/2008/08/handbook-on-constructing-composite-indicators-methodology-and-user-guide_g1gh9301/9789264043466-en.pdf)
- [FATF — Trade-Based Money Laundering Risk Indicators](https://www.fatf-gafi.org/content/dam/fatf-gafi/reports/Trade-Based-Money-Laundering-Risk-Indicators.pdf)
- [GAFILAT — Cuarta Actualización del Informe de Amenazas Regionales en materia de LA/FT](https://biblioteca.gafilat.org/wp-content/uploads/2024/09/20240905-Cuarta-Actualizacion-del-Informe-de-amenazas-Regionales-en-materia-de-LA-FT.pdf)
- [PortMATE — Port/Border Crossing Monitoring and Anti-Trafficking Evaluation Tool](https://www.traffic.org/site/assets/files/16117/portmate_categories_overview_and_template_sept2021.pdf)
- [Emerging Threats to Cargo and Port Security — Global Financial Integrity](https://gfintegrity.org/report/emerging-threats-to-cargo-and-port-security/)
- [Risk Assessment Methodology for Vessel Traffic in Ports by Defining the Nautical Port Risk Index](https://doi.org/10.3390/jmse8010010)
- [Andina — SUNAT detectó más de 3.3 toneladas de cocaína en los puertos del Callao y Paita](https://andina.pe/agencia/noticia-sunat-detecto-mas-33-toneladas-cocaina-los-puertos-del-callao-y-paita-998915.aspx)
