# Hallazgo de integridad — Índice de Integridad en Contrataciones (IIC), piloto La Libertad

**Fecha de verificación:** 2026-10-15
**Alcance:** `indice_integridad_contrataciones` en la base de Neon de `compras-publicas`
(132 filas, `fecha_corte` 2026-10-13), verificadas contra `awards` (Neon) e
`inhabilitaciones` (base local `proveedores_sancionados`).

Este documento no describe una feature. Documenta dos resultados de una verificación
de datos reales: uno es un hallazgo sustantivo sobre La Libertad, el otro es un
**defecto de metodología que invalida la peor fila del índice**.

---

## 1. Qué es el índice (para poder leer lo que sigue)

`calcular-iic.ts` define el IIC como un score 0-10 donde **10 = menor riesgo**, con
tres sub-indicadores promediados:

| | Mide | Peor caso |
|---|---|---|
| **A** | % del monto adjudicado a proveedores con inhabilitación **vigente al momento de adjudicar** | 0 = todo el monto fue a sancionados |
| **B** | % de adjudicaciones registradas con **un solo postor** (proxy de ausencia de concurso competitivo) | 0 = todas con un solo postor |
| **C** | Concentración **HHI** de proveedores | 0 = un solo proveedor |

Se exige un mínimo de 5 adjudicaciones para calificar. Por debajo de eso,
`datos_insuficientes = true` y **no se asigna score** — el índice no reporta "riesgo
cero" por falta de dato, que es la decisión correcta y está implementada.

**Por entidad compradora, no por región.** Eso es lo que distingue al IIC de los
índices del IPE (INCORE/IRESA/IRBG/IRIS), que solo llegan a nivel de las 25 regiones.

---

## 2. El dato sustantivo: el riesgo está muy concentrado

Sobre 132 entidades, **118 califican** (14 quedan con datos insuficientes):

| Tramo | Entidades | Monto |
|---|---|---|
| 3–5 | **1** | S/ 35.4M |
| 5–7 | 5 | S/ 21.1M |
| 7–10 (riesgo bajo) | **112** | S/ 8,186.5M |

Score mínimo 4.93, máximo 9.81, promedio 8.86, mediana 9.17. Cobertura: 5,986
adjudicaciones, **S/ 8,248.6M**.

**La lectura honesta:** el índice no describe una región en crisis; describe una
región con **cinco o seis entidades atípicas** dentro de un universo mayoritariamente
sano. Eso importa para no malgastar capacidad de fiscalización: perseguir 132
entidades sería un error de asignación.

Dos señales acotadas que sí se sostienen sobre el crudo:

- **2 entidades** donde el 100% de las adjudicaciones tuvo un solo postor
  (`sub_indicador_b = 0`), por S/ 1.15M.
- **52 personas** aparecen con más de un RUC en `vw_conformacion_multi_ruc`
  (107 RUCs en total, máximo 3 por persona). Es una señal de riesgo de
  fragmentación de proveedor, no una prueba de nada.

La conformación societaria cubre 1,243 RUCs y 3,551 personas distintas en 6,198
filas. **Ninguna fila tiene rol director/gerente** — el dataset solo trae socios, así
que el índice de red no puede distinguir aún entre socio pasivo y administrador.

---

## 3. El defecto: la peor fila del índice no se reproduce

### El hecho

`MUNICIPALIDAD DISTRITAL DE CARABAMBA` es la **entidad con el peor score de todo el
índice** (4.93). Lo que la hunde es `sub_indicador_a = 0.00`, es decir: el índice
afirma que el **100% del monto** adjudicado fue a proveedores con inhabilitación
vigente al momento de adjudicar.

Se recalculó desde el crudo con la misma lógica que documenta `calcular-iic.ts`
(`limpiarRuc()` + `fechaEnVigencia()`), sobre las mismas 24 adjudicaciones de Neon:

| | Índice almacenado | Recálculo desde el crudo |
|---|---|---|
| Monto total | S/ 35,397,292 | S/ 35,397,292 ✔ |
| Monto a proveedores sancionados vigentes | **S/ 35,397,292 (100%)** | **S/ 81,363 (0.23%)** |
| `sub_indicador_a` | **0.00** | **9.98** |

Solo **1 de 24** adjudicaciones matchea una inhabilitación vigente: RUC
`20539700791`, por S/ 81,363.

Con `sub_indicador_a = 9.98` en vez de `0.00`, el score de Carabamba pasa de 4.93
(la peor entidad del índice) a un valor normal.

### La causa, confirmada

Se recomputó el índice completo (las 132 entidades, 5,986 adjudicaciones) replicando
`calcular-iic.ts` línea por línea. El recálculo **reproduce exactamente** el corte
almacenado del 2026-10-13 — Carabamba 4.93, GRL Unidad Ejecutora 5.20, GRL Gestión
5.21, Salud Julcán 6.65, SEGAT Trujillo 6.67. Eso descarta la hipótesis del
snapshot distinto de sanciones y deja una sola causa:

**La normalización min-max contra los pares.** `calcular-iic.ts:205-210` calcula:

```ts
const minA = Math.min(...pctSancA, 0);
const maxA = Math.max(...pctSancA, 0);
```

y luego `subA = 10 - normalizar0a10(pctMontoSancionado, minA, maxA)`.

El rango real del sub-indicador A sobre las 118 entidades calificables es
**[0, 0.0023]**: nadie adjudicó más del 0.23% del monto a proveedores con
inhabilitación vigente. Ese 0.23% es, en términos absolutos, un resultado
**excelente**. Pero al estirarlo a través del rango min-max, Carabamba — que tiene
el valor crudo más alto del universo — se normaliza a 10 y al invertir cae a **0**.

Es un artefacto de ranking relativo presentado como calidad absoluta: cuando todos
los pares son buenos, el menos bueno de todos queda etiquetado como el peor.

### Recomputación con escala absoluta

Los tres sub-indicadores crudos ya viven en [0,1] con significado absoluto
evidente: 0% de monto sancionado es bueno, 100% malo; 0% de adjudicaciones con un
solo postor es bueno, 100% malo; HHI 0 es un proveedor diversificado, 1 es un
monopolio. **No necesitan normalización contra pares.** Aplicando `10 - crudo*10`
directamente:

| | Índice actual | Escala absoluta |
|---|---|---|
| Tramo 3–5 | 1 entidad | **0 entidades** |
| Tramo 5–7 | 5 | 2 |
| Tramo 7–10 | 112 | 116 |
| Promedio | 8.86 | **9.20** |
| Carabamba | **4.93** (peor del índice) | **8.65** (sale del bottom-10) |

Las mayores divergencias, todas en la misma dirección — el índice actual castiga de
manera injustificada:

| Entidad | Actual | Absoluta | Δ |
|---|---|---|---|
| Municipalidad Distrital de Carabamba | 4.93 | 8.65 | **+3.72** |
| Servicio de Gestión Ambiental de Trujillo | 6.67 | 7.79 | +1.12 |
| GRL – Educación UAE Chépén | 6.93 | 7.96 | +1.03 |
| Municipalidad Distrital de Jequetepeque | 7.23 | 8.16 | +0.93 |

**Lo que sí se sostiene en ambas escalas:** las dos entidades realmente más
riesgosas son las **Unidades Ejecutoras del Gobierno Regional de La Libertad**
(5.20 y 5.21 en la escala actual; 5.69 y 5.70 en la absoluta). En su caso el
problema no es sanciones — ambas tienen 0% de monto sancionado — sino el
sub-indicador **B** (todas o casi todas las adjudicaciones con un solo postor) y la
concentración de proveedores. Son un hallazgo legítimo que sobrevive a la corrección.

Conviene notarlo: **las diez entidades peor rankeadas por el índice actual tienen
0% de monto sancionado**, salvo Carabamba con 0.23%. El sub-indicador A no estaba
explicando nada en ese tramo; la normalización relativa estaba agregando ruido.

La corrección **ya está aplicada al código y regenerada** el 2026-10-16 (la fecha
la calcula `toISOString()` en UTC; es el corte del 2026-10-15 noche hora Perú).

| | Corte 2026-10-13 (escala relativa) | Corte 2026-10-16 (escala absoluta) |
|---|---|---|
| Carabamba | **4.93**, `A=0.00` | **8.65**, `A=9.98` |
| Mínimo del índice | 4.93 | 5.69 |
| Promedio | 8.86 | **9.20** |
| Tramo <5 | 1 entidad | **0 entidades** |
| Tramo 5–7 | 5 | 2 |
| Tramo ≥7 | 112 | 116 |

Los dos cortes conviven en `indice_integridad_contrataciones` y **no son
comparables entre sí** — ver la advertencia del punto 5 de la sección 4.

### Un segundo problema, de dirección opuesta y mayor alcance

Al revisar por qué el join podía fallar apareció algo más amplio: **`supplier_id` no
siempre es un RUC.**

| Tipo de `supplier_id` | Adjudicaciones | Monto |
|---|---|---|
| RUC de 11 dígitos (válido) | 4,114 | S/ 3,014.3M |
| **No es RUC** (7 dígitos) | **1,872** | **S/ 5,234.3M** |

El 31% de las adjudicaciones y el **63.5% del monto** del índice usa un identificador
de 7 dígitos. Un RUC peruano tiene siempre 11 dígitos, así que esos 10,411 valores
distintos **jamás podrán matchear** `inhabilitaciones.ruc`.

`limpiarRuc()` solo elimina el prefijo `PE-RUC-` y no valida longitud. Consecuencia:
esos valores pasan el filtro como si fueran RUC y luego no matchean nada, lo que
**empuja el sub-indicador A hacia el mejor caso**. El sesgo es hacia subestimar el
riesgo, sobre casi dos tercios del monto.

Es el defecto contrario al de Carabamba, y no produce acusaciones falsas: produce
**falsos negativos**. Pero es más grave por alcance.

**Verificado como NO problema:** sobre la base local, los 11,398 valores de
`inhabilitaciones.ruc` son de 11 dígitos, y **cero** de los 10,411 IDs no-RUC de
`awards` colisionan con ellos. No hay falsos positivos por colisión de identificador.

---

## 4. Qué haría falta para cerrarlo

1. ~~**Recomputar el IIC** con el código actual y comparar contra el corte
   2026-10-13 fila por fila.~~ **Hecho 2026-10-15:** reproducción exacta, causa
   confirmada (normalización min-max).
2. ~~**Cambiar la normalización de `calcular-iic.ts` a escala absoluta.**~~
   **Hecho 2026-10-16:** `normalizar0a10(valor, min, max)` reemplazada por
   `aEscala0a10(crudo)` = `crudo * 10` recortado a [0,10]; eliminados los rangos
   `minA/maxA/minB/maxB/minC/maxC`. 152 tests verdes, typecheck limpio. Corte
   regenerado. **Lo que sí sobrevive a la corrección:** las Unidades Ejecutoras
   del GRL siguen siendo las dos peores entidades (5.69 y 5.70), por el
   sub-indicador B y la concentración, no por sanciones.
3. **Validar la longitud en `limpiarRuc()`:** si el identificador no tiene 11
   dígitos, no debe tratarse como RUC. La pregunta de diseño es qué hacer con ese
   63.5% del monto: excluirlo del sub-indicador A y marcar el índice como parcial,
   o resolver el identificador en el origen. **Lo que no es aceptable es dejarlo
   correr como si fuera un RUC válido.**
4. **Publicar la cobertura junto al score.** Un score calculado sobre el 36.5% del
   monto no es comparable con uno calculado sobre el 100%, y hoy la tabla no lo dice.
5. **RESUELTO-PARCIAL: la quiebra de escala entre cortes.** Los cortes 2026-10-13
   (relativa) y 2026-10-16 (absoluta) conviven en la misma tabla sin ninguna
   columna que indique qué escala usa cada uno. Un comparativo ingenuo entre ambos
   mostraría una "mejora" de +0.34 en el promedio que es **íntegramente
   metodológica**, no real: ningún proceso de contratación cambió en dos días. Queda
   pendiente decidir entre tres salidas — borrar el corte 2026-10-13 (que además
   contenía el valor erróneo de Carabamba), agregar una columna de metadato con la
   escala, o mantenerlo y dejarlo explícito en cualquier publicación. **No es una
   decisión que deba tomarse sola.**

---

## 5. Reproducción

Las verificaciones se hicieron contra:

- `compras-publicas` → Neon (`awards`, `procurement_processes`, `indice_integridad_contrataciones`, `vw_conformacion_multi_ruc`, `supplier_conformacion`)
- `proveedores-sancionados` → `docker compose -f apps/proveedores-sancionados/api/docker-compose.yml up -d` (puerto 5439, 11,398 `inhabilitaciones`, 6,739 `multas`)

El recálculo de Carabamba aplica sobre cada adjudicación:
`limpiarRuc(supplier_id)` → buscar en `inhabilitaciones` por RUC →
`fechaEnVigencia(fecha, desde, hasta)`, y acumula `valor_monto` cuando la
inhabilitación estaba vigente en la fecha de adjudicación. Es la misma lógica de
`apps/compras-publicas/api/src/ingest/calcular-iic.ts`.

---

## 6. Nota de método

Todas las cifras de este documento salen de consultas sobre los datos vivos del
2026-10-15. **No se afirmó nada sobre Carabamba hasta poder recomputarlo desde el
crudo**: la primera lectura del índice, leída en crudo y sin verificar, habría
producido una acusación grave contra una municipalidad distrital sobre un dato que
no se reproduce.

Ese es el motivo por el que este documento existe y no solo una fila corregida en la
base: el valor almacenado ya estaba publicado en el índice.
