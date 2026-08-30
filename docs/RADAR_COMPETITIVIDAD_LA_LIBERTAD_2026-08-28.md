# Radar de competitividad — La Libertad

**Corte fiscal:** 27 ago 2026 · **Corte BCRP:** ene 2026
**Fuentes:** consulta directa a Postgres de 7 apps del monorepo (sin pasar por las APIs Express)

Brechas de ejecución, alertas de integridad y bolsas de inversión movilizable para La
Libertad, leídas de radar-ejecucion, radar-inversiones, inversion-privada, INFOBRAS,
compras-publicas, proveedores-sancionados y bcrp-la-libertad.

## Panorama en cifras

| Indicador | Valor |
|---|---|
| Ejecución presupuestal (PIM S/23,067.2M) | **46.4%** |
| Sin ejecutar a dic. 2026 | **S/12,370.5M** |
| Obras paralizadas | **252** (S/2,183.0M ya valorizados) |
| Cartera VERTIX activa | **S/3,916.2M** (22 proyectos) |
| OxI por priorizar | **S/557.9M** (31 proyectos) |

## 1. Brechas — lo presupuestado no se está gastando

S/12,370.5M de los S/23,067.2M asignados a entidades de La Libertad para 2026 siguen sin
devengar a fin de agosto. La brecha se concentra en gobierno regional y en las
municipalidades con mayor presupuesto, no en montos menores dispersos.

| Entidad | Nivel | PIM S/M | Devengado S/M | Avance |
|---|---|---:|---:|---:|
| Región La Libertad — Sede Central | GR | 4,762.9 | 2,796.9 | 58.7% |
| Municipalidad Provincial Sánchez Carrión — Huamachuco | GL | 638.5 | 211.6 | 33.1% |
| Municipalidad Provincial de Trujillo | GL | 856.8 | 479.8 | 56.0% |
| Resto GR (13,676.4M PIM total) | GR | 8,913.5 | 3,929.4 | 44.1% |
| Resto GL (7,659.6M PIM total) | GL | 6,164.3 | 2,393.3 | 38.8% |
| GN con sede local | GN | 1,731.3 | 885.8 | 51.2% |

**Función con menor avance: Agropecuaria — 30.7%** (PIM S/574.7M). Es la función
presupuestal más rezagada de todas, no un promedio arrastrado por otro rubro — relevante
porque sostiene a la agroexportación de la región.

**Cartera pública en trámite (Invierte.pe):** S/56,421.1M — 7,998 proyectos activos a
nivel nacional con ficha viable. Gobiernos locales (S/20,307.0M) y regionales
(S/19,983.4M) concentran el 71% del costo actualizado, el mismo nivel de gobierno con la
ejecución más rezagada.

*Fuente: radar-ejecucion (`budget_execution`, corte 2026-08-27), radar-inversiones
(`investments`, estado=ACTIVO).*

## 2. Alertas — obras detenidas y proveedores a vigilar

252 obras públicas figuran paralizadas en INFOBRAS para La Libertad.

| Provincia | Obras paralizadas |
|---|---:|
| Sánchez Carrión | 59 |
| Trujillo | 47 |
| Santiago de Chuco | 33 |
| Pataz | 28 |
| Resto de provincias | 85 |

**Causal principal: conflictos sociales (20 obras)**, seguido de eventos climáticos (16),
deficiencias de expediente técnico (7) y desabastecimiento de materiales (7). El valor ya
ejecutado y hoy detenido asciende a **S/2,183.0M** — el campo de costo actualizado llega
vacío en el 100% de los registros paralizados directamente desde INFOBRAS, no por un error
del conector.

**Cruce con proveedores sancionados:** de 1,036 proveedores adjudicados en La Libertad
(`compras-publicas.awards`), 3 tienen RUC con inhabilitación vigente en el registro OSCE:

| Proveedor | RUC | Adjudicación | Fecha adjud. | Sanción |
|---|---|---:|---|---|
| Jemary'z S.A.C. | 20601217024 | S/299,999 | 2026-06-05 | Vigente hasta dic. 2026 |
| Agustina Servicios Generales S.A.C. | — | 2024 | 2024 | Vigente desde 2026 |
| Qubits Consulting S.A.C. | — | 2024 | 2024 | Vigente desde 2026 |

En los tres casos la adjudicación es anterior al inicio de la inhabilitación — no es
evidencia de incumplimiento en curso, sí candidatos a monitoreo mientras la sanción esté
vigente.

*Fuente: infobras (`public_works`, estado=PARALIZADA), compras-publicas (`awards`) ×
proveedores-sancionados (`inhabilitaciones`, vigente=true).*

## 3. Oportunidades — dónde hay capital privado listo para moverse

La cartera VERTIX y el mecanismo Obras por Impuestos ya identifican **S/5,246.0M** en
proyectos con algún grado de avance en La Libertad.

| Cartera | Estado | Proyectos | Monto S/M |
|---|---|---:|---:|
| VERTIX (PROINVERSIÓN) | Ejecución contractual | 18 | 2,054.5 |
| VERTIX (PROINVERSIÓN) | Estructuración | 2 | 1,271.6 |
| Obras por Impuestos | Priorizado | 13 | 576.7 |
| Obras por Impuestos | Por priorizar | 31 | 557.9 |
| Obras por Impuestos | Proceso de selección | 11 | 195.3 |

**Bolsa de movilización inmediata:** los 31 proyectos OxI "por priorizar" (S/557.9M) no
requieren estructuración desde cero — es la vía más rápida para convertir presupuesto sin
ejecutar en obra financiada con empresa privada.

**Sectores dominantes VERTIX:** telecomunicaciones (8 proyectos), agricultura/irrigación
(5), transporte y electricidad — coherente con el perfil agroexportador de la región y con
Agropecuaria como la función pública más rezagada en ejecución.

*Fuente: inversion-privada (`vertix_project_geometries`, `oxi_investment_promotions`).*

## 4. Ampliación — agro, seguridad ciudadana e identidad fiscal

*(Añadido 2026-08-28, segunda pasada: actividad-agraria, seguridad-ciudadana e
identidad-fiscal, las 3 de las 4 apps que habían quedado pendientes por tiempo, ahora sí
consultadas con datos reales.)*

**Actividad agraria (MIDAGRI) — el sector crece, pero sin respaldo de inversión pública
proporcional.** El VBP agropecuario de La Libertad creció **+6.2%** interanual en 2024
(agrícola +10.4%, pecuario 0.0%), sobre 2,524,943 ha cultivadas y ~116,000 productores. Es
una tensión directa con el hallazgo de la sección 1: **Agropecuaria es la función
presupuestal con menor avance de ejecución (30.7%)** — el sector más dinámico de la
economía regional es también el peor atendido por el gasto público. El jornal agrícola
(feb. 2026) es de **S/48.76/día**, puesto 18 de 23 regiones — por debajo de la mediana
nacional pese al crecimiento del valor agregado del sector.

**Seguridad ciudadana (SIDPOL/MININTER) — La Libertad es la 4ª región con más denuncias
del país.** 23,994 denuncias en 2026 (año parcial a jul.), detrás solo de Lima
Metropolitana, Lambayeque y Arequipa. **Extorsión: 1,834 denuncias** — un riesgo directo
para el clima de inversión, particularmente en transporte y construcción, sectores con
proyectos VERTIX activos en la región (sección 3). Trujillo concentra el 69% de las
denuncias regionales (16,508 de 23,994); le siguen Virú, Pacasmayo y Chepén.

**Identidad fiscal (SUNAT) — base empresarial formal sólida, pero con alta mortalidad.**
106,918 empresas (persona jurídica) tienen domicilio fiscal en La Libertad; solo
**43,586 están activas (40.8%)** — 53.6% figura en "baja de oficio" (dada de baja por
SUNAT). Pese a esa mortalidad, La Libertad es la **3ª región del país en empresas
activas**, detrás solo de Lima y Arequipa — la base formal es comparativamente sólida, el
problema es de permanencia, no de creación.

*Fuente: actividad-agraria (`agricultural_wage`, `agricultural_regional_outcome`),
seguridad-ciudadana (`police_reports`, corte jul. 2026), identidad-fiscal
(`contribuyentes`, ubigeo LIKE '13%').*

## 5. Metodología y límites

- **BCRP La Libertad (ene. 2026):** gasto no financiero regional S/757M, formación bruta
  de capital S/198M — cifras confiables. Los anexos sectoriales (agropecuario, crédito,
  depósitos) llegan mayormente vacíos por ambigüedad del espacio como separador de miles
  en el PDF fuente (documentado en ADR-0014); no se usan como fuente cruzada en este corte.
- **ceplan-estrategico — excluida por diseño de datos:** sus tablas no tienen columna de
  departamento/región; el esquema actual no permite un corte por "La Libertad".
- **salud-institucional — excluida por arquitectura:** no tiene Postgres propio, calcula su
  score cruzando en vivo las mismas fuentes ya cubiertas arriba (radar-ejecucion,
  compras-publicas, infobras, identidad-fiscal, radar-inversiones); no se levantó su
  servidor Express por tiempo, pero no aportaría datos nuevos.
- **bcrp-comercio-exterior — excluida por diseño de datos y por falta de ingesta:** su
  tabla `trade_indicators` es comercio exterior nacional agregado, sin columna de
  departamento/región (no admite corte territorial); además no tiene datos ingeridos en
  este entorno (0 filas).
- **Señales de compras-públicas (`contract_signals`):** 3,249 señales tipo S04/S09 en
  municipios de La Libertad, todas con severidad `INFO` — el catálogo de tipos S01-S13 aún
  no está calibrado para distinguir cuáles ameritan revisión.

---
*Generado 2026-08-28. Ver también:
[MEMO_LA_LIBERTAD_BRECHA_INVERSION_PUBLICA_PRIVADA_POR_SECTOR_2026-08-28.md](MEMO_LA_LIBERTAD_BRECHA_INVERSION_PUBLICA_PRIVADA_POR_SECTOR_2026-08-28.md).*
