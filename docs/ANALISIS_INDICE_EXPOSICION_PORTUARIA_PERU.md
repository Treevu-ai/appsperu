# Análisis: Índice de Exposición Portuaria Ambiental - Adaptación para Perú

## Resumen Ejecutivo

Este documento analiza la viabilidad de replicar el índice de exposición portuaria ambiental en Perú, identificando datos disponibles, metodologías alternativas y propuestas de adaptación dadas las limitaciones de información.

---

## 1. Metodología Original (Estudio de Busan, Corea del Sur)

### Referencia
- **Fuente**: "Vessel Activity and Coastal Air Quality: Evidence from Busan, South Korea" (Journal of Fisheries Business Administration)
- **Enfoque**: Relación entre actividad de buques y calidad del aire en ciudades costeras

### Metodología Principal
```
Port-exposure index = Σ (tonelaje de buques × peso de distancia inversa)
```

**Componentes clave:**
1. Datos horarios de actividad de buques (tonelaje por muelle)
2. Ponderación por distancia inversa (inverse-distance weights)
3. Datos horarios de calidad del aire (PM10, PM2.5)
4. Modelo de regresión con efectos fijos
5. Control por variables meteorológicas

**Resultados reportados:**
- Aumento de 1,000 unidades en índice de exposición → +0.18% PM10, +0.33% PM2.5
- Coeficiente de correlación promedio ~0.33

---

## 2. Datos Disponibles en Perú

### 2.1 Calidad del Aire ✅ DISPONIBLE

#### SENAMHI (Lima Metropolitana)
- **Datos**: PM10, PM2.5, NO2 horarios validados
- **Cobertura**: 10 estaciones automáticas (REMCA)
- **Ubicación**: 9 distritos del Área Metropolitana de Lima y Callao
- **Frecuencia**: Horaria
- **Acceso**: [Plataforma de Datos Abiertos](https://www.datosabiertos.gob.pe/dataset/monitoreo-de-los-contaminantes-del-aire-en-lima-metropolitana-servicio-nacional-de)
- **Coordenadas**: Disponibles para cada estación

#### OEFA (Nacional)
- **Datos**: 34 estaciones de monitoreo en tiempo real
- **Parámetros**: PM10, PM2.5, gases (NO2, SO2, CO, O3)
- **Datos meteorológicos**: Presión, precipitación, temperatura, humedad, viento
- **Acceso**: [Datos Abiertos OEFA](https://www.datosabiertos.gob.pe/dataset/vigilancia-y-seguimiento-ambiental-en-la-calidad-del-aire-organismo-de-evaluaci%C3%B3n-y)

**Limitación**: Cobertura concentrada en Lima/Callao; otros puertos importantes (Paita, Salaverry, Chimbote, Ilo) pueden no tener estaciones cercanas.

### 2.2 Actividad Portuaria ⚠️ PARCIALMENTE DISPONIBLE

#### APN - Sistema Redenaves
- **Función**: Sistema de Recepción y Despacho Electrónico de Naves
- **Datos disponibles**:
  - Movimiento de naves recepcionadas y despachadas
  - Movimiento de carga (toneladas métricas)
  - Movimiento de contenedores (TEUs)
  - Servicios portuarios básicos
- **Acceso público**: [PIEP - Plataforma de Información de Estadísticas Portuarias](https://piep.apn.gob.pe/datos-portuarios/)
- **Frecuencia**: Mensual/anual (no horaria confirmada)
- **Acceso detallado**: Requiere autorización (solo agencias marítimas y autoridades)
  - Contacto: vuceayuda@mincetur.gob.pe o estadisticas@apn.gob.pe

#### Datos en tiempo real (Limited)
- **Puertos del Perú**: Mapa de estado de puertos, programación de arribo/zarpe
- **Programación de naves**: Datos de ETA, ATA, ETD para terminal de Callao (DP World)
- **Limitación**: Datos futuros programados, no histórico horario de actividad real

### 2.3 Datos AIS (Alternativa Prometedora) ✅ DISPONIBLE

#### AIS-Catcher (San Miguel-Lima)
- **Estación**: San Miguel-Lima-Peru (ID: 1441)
- **Coordenadas**: -12.05°N, -77.10°E
- **Cobertura**: 13.7 NMi máx. (13.7 millas náuticas)
- **Datos**: 7,246 mensajes/hora, 103 buques únicos/hora
- **Acceso**: [AIS-catcher.org](https://www.aiscatcher.org/station/1441) - gratuito, sin filtro
- **Información**: Posición, velocidad, rumbo, destino, track de buques

#### Global Fishing Watch (Perú)
- **Datos**: ~1,300 buques pesqueros peruanos
- **Tipo**: Datos AIS + VMS (Sistema de Monitoreo de Buques)
- **Acceso**: Plataforma GFW gratuita
- **Limitación**: Solo buques pesqueros, no mercantes

#### Plataformas comerciales gratuitas
- **ShipsTrack**: Rastreo AIS gratuito (>200,000 buques)
- **Radar-Tracker**: Mapa AIS en vivo
- **Limitación**: Datos en vivo/semi-retardo, no histórico extensivo sin suscripción

---

## 3. Metodologías Alternativas Identificadas

### 3.1 Enfoque AIS-Based (Corea - Daesan Port)

**Referencia**: "Coastal Air Quality Assessment through AIS-Based Vessel Emissions: A Daesan Port Case Study" (MDPI)

**Metodología:**
1. Uso de datos AIS para estimar consumo de combustible
2. Categorización de estados de navegación desde AIS
3. Random Forest para predecir consumo de combustible de buques sin datos de motor
4. Cálculo de emisiones (CO2, NO2, SO2, PM10, PM2.5) usando factores de emisión
5. Correlación con mediciones reales de calidad del aire

**Resultados**: Coeficiente de correlación promedio ~0.33 (similar al estudio de Busan)

**Ventajas para Perú**:
- Datos AIS disponibles en Lima/Callao
- No requiere acceso a datos administrativos de Redenaves
- Resolución temporal alta (AIS transmite continuamente)

### 3.2 Enfoque Bottom-Up (Latinoamérica - México/Brasil)

**Referencias**:
- "Evaluation of Bottom-UP Methodologies in Estimating Atmospheric Emissions from Ships: A Case Study of the Itaguaí-RJ Port Complex" (Brasil)
- "Atmospheric Emissions in Ports Due to Maritime Traffic in Mexico" (México)
- "Air Quality and Atmospheric Emissions from the Operation of the Main Mexican Port in the Gulf of Mexico" (Veracruz)

**Metodologías comparadas**:
- **EEA (European Environment Agency, 2019)**
- **USEPA (United States Environmental Protection Agency, 2009)**
- **AP-42**: Compilation of Air Pollutant Emission Factors

**Componentes requeridos (Bottom-Up)**:
- Características técnicas de buques (tipo, GT, potencia motor)
- Tiempo en fases operativas (maneuvering, hoteling)
- Potencia y factor de carga de motores principal y auxiliar
- Consumo específico de combustible (SFC)
- Factores de emisión por motor y fase operativa

**Resultados comparativos (Itaguaí, Brasil)**:
- EEA produjo emisiones hasta 45x mayores para NOx y 174x para PM10 vs USEPA
- Container ships identificados como mayores contaminantes (EEA) vs Bulk carriers (USEPA)

**Documentación oficial**:
- [EMEP/EEA Air Pollutant Emission Inventory Guidebook 2023](https://www.eea.europa.eu/en/analysis/publications/emep-eea-guidebook-2023)
- [EPA Port Emissions Inventory Guidance](https://www.epa.gov/sites/production/files/2016-06/documents/2009-port-inventory-guidance.pdf)

### 3.3 Enfoque Satelital (Global)

**Referencias**:
- "Geospatial Machine Learning for Maritime Environmental Exposure Analysis in Baltic Port Regions" (Maritime Exposure Index - MEI)
- "Watching Trade from Space: Nowcasting and Spatial Extrapolation of Port-Level Maritime Trade Using Satellite Imagery"
- "Development of Port Utilization Index by Using Satellite Images"
- "A Global Assessment of Night Lights as an Indicator for Shipping Activity in Anchorage Areas"

**Índices propuestos**:
- **MEI (Maritime Exposure Index)**: Densidad de buques normalizada + distancia inversa al puerto + alineación del viento
- **ACEI (Atmospheric Coastal Exposure Index)**: Concentración NO2 + ponderación proximidad costera + clasificación viento hacia tierra
- **PUI (Port Utilization Index)**: Tasa de utilización de atraques + fondeo + patio de contenedores (imágenes satelitales)
- **PSI (Port Saturation Index)**: Imágenes satelitales en tiempo real + deep learning

**Fuentes de datos satelitales**:
- **Sentinel-1 SAR**: Detección de buques independientemente de clima/luz
- **Sentinel-2**: Imágenes ópticas
- **VIIRS Nighttime Lights**: Luces nocturnas como proxy de actividad portuaria
- **Sentinel-5P TROPOMI**: Columnas de NO2 (limitado en latitudes altas como Báltico)

**Correlaciones reportadas (NTL)**:
- NTL vs throughput de contenedores: Rs = 0.84 (p < 0.01)
- NTL vs carga máxima: Rs = 0.66 (p < 0.01)
- NTL vs puntos de fondeo: Rs = 0.69 (p < 0.01)

**Ventajas para Perú**:
- Datos satelitales públicos y gratuitos
- Cobertura global (no limitada a zonas con receptores AIS)
- Independiente de transmisiones AIS (pueden ser desactivadas)

### 3.4 Enfoque Multi-altura (Brasil - Paranaguá)

**Referencia**: "Surface monitoring underestimates air-pollution burden of a major Global South port" (Nature Communications Sustainability)

**Metodología**:
- Mediciones altura-resueltas en Puerto de Paranaguá
- Combinación con análisis meteorológico
- Enfoque case-crossover estratificado espacio-tiempo

**Hallazgos clave**:
- Diferencias verticales significativas en concentraciones de contaminantes
- SO2 consistentemente elevado a alturas correspondientes a chimeneas de buques
- Riesgo de contaminación aumenta hasta 74% durante operaciones portuarias

**Relevancia para Perú**:
- Alerta sobre subestimación usando solo monitoreo superficial
- Especialmente relevante para puertos del Global South

---

## 4. Adaptaciones Propuestas para Perú

### 4.1 Enfoque Híbrido Recomendado

Dadas las limitaciones de datos, propongo un enfoque híbrido que combine:

#### Fase 1: Índice de Exposición Portuaria Simplificado (Lima/Callao)

**Datos requeridos**:
- Datos AIS de estación San Miguel-Lima (disponible)
- Datos de calidad del aire SENAMHI (disponible)
- Coordenadas de estaciones de monitoreo y áreas portuarias

**Metodología adaptada**:
```
Port-Exposure Index_hora = Σ (Densidad de buques AIS_hora × Peso_distancia_inversa)
```

**Cálculo**:
1. Extraer datos AIS horarios de buques en radio del puerto (ej. 10 NM)
2. Calcular densidad de buques por cuadrícula espacial (ej. 1km x 1km)
3. Aplicar ponderación de distancia inversa entre cuadrículas y estaciones de monitoreo
4. Generar índice horario de exposición para cada estación
5. Correlacionar con PM10/PM2.5 horarios usando regresión con efectos fijos
6. Controlar por variables meteorológicas (viento, humedad, temperatura)

**Ventajas**:
- Usa datos disponibles públicamente
- Resolución temporal alta (horaria)
- No requiere acceso autorizado a Redenaves
- Comparable metodológicamente al estudio original (Busan)

**Limitaciones**:
- Sin tonelaje específico (solo densidad de buques)
- Cobertura limitada a Lima/Callao
- Requiere procesamiento de datos AIS

#### Fase 2: Expansión a otros puertos (Scoping)

Para puertos sin estaciones de calidad del aire cercanas:

**Opción A: Uso de datos satelitales**
- Imágenes Sentinel-1/2 para detectar actividad portuaria
- VIIRS Nighttime Lights como proxy de actividad
- Combos con datos AIS si disponibles

**Opción B: Monitoreo puntual**
- Instalación temporal de estaciones de monitoreo
- Campañas de medición durante periodos de alta actividad

#### Fase 3: Inventario de Emisiones (Bottom-Up)

Si se obtiene acceso a datos detallados de buques:

**Aplicar metodología EEA/USEPA**:
1. Recopilar datos de buques (tipo, GT, potencia motores)
2. Estimar tiempo en fases operativas (hoteling, maneuvering)
3. Aplicar factores de emisión EEA (más conservador)
4. Generar inventario de emisiones por contaminante
5. Validar con mediciones de calidad del aire

---

## 5. Plan de Implementación

### Paso 1: Recolección de Datos (1-2 semanas)
- [ ] Descargar datos históricos de calidad del aire SENAMHI (PM10, PM2.5, NO2)
- [ ] Descargar datos históricos de OEFA (34 estaciones)
- [ ] Coordinar acceso a datos AIS históricos (AIS-catcher o comercial)
- [ ] Obtener coordenadas precisas de estaciones de monitoreo
- [ ] Mapear áreas portuarias de Lima/Callao (muelles, fondeaderos)

### Paso 2: Procesamiento de Datos (2-3 semanas)
- [ ] Limpiar y validar datos de calidad del aire (filtrar registros vacíos)
- [ ] Procesar datos AIS (filtrar por área geográfica, tiempo)
- [ ] Calcular densidad de buques por cuadrícula espacial
- [ ] Aplicar ponderación de distancia inversa
- [ ] Integrar datos meteorológicos

### Paso 3: Análisis Estadístico (2-3 semanas)
- [ ] Calcular índice de exposición horario
- [ ] Correlacionar con PM10/PM2.5 (regresión con efectos fijos)
- [ ] Controlar por variables meteorológicas
- [ ] Analizar estacionalidad
- [ ] Validar resultados

### Paso 4: Escalamiento (Opcional, 4-6 semanas)
- [ ] Evaluar viabilidad para otros puertos (Paita, Salaverry, Chimbote, Ilo)
- [ ] Probar enfoque satelital para puertos sin estaciones
- [ ] Documentar metodología adaptada

---

## 6. Referencias y Rastro de Fuentes

### Estudios originales
1. **Busan, Corea del Sur**: "Vessel Activity and Coastal Air Quality: Evidence from Busan, South Korea" - Journal of Fisheries Business Administration, Vol.57 No.1
   - [Enlace a estudio](http://www.e-fima.org/journal/article.php?code=97113)

### Metodologías AIS-Based
2. **Daesan Port, Corea**: "Coastal Air Quality Assessment through AIS-Based Vessel Emissions: A Daesan Port Case Study" - MDPI Journal of Marine Science and Engineering
   - [DOI: 10.3390/jmse11122291](https://www.mdpi.com/2077-1312/11/12/2291)

3. **New York Harbor**: "Spatial-Temporal Ship Pollution Distribution Exploitation and Harbor Environmental Impact Analysis via Large-Scale AIS Data" - MDPI
   - [DOI: 10.3390/jmse12060960](https://www.mdpi.com/2077-1312/12/6/960)

4. **China**: "Spatial-temporal analysis of carbon emissions from ships in ports based on AIS data" - ScienceDirect
   - [DOI: 10.1016/j.ocecoaman.2024.102693](https://www.sciencedirect.com/science/article/abs/pii/S0029801824017323)

5. **Naples, Italia**: "Port Emissions Assessment: Integrating Emission Measurements and AIS Data for Comprehensive Analysis" - MDPI Atmosphere
   - [DOI: 10.3390/atmos15040446](https://www.mdpi.com/2073-4433/15/4/446)

6. **Keelung, Taiwán**: "AIS-Based Scenario Simulation for the Control and Improvement of Ship Emissions in Ports" - MDPI
   - [DOI: 10.3390/jmse10020129](https://www.mdpi.com/2077-1312/10/2/129)

### Metodologías Bottom-Up (Latinoamérica)
7. **Itaguaí, Brasil**: "Evaluation of Bottom-UP Methodologies in Estimating Atmospheric Emissions from Ships: A Case Study of the Itaguaí-RJ Port Complex"
   - [DOI: 10.24857/rgsa.v17n7-068](https://rgsa.openaccesspublications.org/rgsa/article/view/4604)

8. **Veracruz, México**: "Review of Top-Down Method to Determine Atmospheric Emissions in Port. Case of Study: Port of Veracruz, Mexico" - MDPI
   - [DOI: 10.3390/jmse10010096](https://www.mdpi.com/2077-1312/10/1/96)

9. **México (38 puertos)**: "Atmospheric Emissions in Ports Due to Maritime Traffic in Mexico" - MDPI
   - [DOI: 10.3390/jmse9111186](https://www.mdpi.com/2077-1312/9/11/1186)

10. **Veracruz (detallado)**: "Air Quality and Atmospheric Emissions from the Operation of the Main Mexican Port in the Gulf of Mexico from 2019 to 2020" - MDPI
    - [DOI: 10.3390/jmse11020265](https://www.mdpi.com/2077-1312/11/2/265)

### Metodologías Satelitales
11. **Báltico**: "Geospatial Machine Learning for Maritime Environmental Exposure Analysis in Baltic Port Regions" - Theseus
    - [Enlace](https://www.theseus.fi/server/api/core/bitstreams/e9bb2cf8-1870-426f-bca9-ee6e72f5321c/content)

12. **Global Trade**: "Watching Trade from Space: Nowcasting and Spatial Extrapolation of Port-Level Maritime Trade Using Satellite Imagery" - arXiv
    - [arXiv:2604.15444](https://ar5iv.labs.arxiv.org/html/2604.15444)

13. **Port Utilization Index**: "Development of Port Utilization Index by Using Satellite Images"
    - [Fuente: exa.ai](https://exa.ai/library/publication/8f5nnwmkfjt)

14. **Nighttime Lights**: "A Global Assessment of Night Lights as an Indicator for Shipping Activity in Anchorage Areas"
    - [Fuente: exa.ai](https://exa.ai/library/publication/7sqmld9npc1)

15. **Port Saturation Index**: "Big brothering the economy: nowcasting and forecasting with port satellite images"
    - [Enlace](https://publicatt.unicatt.it/retrieve/4b0df3d-07b9-421f-926d-a431e67f6a1f/pdf)

### Metodologías Oficiales
16. **EMEP/EEA Guidebook 2023**: "EMEP/EEA air pollutant emission inventory guidebook 2023 - 1.A.3 Navigation"
    - [Descarga](https://www.eea.europa.eu/en/analysis/publications/emep-eea-guidebook-2023/part-b-sectoral-guidance-chapters/1-energy/1-a-combustion/1-a-3-d-navigation/@@download/file)

17. **EPA Port Inventory Guidance**: "Current Methodologies in Preparing Mobile Source Port-Related Emission Inventories: Final Report (April 2009)"
    - [Enlace](https://www.epa.gov/sites/production/files/2016-06/documents/2009-port-inventory-guidance.pdf)

18. **EPA Guidance Update**: "Port Emissions Inventory Guidance: Methodologies for Estimating Port-Related and Goods Movement Mobile Source Emissions"
    - [Enlace](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P1014J1S.txt)

### Estudios Multi-altura
19. **Paranaguá, Brasil**: "Surface monitoring underestimates air-pollution burden of a major Global South port" - Nature Communications Sustainability
    - [DOI: 10.1038/s44458-026-00090-2](https://www.nature.com/articles/s44458-026-00090-2)

### Fuentes de Datos Perú
20. **SENAMHI Calidad del Aire**: "Monitoreo de los contaminantes del aire en Lima Metropolitana"
    - [Datos Abiertos](https://www.datosabiertos.gob.pe/dataset/monitoreo-de-los-contaminantes-del-aire-en-lima-metropolitana-servicio-nacional-de)

21. **OEFA Calidad del Aire**: "Vigilancia y Seguimiento ambiental en la calidad del aire"
    - [Datos Abiertos](https://www.datosabiertos.gob.pe/dataset/vigilancia-y-seguimiento-ambiental-en-la-calidad-del-aire-organismo-de-evaluaci%C3%B3n-y)

22. **APN PIEP**: "Plataforma de Información de Estadísticas Portuarias"
    - [Sitio web](https://piep.apn.gob.pe/)

23. **AIS-Catcher San Miguel-Lima**: Estación AIS 1441
    - [Datos en vivo](https://www.aiscatcher.org/station/1441)

24. **Global Fishing Watch Perú**: Datos de ~1,300 buques pesqueros peruanos
    - [Noticia](https://fullavantenews.com/peru-publica-datos-de-seguimiento-de-buques-pesqueros-en-gfw/?lang=es)

### Estudios Puerto Callao
25. **Terminales Portuarios Peruanos**: "Alternativas de mejora para la calidad de aire y ruido ambiental"
    - [Repositorio UNFV](http://repositorio.unfv.edu.pe/handle/20.500.13084/7772)

26. **Plan de Acción Lima-Callao**: "Diagnóstico de la gestión de la calidad del aire de Lima-Callao"
    - [PDF SINIA](https://sinia.minam.gob.pe/sites/default/files/sinia/archivos/public/docs/diagnostico_calidad_aire_0.pdf)

27. **SGA Puerto Callao**: "Análisis del sistema de gestión ambiental de un operador portuario del terminal de contenedores del Puerto del Callao"
    - [Revista UNALM](https://revistas.lamolina.edu.pe/index.php/acu/article/download/1051/pdf_53)

28. **Humedal Callao**: "Air and soil pollution of coastal marine wetland by particulate matter from industrial sources in Callao, Perú"
    - [ALICIA CONCYTEC](https://alicia.concytec.gob.pe/vufind/index.php/Record/REVUNMSM_0951b6b50f3ecb2db697dd691c9e5efd/Details)

29. **Bahía Callao**: "Evaluación ambiental de la bahía del Callao durante el año 2017"
    - [Repositorio OEFA](https://repositorio.oefa.gob.pe/items/d1274751-08d7-402f-9124-a431e67f6a1f/full)

---

## 7. Conclusiones y Recomendaciones

### Viabilidad
✅ **VIABLE** para Lima/Callao con enfoque híbrido AIS + calidad del aire
⚠️ **LIMITADO** para otros puertos debido a falta de estaciones de monitoreo cercanas

### Recomendación Principal
Implementar primero el **Índice de Exposición Portuaria Simplificado** para Lima/Callao usando:
- Datos AIS (densidad de buques en lugar de tonelaje)
- Datos SENAMHI/OEFA (calidad del aire)
- Ponderación de distancia inversa
- Regresión con efectos fijos

### Siguientes Pasos
1. Descargar datos históricos de calidad del aire (SENAMHI/OEFA)
2. Obtener acceso a datos AIS históricos (AIS-catcher o comercial)
3. Procesar datos y calcular índice
4. Validar resultados
5. Documentar metodología adaptada
6. Evaluar expansión a otros puertos

### Limitaciones Reconocidas
- Sin tonelaje específico de buques (solo densidad/presencia)
- Cobertura geográfica limitada inicialmente
- Requiere procesamiento técnico de datos AIS
- Posible subestimación si solo monitoreo superficial (según estudio Paranaguá)

---

**Documento preparado**: 2026-10-04
**Fuente principal de rastro**: Buscar web + webfetch documentados en sección 6
