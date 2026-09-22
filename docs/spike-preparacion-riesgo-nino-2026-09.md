# Spike PRV-01 — Preparación de inversión vs. brechas de infraestructura crítica (Fenómeno El Niño)

Verificado en vivo 2026-09-21 contra Postgres real (`emergencias-indeci`, `radar-inversiones`,
`infobras`), no muestra ni estimación.

## 1. Valores reales de `peligro` (INDECI, 142,139 filas)

| Peligro | Filas |
|---|---|
| LLUVIA INTENSA | 42,824 |
| INUNDACION | 7,614 |
| DESLIZAMIENTO | 5,911 |
| HUAYCO | 2,753 |
| EROSION | 2,663 |
| DERRUMBE DE CERRO | 1,850 |
| MAREJADA | 191 |

**Decisión:** `peligro IN ('LLUVIA INTENSA','INUNDACION','HUAYCO','DESLIZAMIENTO','EROSION')` como
set de "relacionado a El Niño" para PRV-02. `DERRUMBE DE CERRO` y `MAREJADA` quedan fuera del set
por defecto (causas mixtas / costero puntual) pero el query param debe permitir ampliarlo.

## 2. Hallazgo negativo — `investments.funcion` NO sirve para filtrar prevención/GRD

Los 28 valores reales de `funcion` en `radar-inversiones.investments` (nacional, 31,002 filas) no
incluyen ningún valor de "Gestión del Riesgo de Desastres". Los más cercanos —
`PLANEAMIENTO, GESTIÓN Y RESERVA DE CONTINGENCIA` (1,768) y `AMBIENTE` (1,179) — son demasiado
amplios para aislar infraestructura de prevención específica (defensas ribereñas, drenaje,
descolmatación). **PRV-02 no debe filtrar por `funcion`.**

## 3. Filtro que sí funciona — búsqueda por `nombre`

```sql
nombre ILIKE '%defensa riberen%' OR nombre ILIKE '%defensa ribere%'
  OR nombre ILIKE '%descolmat%' OR nombre ILIKE '%drenaje pluvial%'
  OR nombre ILIKE '%encauzamiento%'
```

Nacional: 199 coincidencias (algunas pueden solaparse por múltiples keywords en un mismo nombre).
Por departamento ingerido localmente: LA LIBERTAD 19, AREQUIPA 69, LIMA 43.

**Caveat real:** esto es búsqueda de texto libre sobre `nombre`, no una clasificación oficial —
puede haber falsos negativos (proyectos de prevención con nombre que no usa estas palabras) y no
se afirma que sea exhaustivo. Documentar como `matcher: "nombre_keyword", exhaustivo: false` en
la respuesta del endpoint.

## 4. Cobertura de departamentos ingeridos localmente (2026-09-21)

`radar-inversiones` local solo tiene **LIMA, LA LIBERTAD, AREQUIPA** ingeridos — Lambayeque, Piura,
Cajamarca, Cusco (regiones de Fase 2) no están en el snapshot de desarrollo actual. **PRV-02 debe
probarse contra LA LIBERTAD** (coincide con el default de `infobras`'s `/api/crossref`); ampliar a
Lambayeque/Piura requiere correr `ingest:invierte` para esos departamentos primero, fuera de
alcance de este spike.

## 5. Cruce territorial real — La Libertad, primer resultado

Los 10 distritos de La Libertad con más emergencias El Niño-relacionadas (peligros del punto 1):

| Distrito | Emergencias | Damnificados | Viviendas destruidas |
|---|---|---|---|
| CHUGAY | 92 | 471 | 173 |
| SANTIAGO DE CHUCO | 90 | 1,583 | 399 |
| TAYABAMBA | 86 | 705 | 219 |
| CACHICADAN | 75 | 663 | 163 |
| PIAS | 59 | 498 | 132 |
| COCHORCO | 55 | 333 | 125 |
| QUIRUVILCA | 54 | 130 | 36 |
| BOLIVAR | 52 | 1,420 | 536 |
| HUAMACHUCO | 48 | 734 | 159 |
| MARCABAL | 45 | 505 | 161 |

De los 19 proyectos de inversión de prevención en La Libertad (punto 3), **solo 1 (QUIRUVILCA,
CUI 2455742, drenaje pluvial) cae en uno de estos 10 distritos** — y ese CUI no tiene ninguna obra
registrada en INFOBRAS todavía (universo de obras vs. inversiones activas, ver dato del contrato
de INFOBRAS: 6.6% de match nacional). Los otros 9 distritos con más historial de daños **no
tienen ningún proyecto de prevención con nombre reconocible en el pipeline actual de Invierte.pe**.

**Hallazgo adicional, no buscado:** el CUI 2133624 ("DEFENSA RIBEREÑA PARA EL RIO CHICAMA, TRAMO
PUENTE MORENO-PAMPAS DE JAGUEY") tiene `existe_paralizacion = true` en INFOBRAS (64.83% de avance
físico real). Es una obra de defensa ribereña activa **y paralizada**. Este es exactamente el tipo
de señal que PRV-02 debe superficiar automáticamente.

## Decisión

`AUTOMATIZABLE`. PRV-02 procede con:
- Filtro de `peligro` fijo (punto 1), ampliable por query param.
- Filtro de `nombre` por keyword (punto 3), documentado como no exhaustivo.
- Scope de prueba: LA LIBERTAD (única región costera con datos locales completos hoy).
- Metadata obligatoria: `matcher`, `exhaustivo: false`, `restriccion` (coincidencia territorial,
  no causalidad).
