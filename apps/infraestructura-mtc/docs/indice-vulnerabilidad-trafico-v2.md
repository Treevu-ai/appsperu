# Índice de Vulnerabilidad Portuaria — v2-tráfico (VUL-11/12/13)

> **Fuente:** `fuente_datos = 'MTC+CARGAS_2017'` en `indice_vulnerabilidad_portuaria`.
> **Fecha:** 2026-10-03.

---

## 1. Dos "v2" distintos — no confundir

Este archivo documenta el enriquecimiento con volumen de carga histórico APN (VUL-11/12/13 del
backlog, Épica 4). **Ya existe otro "v2" en el mismo código** (`GET /vulnerabilidad/clima`,
riesgo climático vía ANA SNIRH), construido en una sesión anterior. Son dos enriquecimientos
**independientes** sobre el mismo v1 (estado/concesión/alcance/ámbito/geo), no una cadena
v1→v2→v3. `fuente_datos` los distingue: `'MTC_2025'` (v1 puro), `'MTC+CARGAS_2017'` (este), y el
score climático que se calcula al vuelo sin persistirse bajo una tercera `fuente_datos` propia.

## 2. Qué mide realmente esta versión (tensión con el v1)

El PRD-004 (§1) define el índice original para "rankear terminales según su exposición a
riesgos de lavado, contrabando y tráfico ilegal" — ahí, **más volumen de carga = más
exposición** (más oportunidad). La metodología v1 ya implementada mide algo distinto:
abandono institucional (estado físico, falta de concesión, falta de geo). Este v2-tráfico
**combina ambas construcciones bajo un solo número**, sin reescalar los pesos de v1 (quedan
igual que en v1, que ya sumaba 80% nominal, no 100%) — es una decisión de diseño heredada del
propio PRD-004 §3, no algo nuevo introducido aquí, pero vale dejarlo explícito: el score final
mezcla "institucionalmente descuidado" con "mucho tráfico/crece rápido", que no siempre apuntan
en la misma dirección de riesgo real.

## 3. VUL-11 — el join (cobertura real: 60/151 terminales, ~40%)

`matchTerminalToPuerto()` en `src/ingest/cargas-portuarias-join.ts`:

1. Primero revisa una tabla de **18 overrides verificados manualmente** contra el XLSX real
   (no son suposición — cada uno cita la fila de detalle del anuario 2010-2017 que lo respalda),
   para los casos donde el nombre del operador no menciona el puerto/bahía (ej. "Perú LNG
   Melchorita" → Callao, porque APN agrupaba Chancay/Ventanilla/Conchán/Melchorita bajo la
   jurisdicción administrativa "Callao" aunque Melchorita esté en Cañete).
2. Si no hay override, busca el nombre del puerto como palabra completa dentro de
   `nombre_terminal` o `label_terminal` (normalizado: sin tildes, sin mayúsculas, sin
   paréntesis).
3. Si no hay evidencia de ninguna de las dos formas, devuelve `null` — **no se fuerza un match
   dudoso.**

**Por qué solo 60/151:** la mayoría de los terminales sin match son embarcaderos pequeños e
informales de Loreto/Ucayali (ej. "A.N KERO E.I.R.L", "Alpi Cargo") que estructuralmente nunca
estuvieron en el anuario estadístico de la APN 2010-2017 (ese anuario solo cubre instalaciones
formales de uso público/privado reportadas centralmente) — no es un fallo del matching, es el
gap de cobertura ya documentado en
`apps/infraestructura-mtc/docs/estructura-cargas-apn-2010-2017.md` §5-6.

## 4. VUL-12 — la fórmula y la decisión del default para "sin match"

```
score_v2 = score_v1 + volumenScore * 0.20 + variacionScore * 0.10
```

- `volumenScore` (0/10/25/50/75): bucket por TM del puerto en 2017, con umbrales fijos derivados
  de los 19 puertos reales del anuario (ver `computeVolumenScore` en `cargas-portuarias-join.ts`).
- `variacionScore` (0/10/25/50/75): bucket por variación 2015→2017. Un puerto con 0 TM en 2015
  que aparece con TM en 2017 se trata como "entra en operación" (score alto), no como variación
  infinita.

**Decisión deliberada que se desvía de la convención v1:** en v1, un campo faltante (ej.
`estado_conservacion = null`) recibe el score más alto ("dato faltante es riesgo"). Aquí, un
terminal **sin match** recibe `volumenScore = variacionScore = null`, que se suman como `0` — es
decir, **no** se le aplica el default de riesgo alto. Razón: para ~60% de los terminales, "no
aparece en el anuario 2010-2017" no es un vacío de reporte (el dato existe pero no se encontró),
es una ausencia estructural (ese terminal nunca estuvo en el alcance de esa fuente). Tratarlo
como riesgo alto habría duplicado la señal que `alcance=Local`/`ambito=Fluvial` ya capturan en
v1, bajo un nombre distinto, e inflado artificialmente el score de los ~90 embarcaderos pequeños
sin ninguna evidencia real de tráfico.

## 5. Resultado observado (corrida real contra Neon, 2026-10-03)

- 151/151 terminales procesados e insertados con `fuente_datos='MTC+CARGAS_2017'`.
- 60/151 con match de tráfico real.
- Top vulnerable (score > 30): Ilo, Yurimaguas (x2 — puerto y terminal detalle), Shougang Hierro
  Perú (San Nicolás), Multiboyas TRALSA (Callao), Henry-Pucallpa, Petroperú-Bayóvar, Multiboyas
  Zeta Gas Andino (Callao) — combinación de alto volumen/crecimiento con mal estado o falta de
  concesión en v1, consistente con el diseño.

## 6. Pendiente (no implementado en esta sesión)

- **VUL-14/15/16** (solicitud APN de datos 2018-2025): borrador listo en
  `docs/VUL-14-solicitud-apn-borrador.md`, no enviado — acción del usuario.
- Los ~15 overrides con evidencia insuficiente para confirmar (ej. "Multiboyas Mina Justa",
  "Multiboyas Solgas - Ventanilla", "Multiboyas Valero Perú") se dejaron deliberadamente sin
  mapear en vez de forzar una coincidencia sin verificar.
- No se re-normalizaron los pesos de v1 al agregar volumen/variación — queda igual que lo
  especificado en PRD-004 §3, aunque el total nominal de pesos supere 100%.
