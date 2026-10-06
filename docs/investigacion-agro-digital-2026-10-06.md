# Investigación de Agro Digital MIDAGRI - 2026-10-06

## Resumen Ejecutivo

Esta investigación evaluó nuevas fuentes de datos agro digitales del MIDAGRI para el proyecto Rastro. Se identificaron tres fuentes principales:

1. **Georural Catastro Rural API** - Viabilidad limitada (MaxRecordCount=1000)
2. **SERFOR OCAPAS_MIDAGRI API** - Viabilidad recomendada (MaxRecordCount=1M)
3. **AgroDigital App** - No viable sin contacto oficial (sin API pública)

**Recomendación**: Implementar conector para SERFOR OCAPAS_MIDAGRI (capas de Comunidades Campesinas/Nativas) como primera fase.

---

## 1. Conectores Agrarios Existentes

### ✅ `actividad-agraria` (Completamente implementado)
- **Jornal agrícola**: Valor S/ por día (2018-2026) - departamental mensual
- **Alquiler tractor**: Precio S/ (2018-2026) - departamental mensual
- **Alquiler yunta**: Precio S/ (2018-2026) - departamental mensual
- **Cruce con radar-ejecucion**: FUNCION=AGROPECUARIA por departamento

### ✅ `midagri-dgaaa` (Fase 0: solo ingesta)
- **Estudios de suelos**: 18 estudios 2024-2025
- Sin API expuesta aún

### ✅ `identidad-fiscal` (Padrón PPA)
- **Padrón de Productores Agrarios**: 596/596 cooperativas registradas (100%)
- Solo confirma registro, sin datos de cultivo/hectáreas

### ✅ `senasa-ejecucion` (Fase 0: solo ingesta)
- **Ejecución física presupuestal**: Actividades sanidad agraria (2021-2026)
- 6,814 filas - granularidad distrital mensual

---

## 2. Nuevas Fuentes Identificadas

### 2.1 Georural Catastro Rural API

**Endpoint**: `https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer`

**Capas disponibles**:
- **Predio Rural (ID: 0)**: Polígonos de predios rurales
- **Predio Matriz (ID: 1)**: Predios matriz

**Campos clave**:
- `cod_predio`: Código del predio (clave de identificación)
- `area_ha`: Área en hectáreas
- `centroid_e`, `centroid_n`: Coordenadas del centroide
- `num_predio`: Número de predio
- `id_dist`: Código de distrito
- `shape`: Geometría del polígono

**Limitaciones**:
- ⚠️ MaxRecordCount: 1000 registros por consulta (requiere paginación)
- ⚠️ NO tiene capas de Comunidades Campesinas/Nativas
- ⚠️ Catastro_Pueblos_Formalizados no está documentado públicamente

**Viabilidad**: LIMITADA - Requiere paginación compleja y no cubre comunidades

---

### 2.2 SERFOR OCAPAS_MIDAGRI API ⭐

**Endpoint**: `https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer`

**Capas disponibles** (27 capas principales):

**Predios Rurales por Departamento** (IDs 1-25):
- ID 13: La Libertad
- ID 22: San Martín
- ... (todos los departamentos)

**Comunidades**:
- ID 26: Comunidades Campesinas
- ID 27: Comunidades Nativas

**Configuración del servicio**:
- **MaxRecordCount**: 1,000,000 (¡1000x más que Georural!)
- **Soporta Paginación**: true
- **Formatos**: JSON, AMF, geoJSON
- **Spatial Reference**: 4326 (WGS84)

**Campos clave (ejemplo capa San Martín, predios por departamento)**:
- `OBJECTID`: Clave primaria
- `NOMPRE`: Nombre del predio (campo de visualización)
- `AREA`: Área
- `UBIDIS`: Ubicación distrital
- `COORX`, `COORY`: Coordenadas
- `PERIME`: Perímetro
- `TITULO`: Título
- `ZUTM`: Zona UTM
- `Shape`: Geometría

> ⚠️ **Actualización 2026-10-06 (post-implementación)**: estos campos corresponden a las
> capas de predios por departamento (IDs 1-25), confirmadas solo por nombre de campo en
> esta investigación inicial. Al consultar en vivo las capas de **comunidades** (26 y 27) —
> que son las que se implementaron en Fase 1 — el schema real es distinto. Ver
> `docs/data-contracts/serfor-ocapas-comunidades.md` (o la sección 7 del plan de
> implementación) para los campos reales: `nomcom`, `depar`, `provi`, `distr`, `ubidis`
> (código UBIGEO), `Aarea` (hectáreas), `centroide_e/n`, `titcom` (solo capa 27). No hay
> `ZUTM`, `COORX/COORY`, `PERIME`, `TITULO` ni `NOMPRE` en las capas de comunidades.

**Ventajas**:
- ✅ MaxRecordCount muy alto (sin límite práctico)
- ✅ Tiene capas específicas de Comunidades Campesinas (26) y Nativas (27)
- ✅ Capas por departamento para análisis regional
- ✅ Bien documentado
- ✅ Mismo dominio que SERFOR forestal (confianza en la fuente)

**Desventajas**:
- ⚠️ No es la fuente "oficial" de MIDAGRI (es una réplica en SERFOR)
- ⚠️ Campos diferentes a Georural

**Viabilidad**: RECOMENDADA - Sin paginación necesaria, cubre todas las necesidades

---

### 2.3 AgroDigital App

**Funcionalidades**:
- Geolocalización de parcelas
- Monitoreo satelital de cultivos
- Consulta de precios (Agrochatea)
- Generación de reportes EUDR geolocalizados

**Logros**:
- ✅ 181,731 parcelas geolocalizadas (superando meta de 140k)
- Regiones: San Martín, Junín, Cajamarca, Amazonas, Cusco, Ayacucho, Huánuco, Ucayali, Piura, Puno, Pasco, Loreto, Madre de Dios
- Cultivos: café, cacao, palma aceitera

**Estado de la API**:
- ❌ NO hay documentación técnica pública
- ❌ NO se encontró APK en mirrors públicos
- ❌ NO hay API Swagger/OpenAPI documentada
- ❌ NO hay endpoints de consulta pública

**Barreras de acceso**:
- La app es privada del gobierno sin API documentada
- Para descubrir endpoints se requiere:
  1. Descargar el APK (no disponible en mirrors)
  2. Reverse engineering con herramientas como JADX, mitmproxy
  3. Posible certificate pinning
  4. Riesgo legal/ético

**Vías de acceso posibles**:
1. **Contacto directo con MIDAGRI** (recomendado)
   - Mesa de ayuda PPA: `sisppa@midagri.gob.pe`
   - Teléfonos: 995 010 525 / 990 533 188 / 969 086 366
   - Solicitar acceso a API o dataset de parcelas georreferenciadas

2. **Reverse engineering** (complejo)
   - Requiere APK no disponible públicamente
   - Riesgo legal/ético

3. **Uso de Catastro Rural** (limitado)
   - Sin vínculo con PPA
   - Sin datos de productores

**Viabilidad**: NO VIABLE sin contacto oficial - Requiere reverse engineering o aprobación MIDAGRI

---

## 3. Comparación Georural vs SERFOR OCAPAS_MIDAGRI

| Aspecto | Georural Catastro_Rural | SERFOR OCAPAS_MIDAGRI |
|---------|------------------------|----------------------|
| MaxRecordCount | 1,000 | 1,000,000 |
| Paginación requerida | Sí (obligatoria) | No (prácticamente) |
| Comunidades Campesinas | ❌ No tiene | ✅ Capa 26 |
| Comunidades Nativas | ❌ No tiene | ✅ Capa 27 |
| Predios por departamento | ❌ No | ✅ Capas 1-25 |
| Fuente oficial | ✅ MIDAGRI | ⚠️ Réplica SERFOR |
| Documentación | Limitada | Bien documentada |
| Viabilidad técnica | Limitada | Recomendada |

**Conclusión**: Son fuentes **COMPLEMENTARIAS**, no duplicadas:
- Georural: Catastro oficial de predios rurales (solo 2 capas)
- SERFOR OCAPAS: Predios por departamento + Comunidades (más completo)

---

## 4. Patrón de Implementación

### 4.1 Patrón existente en el proyecto

**SERFOR Connector** (`apps/catastro-forestal/api/src/ingest/serfor-connector.ts`):
- Usa fetch con timeout (30s)
- Verifica `exceededTransferLimit` y aborta si true
- No implementa paginación (asume datasets pequeños)
- Usa advisory locks para serializar ingestas
- Snapshot completo por capa (DELETE + INSERT)
- Guarda batch metadata en tabla `raw_*_batches`
- Normaliza campos comunes y guarda extras en JSONB

**Geometrías** (`apps/geo-intersections/api/src/ingest/replicate-geometries.ts`):
- Maneja geometría `geometry.rings` (ArcGIS format)
- Convierte a GeoJSON Polygon
- Cierra anillos si no están cerrados
- Usa `ST_GeomFromGeoJSON()` para insertar en PostGIS
- Calcula áreas con `ST_Area(ST_MakeValid(geometry))`
- Paginación por OBJECTID para INGEMMET
- Paginación estándar para SERFOR

### 4.2 Adaptación para SERFOR OCAPAS_MIDAGRI

```typescript
const SERFOR_OCAPAS_BASE = "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer";

const LAYERS = {
  comunidades_campesinas: { layerId: 26 },
  comunidades_nativas: { layerId: 27 },
  // Opcional: capas por departamento
  predios_la_libertad: { layerId: 13 },
  predios_san_martin: { layerId: 22 },
  // ... otros departamentos
};

// Sin paginación necesaria (MaxRecordCount=1M)
async function fetchLayerFeatures(layerId: number) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  // Una sola consulta trae todo
}
```

### 4.3 Adaptación para Georural (si se requiere fuente oficial)

```typescript
const GEORURAL_BASE = "https://georural.midagri.gob.pe/geoservicios/rest/services/public";

const LAYERS = {
  predio_rural: { service: "Catastro_Rural", layerId: 0 },
  predio_matriz: { service: "Catastro_Rural", layerId: 1 },
};

// Con paginación obligatoria (MaxRecordCount=1000)
async function fetchLayerFeatures(service: string, layerId: number) {
  let offset = 0;
  const features = [];
  
  while (true) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: offset.toString(),
      resultRecordCount: "1000",
      f: "json",
    });
    
    const res = await fetch(`${GEORURAL_BASE}/${service}/MapServer/${layerId}/query?${params}`);
    const payload = await res.json();
    
    features.push(...payload.features);
    
    if (!payload.exceededTransferLimit) break;
    offset += 1000;
  }
  
  return features;
}
```

---

## 5. Plan de Implementación Recomendado

### Fase 1: SERFOR OCAPAS_MIDAGRI (Prioridad Alta)

**Objetivo**: Implementar conector para Comunidades Campesinas/Nativas

**Estrategia**:
1. Crear nueva app `catastro-rural` o extender `geo-intersections`
2. Implementar conector para capas 26 (Comunidades Campesinas) y 27 (Comunidades Nativas)
3. Usar patrón de `replicate-geometries.ts` para manejo de geometrías
4. Sin paginación necesaria (MaxRecordCount=1M)

**Schema propuesto**:
```sql
CREATE TABLE rural_communities (
  id BIGSERIAL PRIMARY KEY,
  capa TEXT NOT NULL, -- 'comunidades_campesinas' o 'comunidades_nativas'
  objectid INTEGER NOT NULL,
  nombre TEXT, -- NOMPRE
  departamento TEXT,
  provincia TEXT,
  distrito TEXT, -- UBIDIS
  area_ha NUMERIC,
  perimetro NUMERIC,
  titulo TEXT,
  zona_utm INTEGER,
  coordenada_x NUMERIC, -- COORX
  coordenada_y NUMERIC, -- COORY
  geometry GEOMETRY(Polygon, 4326),
  area_km2 NUMERIC GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1_000_000) STORED,
  atributos_extra JSONB,
  source_batch_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (capa, objectid)
);

CREATE TABLE raw_ocapas_batches (
  id BIGSERIAL PRIMARY KEY,
  source_url TEXT NOT NULL,
  capa TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rural_communities_rejected (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL,
  raw_row JSONB NOT NULL,
  reason TEXT NOT NULL
);
```

**Endpoints propuestos**:
- `GET /api/communities?capa=comunidades_campesinas&departamento=LA LIBERTAD`
- `GET /api/communities/:objectid`
- `GET /api/communities/intersect?geometry=<geojson>`

**Beneficios**:
- Datos de comunidades campesinas/nativas georreferenciadas
- Cruce con ejecución presupuestal por territorio
- Análisis de inversión en comunidades indígenas

---

### Fase 2: Georural Catastro Rural (Prioridad Media)

**Objetivo**: Implementar conector para Predio Rural y Predio Matriz

**Condición previa**: Investigar Catastro_Pueblos_Formalizados para IDs de capas

**Estrategia**:
1. Implementar paginación por resultOffset (MaxRecordCount=1000)
2. Crear tablas separadas para Predio Rural y Predio Matriz
3. Usar mismo patrón de geometrías

**Schema propuesto**:
```sql
CREATE TABLE rural_predios (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL, -- 'predio_rural' o 'predio_matriz'
  objectid INTEGER NOT NULL,
  cod_predio TEXT NOT NULL,
  num_predio TEXT,
  id_dist TEXT,
  area_ha NUMERIC,
  perimetro NUMERIC,
  centroid_e NUMERIC,
  centroid_n NUMERIC,
  hoja TEXT,
  origen TEXT,
  datum TEXT,
  geometry GEOMETRY(Polygon, 4326),
  area_km2 NUMERIC GENERATED ALWAYS AS (ST_Area(geometry::geography) / 1_000_000) STORED,
  atributos_extra JSONB,
  source_batch_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tipo, cod_predio)
);
```

**Beneficios**:
- Catastro oficial de predios rurales
- Análisis de uso de suelo rural
- Cruce con proyectos de inversión

---

### Fase 3: AgroDigital (Prioridad Baja - Requiere contacto)

**Objetivo**: Acceder a datos de parcelas geolocalizadas del PPA

**Estrategia**:
1. Contactar MIDAGRI (sisppa@midagri.gob.pe)
2. Solicitar acceso a API o dataset de parcelas georreferenciadas
3. Argumentar uso para investigación/transparencia (no comercial)

**Mensaje propuesto**:
```
Asunto: Solicitud de acceso a datos de parcelas geolocalizadas del PPA

Estimados del MIDAGRI,

Soy investigador del proyecto Rastro (plataforma de datos públicos de Perú) y estamos
interesados en integrar los datos de las 181,731 parcelas geolocalizadas que el MIDAGRI
ha logrado georreferenciar a través de AgroDigital.

Nuestro objetivo es cruzar estos datos con información de inversión pública y
desarrollo territorial para mejorar la transparencia y toma de decisiones en el sector
agrario. El uso sería estrictamente para investigación y transparencia, sin fines
comerciales.

¿Podrían indicarnos si existe alguna API pública o mecanismo para acceder a estos datos
de forma programática? Alternativamente, ¿hay algún dataset disponible para descarga?

Agradecemos de antemano su apoyo.

Atentamente,
[Nombre]
[Contacto]
```

**Si se aprueba el acceso**:
- Implementar conector para API de AgroDigital
- Integrar con PPA por RUC/DNI
- Crear endpoints de consulta de parcelas por productor

---

## 6. Otras Fuentes Identificadas

### SIEA - Herramientas Satelitales
- 11 visualizadores satelitales (alerta temprana, heladas, precipitación, etc.)
- Tecnología: Google Earth Engine + Sentinel-2
- Estado: Visualizadores web (sin API documentada)
- Viabilidad: Baja - Solo visuales, no datos programáticos

### AgroChatea
- Consulta de precios mayoristas vía chat (Telegram/web)
- Backend: Conectado a SISAP
- Cobertura: 27 ciudades del país
- Estado: Operativo (IA basada en Telegram)
- Viabilidad: Media - Posible scraping o API no documentada

### SISAP
- Volúmenes, precios y procedencias de productos agropecuarios
- Cobertura: Mercados mayoristas de Lima + 27 ciudades
- Periodicidad: Diaria, semanal, mensual, anual
- Estado: Portal web (sin API documentada)
- Viabilidad: Media - Posible scraping

---

## 7. Referencias

**APIs Públicas**:
- Catastro Rural: `https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer`
- SERFOR OCAPAS: `https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer`
- PPA Consulta: `https://gateway.midagri.gob.pe/sisppa/api/services/app/Consulta/GetNombreConsulta`

**Documentación**:
- PPA: `https://ppa.midagri.gob.pe/`
- SIEA: `https://siea.midagri.gob.pe/portal/`
- PNDA MIDAGRI: `https://www.datosabiertos.gob.pe/group/ministerio-de-desarrollo-agrario-y-riego-midagri`

**Contacto MIDAGRI**:
- Mesa de ayuda PPA: `sisppa@midagri.gob.pe`
- Teléfonos: 995 010 525 / 990 533 188 / 969 086 366

---

## 8. Conclusiones

1. **SERFOR OCAPAS_MIDAGRI es la fuente más viable** para implementación inmediata (MaxRecordCount=1M, capas de comunidades bien documentadas)

2. **Georural Catastro Rural es viable pero complejo** (requiere paginación, solo 2 capas, sin comunidades)

3. **AgroDigital no es viable sin contacto oficial** (sin API pública, requiere reverse engineering o aprobación MIDAGRI)

4. **Recomendación**: Implementar Fase 1 (SERFOR OCAPAS) primero, luego evaluar Fase 2 (Georural) según necesidades, y contactar MIDAGRI para Fase 3 (AgroDigital)

5. **Patrón de implementación**: Reutilizar patrones existentes de `catastro-forestal` y `geo-intersections` para consistencia del proyecto
