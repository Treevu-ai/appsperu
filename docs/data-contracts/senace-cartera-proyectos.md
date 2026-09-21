# Data contract — SENACE: Cartera de Proyectos (certificación ambiental)

- Fuente oficial: SENACE (Servicio Nacional de Certificación Ambiental para las Inversiones
  Sostenibles) — Portal de Datos Abiertos, `datosabiertos.senace.gob.pe`.
- Ticket: ADS-04 (`docs/BACKLOG_Organismos_Adscritos_Consolidado_v1.md`).

## Dos sistemas distintos en el mismo dominio (importante no confundir)

1. **`/Api/`** — API REST documentada en `/Api/Help`, con 7 datastreams (`CarteraProyectos`,
   `ConsultorasAmbientales`, `GastoEspecifica`, `GastoFuente`, `GastoGenerica`, `Reclamos`,
   `SolicitudAcceso`, `Visitas`). Requiere `auth_key` — **no tenemos token válido**:
   ```bash
   curl -w "\nHTTP:%{http_code}\n" "https://datosabiertos.senace.gob.pe/Api/datastreams/CarteraProyectos?auth_key=test"
   # → HTTP 400 {"Message":"Token Invalido."}
   ```
   **Hallazgo de seguridad (fuera de alcance de este ticket, reportado por separado)**: la
   validación de `auth_key` es inconsistente entre datastreams — el datastream `Reclamos` de
   esta misma API **sí** devolvió datos reales (incluyendo DNI y nombre de ciudadanos) con el
   mismo valor de prueba `auth_key=test`. Ver `docs/seguridad/senace-reporte-vulnerabilidad-2026-09-21.md`.
   Este conector **no usa `/Api/` en absoluto**, precisamente por este hallazgo y porque además
   está gateado.

2. **`/home/CatalogoDatos/`** — portal público separado, sin autenticación, con datasets
   descargables (Excel/CSV/JSON/GeoJSON) mostrados en grillas JS (Wijmo). Las grillas llaman
   endpoints reales bajo `/home/VistaDatos/Json<Nombre>` que **sí son reproducibles con `curl`
   plano** (confirmado, sin sesión de navegador ni cookies). Este conector usa exclusivamente
   este segundo sistema.

## Endpoint usado por este conector

```
GET https://datosabiertos.senace.gob.pe/home/VistaDatos/JsonCarteraProyecto?q=<estado>
```

`q` es el filtro de estado del proyecto. Verificado en vivo 2026-09-21 con los 3 valores reales
(sensibles a mayúsculas/tildes exactas observadas en la respuesta):

| `q` | Filas | `ESTADO` en la respuesta |
|---|---|---|
| `Aprobado` | 1,568 | `Aprobado` |
| `Desaprobado` | 176 | `Desaprobado` |
| `En Evaluacion` (sin tilde en el query, con tilde en la respuesta) | 126 | `En Evaluación` |

Total: **1,870 filas**. No se descubrió un valor de `q` que devuelva las 3 en una sola llamada —
el conector hace 3 llamadas, una por estado conocido.

### Otros endpoints descubiertos en `/home/VistaDatos/` (catálogo público, fuera de alcance)

`accesoinfo`, `consultorasambientales`, `gastoespefica` (sic, typo real del backend), `gastofuente`,
`gastogenerica`, `nomina`, `reclamo`, `talleres`, `viaticos` — no verificados ni usados por este
conector. `reclamo` en particular **no se investigó deliberadamente**: por el mismo patrón que el
hallazgo de seguridad en `/Api/Reclamos`, es razonable esperar que contenga PII de ciudadanos: se
deja fuera de alcance de Rastro sin excepción, no solo de este ticket.

## Schema real de la respuesta

```json
{
  "datos": {
    "labels": ["ID","TITULAR","RUC","TITULO_PROYECTO","UNIDAD_PROYECTO","TIPO","ACTIVIDAD",
               "FECHA_INICIO","ESTADO","DESCRIPCION","LONGITUD","LATITUD","RESOLUCION"],
    "formats": ["Int32","String", ...],
    "data": [ { "ID": 7, "TITULAR": "...", "RUC": "20520929658", "LONGITUD": -78.39, "LATITUD": -9.37, "LABEL": null, ... } ]
  }
}
```

- `FECHA_INICIO` viene como texto `DD/MM/YYYY` (ej. `"29/03/2019"`), no ISO — el conector lo
  parsea explícitamente.
- `LABEL` aparece siempre `null` en los datos reales observados — se guarda igual por si el
  backend lo llena en el futuro, no se descarta la fila si viene vacío.
- `RUC`: 7 de 1,870 filas (0.4%) no tienen RUC válido de 11 dígitos (titulares sin RUC registrado,
  ej. personas naturales o consorcios sin inscripción) — el conector no rechaza estas filas, solo
  guarda `ruc: null` cuando no matchea el patrón.
- `LONGITUD`/`LATITUD`: 0 filas nulas sobre las 1,870 verificadas.

## Clave de upsert

`ID` (entero) — verificado único globalmente sobre las 1,870 filas combinadas de los 3 estados
(1,870 IDs únicos de 1,870 filas, vía `Set`). No hay colisión de ID entre estados distintos (un
mismo proyecto no aparece dos veces con IDs diferentes por estado en los datos observados).

## Cobertura La Libertad

Confirmada en los datos reales: 68 filas con coincidencia de texto (provincias/distritos de La
Libertad mencionados en título/unidad/descripción/titular) y 197 filas dentro del bounding box
geográfico aproximado del departamento (`lat -6.4 a -8.7`, `lon -79.8 a -77.3` — aproximado, sin
polígono oficial; puede incluir falsos positivos cerca del borde con departamentos vecinos).
Ejemplos reales: "CREACIÓN DEL PUENTE DE ACCESO VIAL EN EL SECTOR LA GLORIA PROVINCIA DE VIRÚ"
(Municipalidad Provincial de Virú), "CANTERA RÍO CHICAMA II Y DME CEMENTERIO PAIJÁN" (Concesionaria
Vial del Sol, Autopista del Sol Tramo 2 — La Libertad/Áncash).

## Fuera de alcance de este conector

- Los 8 datasets restantes del catálogo público `/home/CatalogoDatos/` (ver tabla arriba).
- Toda la API `/Api/` (gateada, y con el hallazgo de seguridad documentado).
- Clasificación temática, cruce con OEFA/sanciones ambientales — posible Fase 2, no comprometida.
