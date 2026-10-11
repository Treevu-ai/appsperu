# Contrato de datos: trazabilidad EUDR

**Migración:** `013_eudr_trazabilidad.sql`
**Estado:** diseño aplicado a esquema; pendiente de carga de datos por las organizaciones.
**Fecha:** 11 de octubre de 2026

---

## 1. Qué resuelve

El proyecto tenía organización, socios, certificaciones y exportaciones, pero **ninguna
geolocalización**. Sin geolocalización no hay declaración EUDR posible: el Reglamento (UE)
2023/1115 exige en su artículo 9(1)(d) el punto de latitud y longitud de cada parcela y,
para las parcelas de más de 4 hectáreas, el polígono.

Esta migración abre esa dimensión con cinco tablas y dos vistas.

## 2. Modelo

```
eudr_parcela          la parcela y su geometría (el requisito duro)
      │
      └── eudr_lote_parcela      qué parcelas componen un lote, y en qué proporción
                │
eudr_lote            el lote de producción (campaña, cosecha, peso)
      │
      ├── eudr_lote_embarque     lote → DUA (anio, aduana, dua_numero)
      │
      └── eudr_declaracion_lote  lote → DDS
                │
eudr_declaracion     la declaración de diligencia debida (DDS)
```

## 3. La regla de los 4 hectáreas

Es el único umbral numérico que impone el reglamento, y está codificado dos veces:

1. **Constraint de ingreso** `chk_eudr_parcela_umbral`: una parcela de más de 4 ha no puede
   entrar declarada como `PUNTO`. Obliga a que se declare `POLIGONO`.
2. **Columna generada** `cumple_geolocalizacion_eudr`: comparada contra el umbral, calculada
   por la base, no declarada por quien carga. No se puede maquillar el indicador.

## 4. Decisiones de diseño

**La geometría se guarda como vino.** GeoJSON en un `JSONB`, con el sistema de referencia
declarado explícitamente (`WGS84 (EPSG:4326)` por defecto). No se reproyecta, no se
"corrige", no se convierte a PostGIS. Si una organización manda coordenadas en PSAD56, se
guardan como PSAD56 y se anota: forzar una conversión silenciosa introduciría un error de
hasta decenas de metros, que en una auditoría es indistinguible de una falsificación.

**El cumplimiento se calcula, no se declara.** Ver columna generada arriba.

**La procedencia del dato es una columna obligatoria.** `fuente` distingue `DECLARADA`,
`MEDIDA` (GPS en campo), `DERIVADA_GIS` (digitalizada de imagen) y `ESTIMADA`. No tienen la
misma fuerza probatoria y una auditoría lo va a preguntar.

**Sin FK a las DUAs, y no por elección.** `eudr_lote_embarque` apunta a
`(anio, aduana_codigo, dua_numero)`. La primera versión de este contrato citaba una
tabla `ruc_fob_dua` como destino del JOIN. **Verificado el 2026-10-11: esa tabla no
existe en la base.** Las DUAs viven en `BASE CONSOLIDADA.xlsx`, hoja `RUC_FOB_DUA`.
La base local solo tiene `ruc_exportaciones_fob`, que trae FOB agregado por
mes/aduana/agente/país y **no** trae número de DUA. El enlace es por convención de
clave contra la fuente Excel, no contra una tabla.

Esto deja una tarea abierta: **ingerir `RUC_FOB_DUA` como tabla propia**
(migración + conector) para que la trazabilidad parcela → lote → DUA se resuelva
dentro de la base y no contra un Excel.

**Validación de rango para Perú.** `latitud BETWEEN -18.5 AND 1.0` y
`longitud BETWEEN -81.5 AND -68.0`. El fallo más común al cargar coordenadas a mano es
invertir lat/lon o equivocar el signo; este CHECK lo atrapa en el ingreso.

**Códigos de parcela.** Muchas organizaciones no tienen código interno. Se admite
`codigo_generado = TRUE` y se genera `ORG-NN`, en lugar de bloquear la carga o dejar el
campo vacío y romper el índice único.

## 5. Vistas

### `v_eudr_cobertura_org`
Una fila por organización: parcelas, cuántas cumplen geolocalización, porcentaje, área total,
lotes y declaraciones. Es la que contesta "¿cuánto falta para que esta organización pueda
declar?".

### `v_eudr_trazabilidad`
Una fila por parcela con todo el camino hasta el embarque y la DDS. Responde las dos
preguntas de una auditoría: "¿de qué parcelas salió este contenedor?" y "¿a dónde fue a parar
el café de esta parcela?".

## 6. Plantilla de recolección

Las organizaciones no cargan directo en la base. Se les entrega
`plantilla_trazabilidad_parcelas.csv` (y su versión Excel con validaciones), que se ingresa
por un conector con el mismo patrón que el resto del proyecto.

Campos de la plantilla y su validación:

| Campo | Obligatorio | Validación |
|---|---|---|
| `ruc` | sí | 11 dígitos, debe existir en `contribuyentes` |
| `codigo_parcela` | sí | texto; si viene vacío se genera `ORG-NN` |
| `cultivo` | sí | `CAFE` o `CACAO` |
| `area_ha` | sí | número > 0 |
| `tipo_geometria` | sí | `PUNTO` o `POLIGONO`; >4 ha fuerza `POLIGONO` |
| `latitud` / `longitud` | si `PUNTO` | rango Perú; no se admiten las dos formas a la vez |
| `poligono_geojson` | si `POLIGONO` | JSON válido, RFC 7946 |
| `sistema_referencia` | no | default `WGS84 (EPSG:4326)` |
| `fecha_establecimiento` | no | fecha |
| `fuente` | no | `DECLARADA`, `MEDIDA`, `DERIVADA_GIS`, `ESTIMADA` |

## 7. Lo que falta

- **Conector de ingesta** con el patrón de `src/ingest/` (connector + normalize).
- **Ruta HTTP** y sus tests, siguiendo `src/routes/`.
- **Datos reales.** Ninguna de las 174 organizaciones ha entregado geolocalización todavía;
  la plantilla es el paso siguiente.

## 8. Advertencia metodológica

La geolocalización es el dato más fácil de falsificar y el más difícil de verificar. Un punto
en el centro de una parcela puede caer en un área protegida, en un título de concesión o en
zonas de alerta de deforestación MINAM. El proyecto `territorio-inteligencia` ya ingiere esas
alertas, pero su catastro está indexado **por nombre de titular, no por RUC**, así que un
cruce automático produce falsos positivos. Cualquier análisis de riesgo debe declarar el nivel
de confianza del match, no presentarlo como evidencia dura.
