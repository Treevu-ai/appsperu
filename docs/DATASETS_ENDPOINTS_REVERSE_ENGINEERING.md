# Fuentes Secundarias y Endpoints Públicos - Índice de Exposición Portuaria Perú

## Resumen
Este documento documenta todas las fuentes secundarias y endpoints públicos identificados para construir el índice de exposición portuaria en Perú, incluyendo el reverse engineering realizado para acceder a los datos.

---

## 1. Calidad del Aire - SENAMHI

### Fuente Principal
**Plataforma Nacional de Datos Abiertos - SENAMHI**
- URL: https://www.datosabiertos.gob.pe/dataset/monitoreo-de-los-contaminantes-del-aire-en-lima-metropolitana-servicio-nacional-de
- Formato: CSV (descarga directa)
- Contenido: PM10, PM2.5, NO2 horarios validados
- Cobertura: 10 estaciones automáticas (REMCA) en Lima Metropolitana
- Periodo: Datos desde 2010
- Campos: Fecha, hora, PM10, PM2.5, NO2 + datos de estación (nombre, latitud, longitud, altitud, departamento, provincia, distrito, ubigeo)

### Archivo CSV
- Nombre: "DataSet Monitoreo de los contaminantes del aire en Lima Metropolitana - [Servicio Nacional de Meteorología e Hidrología del Perú - SENAMHI]csv"
- Tamaño: No especificado (probablemente varios MB)
- Acceso: Descarga directa desde plataforma datos abiertos
- Diccionario de datos: "Diccionario_Datos_Monitoreo de los contaminantes del aire en Lima Metropolitana - [Servicio Nacional de Meteorología e Hidrología del Perú - SENAMHI].xlsx"

### Estaciones SENAMHI (10 estaciones REMCA)
1. Puente Piedra (PPD) - Complejo Municipal "El gallo de oro"
2. Carabayllo (CRB) - Piscina Municipal
3. San Martín de Porres (SMP) - Parque Ecológico
4. San Juan Lurigancho (SJL) - Universidad César Vallejo
5. Ceres (CRS) - Plaza Cívica de Ceres, Ate
6. Pariachi (PAR) - Parque Barrantes Lingan, Ate
7. Santa Anita (STA) - Palacio Municipal
8. Villa María del Triunfo (VMT) - Parque Virgen de Lourdes
9. San Borja (SBJ) - Polideportivo Limatambo
10. Campo de Marte (CDM) - Parque Campo de Marte, Jesús María

### Notas
- Los datos requieren filtrar registros vacíos de PM10, PM2.5 y NO2
- Coordenadas disponibles en el diccionario de datos
- Validación horaria realizada por SENAMHI

---

## 2. Calidad del Aire - OEFA

### 2.1 API OEFA (Junar)

**Endpoint Base**
- URL: https://datosabiertos.oefa.gob.pe/developers/
- Documentación: https://junar.github.io/docs/en
- Formato: JSON (también XML, CSV, HTML)
- Autenticación: Requiere API key ( gratuita)

**Patrón de Request**
```
http://api.datosabiertos.oefa.gob.pe/api/v2/datastreams/{GUID}/data.json/?auth_key={API_KEY}
```

**Obtención de API Key**
1. Visitar: https://datosabiertos.oefa.gob.pe/developers/
2. Click en "Get your API key!"
3. La key se genera automáticamente (gratuita)
4. Usar la key en cada request

**Dataset de Calidad del Aire**
- Nombre: "Vigilancia y Seguimiento ambiental en la calidad del aire"
- GUID: Pendiente de obtener (requiere navegación en la plataforma)
- Campos: Nombre estación, fecha/hora, parámetros meteorológicos (presión, precipitación, temperatura, humedad, viento, radiación), material particulado, gases
- Cobertura: 34 estaciones a nivel nacional
- Tamaño: 1.23 GB (CSV)

**Reverse Engineering Steps**
1. Navegar a: https://www.datosabiertos.gob.pe/dataset/vigilancia-y-seguimiento-ambiental-en-la-calidad-del-aire-organismo-de-evaluaci%C3%B3n-y
2. Encontrar el GUID del dataset en la URL o metadatos
3. Usar el GUID en el endpoint API
4. Ejemplo de request (con GUID real):
   ```
   GET http://api.datosabiertos.oefa.gob.pe/api/v2/datastreams/{GUID}/data.json/?auth_key={YOUR_API_KEY}
   ```

### 2.2 ArcGIS REST API - OEFA PIFA

**Endpoint Base**
- URL: https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer
- Servicio: ArcGIS REST API
- Formato: JSON, GeoJSON, PBF
- Autenticación: No requerida (pública)

**Endpoint de Metadatos de Capa**
```
GET https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer/0?f=pjson
```

**Response Fields (Estaciones)**
- OBJECTID: ID único
- NOMB_ESTACION: Nombre de la estación
- DEPARTAMENTO, PROVINCIA, DISTRITO: Ubicación administrativa
- UBIGEO: Código geográfico
- ESTE, NORTE: Coordenadas UTM
- ALTITUD: Altitud en metros
- COD_ESTACION: Código de estación
- COD_EST: Código alternativo
- TIPO_EVAL: Tipo de evaluación (ej. "Seguimiento")
- SHAPE: Geometría (punto)

**Endpoint de Query (Obtener todas las estaciones)**
```
GET https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer/0/query?where=1%3D1&outFields=*&f=json
```

**Reverse Engineering - Query Parameters**
- `where=1=1`: Retorna todos los registros
- `outFields=*`: Retorna todos los campos
- `f=json`: Formato JSON (alternativas: geojson, pbf)
- `resultOffset`: Para paginación (default 0)
- `resultRecordCount`: Límite de registros (max 2000)

**Endpoint Filtrado por Geometría**
```
GET https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer/0/query?where=DEPARTAMENTO%3D%27Lima%27&outFields=*&f=json
```

**Capabilities**
- MaxRecordCount: 2000
- MaxSelectionCount: 2000
- Supported Query Formats: JSON, geoJSON, PBF
- Supports Statistics: true
- Supports Advanced Queries: true

**Datos de Calidad del Aire (Time Series)**
- **PENDIENTE**: Identificar endpoint con datos temporales de PM10, PM2.5
- Probablemente en otro servicio ArcGIS del PIFA
- Requiere exploración adicional de servicios PIFA

---

## 3. Actividad Portuaria - APN PIEP

### 3.1 Archivos Descargables (Estadísticas Históricas)

**Movimiento de Carga (TM)**
- URL: https://piep.apn.gob.pe/storage/2026/04/TOTAL-Movimiento-de-carga-mensualizada-en-TM-a-nivel-nacional-2010-al-2025.xlsx
- Formato: Excel (.xlsx)
- Periodo: 2010-2025
- Resolución: Mensual
- Cobertura: Nacional

**Movimiento de Contenedores (TEU)**
- URL: https://piep.apn.gob.pe/storage/2026/04/Movimiento-de-contenedores-mensualizado-a-nivel-nacional-2010-al-2025.xlsx
- Formato: Excel (.xlsx)
- Periodo: 2010-2025
- Resolución: Mensual
- Cobertura: Nacional

**Movimiento de Naves**
- URL: https://piep.apn.gob.pe/storage/2025/10/Movimiento-de-naves-a-nivel-nacional.zip
- Formato: ZIP (contiene múltiples archivos)
- Contenido: Registros de naves recepcionadas y despachadas
- Resolución: Probablemente mensual/anual

**Otros Archivos**
- Número de accidentes a nivel nacional 2014-2024: https://piep.apn.gob.pe/storage/2025/09/NUMERO-DE-ACCIDENTES-A-NIVEL-NACIONAL-2014-2024.xlsx
- Monitoreo de Calidad: https://piep.apn.gob.pe/storage/2024/01/Monitoreo-de-Calidad.zip
- Instalaciones Portuarias con Certificaciones: https://piep.apn.gob.pe/storage/2024/01/Instalaciones-Portuarias-con-Certificaciones-en-Sistema-de-Gestion-Ambiental-2017-2022.xlsx

### 3.2 Datos Online (Dashboard)

**Portal PIEP**
- URL: https://piep.apn.gob.pe/datos-online/
- Secciones:
  - Consulta de naves recepcionadas y despachadas
  - Consulta data movimiento de carga
  - Consulta data movimiento de contenedores

**Reverse Engineering - Datos Online**
- **PENDIENTE**: Los datos online requieren navegación interactiva
- Probablemente usan JavaScript/AJAX para cargar datos
- Se recomienda usar DevTools (Network tab) para identificar:
  - Endpoints AJAX
  - Parámetros de request
  - Formato de response (JSON probablemente)
- Posible patrón de endpoint:
  ```
  GET https://piep.apn.gob.pe/api/{endpoint}?parametros...
  ```

### 3.3 Acceso a Base de Datos (Redenaves)

**Información Oficial**
- Redenaves es el Sistema de Recepción y Despacho Electrónico de Naves
- Acceso restringido a:
  - Autoridades competentes
  - Agencias marítimas, fluviales o lacustres
- Solicitar acceso: vuceayuda@mincetur.gob.pe

**Limitación**
- No es API pública
- Requiere autorización específica
- No viable para el enfoque de fuentes secundarias públicas

---

## 4. Datos AIS (Tracking de Buques)

### 4.1 Facha API (Gratis, No Key)

**Endpoint Base**
- URL: https://api.facha.dev/v1
- Documentación: https://docs.api.facha.dev/
- Autenticación: No requerida
- Rate Limit: 20 requests/minuto (bucket ship)
- CORS: Habilitado

**Endpoint: Buques en Radio**
```
GET https://api.facha.dev/v1/ship/radius/{lat}/{lon}/{radius}
```

**Parámetros**
- `lat`: Latitud del centro (decimal)
- `lon`: Longitud del centro (decimal)
- `radius`: Radio en kilómetros (km)

**Ejemplo**
```
GET https://api.facha.dev/v1/ship/radius/-12.04/-77.12/50
```

**Response Fields**
```json
{
  "mmsi": "string",
  "imo": "string",
  "name": "string",
  "callsign": "string",
  "vesselType": "string",
  "vesselTypeSlug": "string",
  "type": "integer",
  "dimensionToBow": "integer",
  "dimensionToStern": "integer",
  "dimensionToPort": "integer",
  "dimensionToStarboard": "integer",
  "draught": "float",
  "destination": "string",
  "estimatedTimeOfArrival": "string"
}
```

**Endpoint: Buque por MMSI**
```
GET https://api.facha.dev/v1/ship/{mmsi}
```

**Endpoint: Buque por Nombre**
```
GET https://api.facha.dev/v1/ship/name/{name}
```

**Endpoint: Buque por Call Sign**
```
GET https://api.facha.dev/v1/ship/callsign/{callsign}
```

**Endpoint: Buques por Destino**
```
GET https://api.facha.dev/v1/ship/destination/{destination}
```

**Reverse Engineering - Pruebas Realizadas**
1. Prueba inicial: `https://api.facha.dev/v1/ship/radius/-12.05/-77.1/20`
   - Resultado: `[]` (array vacío)
   - Interpretación: No hay buques reportados en esa área en ese momento
2. Prueba con radio mayor: `https://api.facha.dev/v1/ship/radius/-12.04/-77.12/50`
   - Resultado: HTTP 400 Bad Request
   - Interpretación: Posible error en formato de parámetros

**Hipótesis del Error 400**
- El radio puede tener un límite máximo
- Las coordenadas pueden estar fuera de rango válido
- Puede requerir parámetros adicionales

**Next Steps para Debug**
- Probar con coordenadas de puerto conocido (ej. -12.0464, -77.1258 para Callao)
- Probar radios más pequeños (5km, 10km, 20km)
- Revisar headers de respuesta para más detalles

### 4.2 Open Waters AIS (Gratis con Token)

**Endpoint Base**
- URL: https://ais.openwaters.io
- Documentación: https://github.com/openwatersio/aiscast
- Autenticación: Token opcional (límites más altos con token)
- Protocolo: WebSocket para streaming, HTTP para snapshot

**Endpoint: Buques en Bounding Box (HTTP)**
```
GET https://ais.openwaters.io/v1/vessels?bbox={minLat},{minLon},{maxLat},{maxLon}
```

**Parámetros**
- `bbox`: Bounding box en formato `minLat,minLon,maxLat,maxLon`
- Sin token: límites anónimos
- Con token: límites más altos

**Ejemplo**
```
GET https://ais.openwaters.io/v1/vessels?bbox=-12.5,-77.5,-11.5,-76.5
```

**Response (GeoJSON)**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [lon, lat]
      },
      "properties": {
        "mmsi": "string",
        "name": "string",
        "type": "string",
        "course": "float",
        "speed": "float",
        "heading": "float",
        "lastSeen": "timestamp",
        "source": "string"
      }
    }
  ],
  "attribution": {}
}
```

**Reverse Engineering - Pruebas Realizadas**
1. Prueba: `https://ais.openwaters.io/v1/vessels?bbox=-12.5,-77.5,-11.5,-76.5`
   - Resultado: `{"attribution":{},"features":[],"type":"FeatureCollection"}`
   - Interpretación: No hay buques en esa área en ese momento
   - Posible causa: Bounding box incorrecto o no hay receptores AIS en esa área

**Endpoint: Estaciones (Receptores AIS)**
```
GET https://ais.openwaters.io/v1/stations
```

**Response**
```json
{
  "stations": [
    {
      "id": "string",
      "location": {
        "lat": float,
        "lon": float
      },
      "messageCount": integer,
      "lastSeen": "timestamp"
    }
  ]
}
```

**WebSocket Streaming**
```
wss://ais.openwaters.io/v0/stream
```

**Message Format (Subscribe)**
```json
{
  "type": "subscribe",
  "bbox": [[minLat, minLon, maxLat, maxLon]]
}
```

**Generación de Token**
```
POST https://ais.openwaters.io/v1/keys
Content-Type: application/json

{
  "pubkey": "Ed25519_public_key"
}
```

**Limites**
- Sin token: límites anónimos
- Con token personal: 30 días, 2 conexiones concurrentes
- Token generado con keypair Ed25519

### 4.3 FreeOpenAPI.dev (Gratis con Key)

**Endpoint Base**
- URL: https://freeopenapi.dev/api/v1/shipping
- Documentación: https://freeopenapi.dev/apis/shipping
- Autenticación: API key (gratuita con email)
- Rate Limit: 100 requests/día (free tier)

**Endpoint: Buques en Vivo**
```
GET https://freeopenapi.dev/api/v1/shipping/vessels/live
```

**Headers**
```
X-Api-Key: YOUR_API_KEY
```

**o Query Parameter**
```
?apiKey=YOUR_API_KEY
```

**Response Fields**
- MMSI, IMO, nombre
- Posición (lat, lon)
- Velocidad, rumbo, heading
- Estado de navegación

**Reverse Engineering - Pruebas Realizadas**
1. Prueba sin key: `https://freeopenapi.dev/api/v1/shipping/vessels/live`
   - Resultado: HTTP 401 Unauthorized
   - Interpretación: Requiere API key obligatoriamente

**Obtención de API Key**
1. Visitar: https://freeopenapi.dev/apis/shipping
2. Click en "Request a key"
3. Ingresar email
4. Confirmar email
5. Key activa inmediatamente

**Otros Endpoints**
- `/api/v1/shipping/rigs?active=true`: Plataformas offshore
- `/api/v1/shipping/warnings?navArea=`: Avisos de navegación
- `/api/v1/shipping/warnings/areas`: Lista de áreas NAVAREA
- `/api/v1/shipping/ocean-conditions?lat=&lon=`: Condiciones oceánicas (NOAA)

### 4.4 MarineTraffic Scraping (No Oficial)

**Apify Actor**
- URL: https://apify.com/romy/marine-traffic-scraper/api/cli
- Método: Scraping de endpoints públicos de MarineTraffic
- Entradas: latitud, longitud, zoom level
- Salida: Datos AIS de buques
- Limitación: No es API oficial, cumple ToS del usuario

**GitHub - position-api**
- URL: https://github.com/aardvark82/20260601-vessel-position-api
- URL: https://github.com/transparency-everywhere/position-api
- Método: Scraping de MarineTraffic, MyShipTracking, ADS-B Exchange
- Endpoints:
  - `GET /ais/mt/:mmsi/location/latest`: Posición por MMSI (MarineTraffic)
  - `GET /ais/mst/:mmsi/location/latest`: Posición por MMSI (MyShipTracking)
- Autenticación: No requerida
- Tecnología: Node.js/TypeScript + Puppeteer

**Limitación**
- Requiere despliegue propio
- No es API oficial
- Puede ser bloqueado por cambios en sitios objetivo

---

## 5. Otras Fuentes Secundarias

### 5.1 Datos Satelitales (Alternativa)

**Sentinel-1 SAR**
- Fuente: Copernicus Open Access Hub
- Acceso: https://scihub.copernicus.eu/
- Registro: Gratuito
- Uso: Detección de buques independientemente de clima/luz

**Sentinel-2**
- Fuente: Copernicus Open Access Hub
- Acceso: https://scihub.copernicus.eu/
- Registro: Gratuito
- Uso: Imágenes ópticas, detección de contenedores

**VIIRS Nighttime Lights**
- Fuente: NOAA
- Acceso: https://www.ncei.noaa.gov/products/viirs-dnb-annual-composites
- Uso: Proxy de actividad portuaria (luces nocturnas)
- Correlación reportada: Rs = 0.84 con throughput de contenedores

**Sentinel-5P TROPOMI**
- Fuente: Copernicus Open Access Hub
- Uso: Columnas de NO2
- Limitación: Dificultad en latitudes altas (ej. Báltico)

### 5.2 Datos Meteorológicos

**SENAMHI**
- Portal: https://www.senamhi.gob.pe/
- API: No documentada públicamente
- Datos: Temperatura, humedad, viento, precipitación
- Acceso: Requiere solicitud de servicio

**NOAA (Alternativa Global)**
- API: https://www.ncdc.noaa.gov/cdo-web/webservices/
- Registro: Gratuito
- Rate Limit: Limitado
- Cobertura: Global

---

## 6. Estrategia de Implementación

### Fase 1: Calidad del Aire (Disponible Inmediato)

**Opción A: SENAMHI CSV**
1. Descargar CSV desde plataforma datos abiertos
2. Procesar con pandas/Python
3. Filtrar registros vacíos
4. Extraer coordenadas del diccionario de datos

**Opción B: OEFA API**
1. Obtener API key (gratuita)
2. Identificar GUID del dataset de calidad del aire
3. Hacer request al endpoint API
4. Procesar JSON response

**Opción C: OEFA ArcGIS**
1. Usar endpoint de query para obtener metadatos de estaciones
2. Identificar endpoint con datos temporales (PENDIENTE)
3. Extraer datos horarios de PM10, PM2.5

### Fase 2: Actividad Portuaria (Densidad de Buques)

**Opción A: Facha API (Prioridad)**
1. Debug error 400 con diferentes parámetros
2. Probar coordenadas exactas del puerto de Callao
3. Implementar polling horario para obtener densidad de buques
4. Calcular densidad por cuadrícula espacial

**Opción B: Open Waters AIS**
1. Generar token Ed25519
2. Usar endpoint HTTP para snapshot
3. O usar WebSocket para streaming en tiempo real
4. Filtrar por bounding box del puerto

**Opción C: FreeOpenAPI.dev**
1. Obtener API key con email
2. Usar endpoint vessels/live
3. Limitar a 100 requests/día (suficiente para polling horario)

### Fase 3: Coordenadas de Estaciones

**OEFA ArcGIS**
1. Ya validado: endpoint query retorna todas las estaciones
2. Extraer coordenadas (ESTE, NORTE) y convertirlas a lat/lon si es UTM
3. Filtrar estaciones cercanas a puertos

**SENAMHI**
1. Extraer del diccionario de datos Excel
2. Formato probable: latitud, longitud en grados decimales

### Fase 4: Integración y Cálculo

**Pipeline Propuesto**
```
1. Calcular densidad de buques por hora (AIS API)
   - Dividir área en cuadrículas (ej. 1km x 1km)
   - Contar buques por cuadrícula por hora

2. Calcular ponderación de distancia inversa
   - Para cada estación de calidad del aire
   - Calcular distancia a cada cuadrícula
   - Aplicar peso = 1/distance

3. Calcular índice de exposición horario
   - Exposure_hora = Σ (densidad_buques × peso_distancia)

4. Correlacionar con calidad del aire
   - PM10/PM2.5 horarios de SENAMHI/OEFA
   - Regresión con efectos fijos
   - Control por variables meteorológicas
```

---

## 7. Script de Prueba (Python)

### Ejemplo: Facha API

```python
import requests
import time

# Coordenadas puerto de Callao
CALLAO_LAT = -12.0464
CALLAO_LON = -77.1258

def get_vessels_in_radius(lat, lon, radius_km):
    """Obtener buques en radio usando Facha API"""
    url = f"https://api.facha.dev/v1/ship/radius/{lat}/{lon}/{radius_km}"
    try:
        response = requests.get(url)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        return None

# Prueba con diferentes radios
for radius in [5, 10, 20, 50]:
    print(f"Probando radio {radius}km...")
    vessels = get_vessels_in_radius(CALLAO_LAT, CALLAO_LON, radius)
    print(f"Buques encontrados: {len(vessels) if vessels else 0}")
    time.sleep(3)  # Respetar rate limit
```

### Ejemplo: OEFA ArcGIS

```python
import requests

def get_oefa_stations():
    """Obtener todas las estaciones de calidad del aire OEFA"""
    url = "https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer/0/query"
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "json"
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    
    stations = []
    for feature in data["features"]:
        attrs = feature["attributes"]
        geom = feature["geometry"]
        stations.append({
            "name": attrs["NOMB_ESTACION"],
            "department": attrs["DEPARTAMENTO"],
            "province": attrs["PROVINCIA"],
            "district": attrs["DISTRITO"],
            "lat": geom["y"],
            "lon": geom["x"],
            "altitude": attrs["ALTITUD"],
            "code": attrs["COD_EST"]
        })
    
    return stations

# Obtener estaciones
stations = get_oefa_stations()
print(f"Total estaciones: {len(stations)}")

# Filtrar estaciones en Lima
lima_stations = [s for s in stations if s["department"] == "Lima"]
print(f"Estaciones en Lima: {len(lima_stations)}")
```

---

## 8. Próximos Pasos

### Inmediato (Esta semana)
1. [ ] Descargar CSV SENAMHI de calidad del aire
2. [ ] Debug Facha API con diferentes parámetros
3. [ ] Probar Open Waters AIS con bounding box correcto
4. [ ] Generar token Open Waters para streaming

### Corto Plazo (1-2 semanas)
1. [ ] Implementar script de polling AIS horario
2. [ ] Procesar datos de calidad del aire
3. [ ] Identificar endpoint OEFA con datos temporales
4. [ ] Mapear estaciones cercanas a puertos

### Medio Plazo (3-4 semanas)
1. [ ] Implementar cálculo de densidad de buques por cuadrícula
2. [ ] Implementar ponderación de distancia inversa
3. [ ] Calcular índice de exposición horario
4. [ ] Correlacionar con PM10/PM2.5

### Largo Plazo (Opcional)
1. [ ] Evaluar datos satelitales para otros puertos
2. [ ] Implementar inventario de emisiones (bottom-up)
3. [ ] Documentar metodología completa
4. [ ] Publicar resultados

---

## 9. Referencias de Endpoints

### APIs Probadas
- ✅ Facha API: https://api.facha.dev/v1 (parcialmente - error 400)
- ✅ Open Waters AIS: https://ais.openwaters.io/v1 (funciona, pero sin buques en área)
- ❌ FreeOpenAPI.dev: https://freeopenapi.dev/api/v1/shipping (requiere key)
- ✅ OEFA ArcGIS: https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer (funciona)
- ⏳ OEFA Junar API: https://datosabiertos.oefa.gob.pe/developers/ (pendiente obtener GUID)

### Archivos Descargables
- ✅ SENAMHI CSV: Disponible en plataforma datos abiertos
- ✅ PIEP Excel: Movimiento de carga, contenedores, naves
- ✅ OEFA CSV: Vigilancia calidad del aire (1.23 GB)

### Documentación
- Facha API: https://docs.api.facha.dev/
- Open Waters: https://github.com/openwatersio/aiscast
- FreeOpenAPI: https://freeopenapi.dev/apis/shipping
- OEFA ArcGIS: https://pifa.oefa.gob.pe/server_gis/rest/services/Metadatos/Estaciones_Calidad_Aire/MapServer
- Junar: https://junar.github.io/docs/en

---

**Documento actualizado**: 2026-10-04
**Estado**: Endpoints identificados, reverse engineering parcial completado
**Prioridad**: Debug Facha API + obtener datos SENAMHI CSV
