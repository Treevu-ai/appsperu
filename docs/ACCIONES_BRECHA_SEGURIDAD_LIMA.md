# Brechas de Datos en Seguridad Lima: Opciones de Acción

> Análisis de fuentes alternas + feasibility para cerrar gaps: padrón de comisarías, personal, equipamiento, respuesta operacional.

---

## 1. Padrón de Comisarías (Ubicación, Jurisdicción, Infraestructura)

### Opción A: MININTER Portal de Transparencia (Solicitud FOIA)
**Feasibility: ALTA** | **Legalidad: ✓ Pública** | **Tiempo: 2-4 semanas**

**Qué pedir:**
- Catálogo oficial de comisarías por región
- Ubicación geográfica (latitud/longitud o dirección)
- Jurisdicción (distritos asignados)
- Año de creación / estatus operativo

**Formato esperado:** CSV o XLSX

**Contacto:** `transparencia@mininter.gob.pe` (Artículo 13, Ley 27806)

**Riesgo:** Podrían rechazar parcialmente argumentando "seguridad operacional"

---

### Opción B: Scraping del Mapa Interactivo PNP (`www.pnp.gob.pe/mapa-de-comisarias`)
**Feasibility: MEDIA** | **Legalidad: ⚠️ Gris (ToS vs. datos públicos)** | **Tiempo: 3-5 días**

**Cómo:**
1. Inspeccionar con DevTools → red requests al endpoint AJAX
2. Probablemente sea un `POST` a una API GIS/ArcGIS/Mapbox sin autenticación
3. Parsearlo en Node.js, normalizar ubicaciones con geopy + OpenStreetMap

**Riesgo:** 
- Si tiene WAF, puede bloquearse
- Cambios en la API sin notificación

**Ventaja:** Datos casi reales (actualizados al último deploy PNP)

---

### Opción C: Informes de la Contraloría + Investigación Secundaria
**Feasibility: MEDIA** | **Legalidad: ✓ Pública** | **Tiempo: 2-3 semanas**

**Fuente:**
- `informes-control` en Rastro ya ingiere informes de Contraloría por entidad
- Buscar auditorías a "Policía Nacional" → suelen mencionar comisarías específicas, su ubicación, y estado

**Ejemplo real:**
- Informe "Auditoría de Gestión a la Dirección Territorial de Lima de la PNP" (2024)
- Menciona: Comisaría XX en Comas, hacinamiento 120%, infraestructura deficiente

**Método:**
```bash
GET /api/informes?texto=comisaría&departamento=LIMA&anio=2024
# → Parsear PDF, extraer nombres/ubicaciones de comisarías mencionadas
```

**Riesgo:** 
- Datos incompletos (no todas las comisarías auditadas)
- Información desactualizada (auditoria 2024 de situación 2023)

---

### Opción D: Prensa Libre / Ojo Público Datasets
**Feasibility: MEDIA-BAJA** | **Legalidad: ✓ Open License** | **Tiempo: 1 semana**

**Fuente:**
- Investigaciones periodísticas sobre "Comisarías abandonadas", "Corrupción PNP" suelen compilar datos
- Ojo Público publica datasets en GitHub: `github.com/ojopublicope/datasets`
- Pueden tener padrón parcial + contactos de comisarías

**Riesgo:**
- Datos de periodismo, no censo oficial
- Posible sesgo editorial (solo "malas" comisarías documentadas)

---

## 2. Personal Policial por Comisaría (Efectivos, Rango, Especialización)

### Opción A: Solicitud FOIA a MININTER
**Feasibility: BAJA-MEDIA** | **Legalidad: ⚠️ Probable rechazo** | **Tiempo: 4-6 semanas**

**Por qué baja:** Argumentarán "seguridad operacional" / "información sensible que podría usarse para planificación delictiva"

**Qué pedir (suavizadamente):**
- Total de efectivos PNP por región (agregado)
- Ratio policía/población por provincia
- % de cobertura de especialidades (DIVINCRI, UPP, Motorizados)

**Estrategia:** Pedir primero en forma de "*agregados solamente, sin identificadores individuales*"

**Riesgo:** Rechazo sustentado, difícil de impugnar

---

### Opción B: Minería de Texto en Resoluciones de Personal (MININTER Intranet)
**Feasibility: BAJA** | **Legalidad: ✗ Privado** | **Tiempo: N/A**

**Cómo (teórico):**
- Las resoluciones de ascenso/designación se publican en el Peruano (diario oficial)
- Parsear `elperuano.pe` → búsqueda "Policía Nacional" → extraer nombres + destino (ej. "Destacado en Comisaría Breña")
- Acumular sobre años → estadística de personal por comisaría

**Riesgo:**
- Muy tedioso (datos de 1-2 personas por día)
- Solo cubre cambios, no el padrón completo
- Sesgo: solo ascensos publicados, no efectivos anónimos

---

### Opción C: Prensa / Reportería Investigativa
**Feasibility: BAJA** | **Legalidad: ⚠️ Según fuente** | **Tiempo: Variable**

**Ejemplo:**
- Ojo Público, 2023: "La PNP tiene miles de efectivos sin entrenamiento" → Mencionan cifras por región
- Prensa Libre: "Comisaría XX colapsa con 30 efectivos para 500k habitantes"

**Método:**
- Buscar en Factiva / Nexis (requiere suscripción)
- O mining manual de Google News + LLM para extraer cifras

---

## 3. Equipamiento Policial (Vehículos, Armamento, Comunicaciones)

### Opción A: Solicitud FOIA a MININTER
**Feasibility: BAJA** | **Legalidad: ⚠️ Probable rechazo** | **Tiempo: 4-6 semanas**

**Por qué:** Argumento de seguridad es incluso más fuerte (capacidad operacional = inventario de armas/vehículos)

**Qué pedir (máximo realista):**
- Edad promedio de flota de vehículos (no cantidad)
- % de unidades operativas (agregado nacional)
- Presupuesto anual en equipamiento (está en MEF, ya en Rastro)

---

### Opción B: Reportería / ONG Documentación
**Feasibility: MEDIA** | **Legalidad: ✓ Pública** | **Tiempo: 2-3 semanas**

**Ejemplo:**
- Defensoría del Pueblo: "Informe sobre vulnerabilidad en cárceles y comisarías" (2022-2023)
- Menciona: "Comisaría XX carece de sistemas de comunicación, incomunicabilidad de detenidos"
- Extractos sobre equipamiento deficiente

**Método:**
```bash
# Buscar en definitoriado.defensoría.gob.pe
# O solicitar informes recientes sobre "Derechos del detenido en comisarías"
```

---

### Opción C: Portal de Contrataciones del Estado (SEACE)
**Feasibility: ALTA** | **Legalidad: ✓ Abierto** | **Tiempo: 1-2 semanas**

**Lógica:**
- Si PNP compra vehículos, armas, comunicaciones → pasa por SEACE (Ley de Contrataciones)
- Buscar en `apps/compras-publicas` contratos de "Policía Nacional" en últimos 5 años

```bash
GET /api/awards?supplier_entity=*PNP*&subject=VEHICULO|ARMAMENTO|COMUNICACIONES&anio=2020,2021,2022,2023,2024,2025,2026
```

**Qué devuelve:**
- Cantidad comprada (ej. "50 patrulleros 2023")
- Año de compra
- Monto invertido
- Proveedor

**Ventaja:** Datos públicos + auditorios, menos censurado que MININTER

**Riesgo:**
- Solo muestra compras **nuevas**, no stock existente
- No hay info de "vehículos operativos vs. total" (subestimación de flota vieja)

**Recomendación:** Implementar **`seace-pnp-equipamiento-connector.ts`** basado en esto

---

## 4. Tiempo de Respuesta Operacional (Llegada a Denuncia)

### Opción A: Solicitud FOIA a PNP / MININTER
**Feasibility: BAJA** | **Legalidad: ⚠️ Probable rechazo** | **Tiempo: 4-6 semanas**

**Argumento:** "Información operacional sensible"

---

### Opción B: Investigación con Crowdsourcing (Participatory Sensing)
**Feasibility: MEDIA** | **Legalidad: ✓ Pública** | **Tiempo: 3-6 meses (acumulación)**

**Modelo:**
- App o formulario que registre: "Llamé a PNP a las HH:MM, llegaron a las HH:MM"
- Agregar por distrito + tipo de delito
- Calcular: mediana de respuesta por zona

**Riesgo:**
- Requiere adopción de usuarios (baja si no hay incentivo)
- Datos sesgados (solo usuarios que reportan)

---

### Opción C: FOIA a MININTER (Solicitud Minimalista)
**Feasibility: MEDIA** | **Legalidad: ✓ Transparencia** | **Tiempo: 4-6 semanas**

**Pedir específicamente:**
- "Tiempo promedio de respuesta a denuncias por provincia, últimos 3 años"
- "Bajo en formato agregado, sin información de casos individuales"

**Estrategia:** Framing como "evaluación de desempeño de eficiencia estatal", no crítica

---

## Resumen de Acciones Recomendadas (Prioridad)

| Rango | Brecha | Opción | Feasibility | Impacto | Esfuerzo | Action |
|-------|--------|--------|-------------|---------|----------|--------|
| 1️⃣ | Padrón comisarías | C: Informes Contraloría | MEDIA | ALTO | Bajo | ✓ Implementable ahora (parseo de informes-control) |
| 2️⃣ | Padrón comisarías | B: Scraping mapa PNP | MEDIA | ALTO | Medio | ✓ Implementable en 1 semana |
| 3️⃣ | Equipamiento | C: SEACE contratos PNP | ALTA | MEDIO | Bajo | ✓ Implementable ahora (nueva query en compras-publicas) |
| 4️⃣ | Personal (agregado) | A: FOIA MININTER | MEDIA | MEDIO | Muy bajo | ⏳ Solicitud en paralelo |
| 5️⃣ | Tiempo respuesta | C: FOIA MININTER | MEDIA | ALTO | Muy bajo | ⏳ Solicitud en paralelo |
| 6️⃣ | Personal detalle | A: FOIA MININTER | BAJA | ALTO | - | ✗ Probable rechazo |

---

## Plan de Implementación (Próximas 4 semanas)

### Semana 1-2: Bajo Esfuerzo, Alto Retorno

**Tarea 1: Nuevo connector `informes-control-comisarias.ts`**
```typescript
// apps/informes-control/api/src/routes/comisarias.ts
// Parsea informes de Contraloría que mencionen comisarías específicas
// Extrae: nombre_comisaría, ubicación, hallazgos (infraestructura, personal, etc.)

GET /api/comisarias?departamento=LIMA&anio=2024
// → Devuelve comisarías mencionadas en informes + resumen de hallazgos
```

**Tarea 2: Nueva query en `compras-publicas`**
```bash
GET /api/awards?supplier_entity=MININTER|PNP&subject=VEHICULO|ARMAMENTO|COMUNICACIONES&anio=2020-2026
# → Presupuesto PNP en equipamiento por año
```

**Tarea 3: Scraping experimental del mapa PNP**
```bash
# Crear script: apps/seguridad-ciudadana/scripts/scrape-pnp-mapa.ts
# Prueba de concepto: ¿API del mapa es accesible sin Selenium?
```

### Semana 3: FOIA + Reportería

**Tarea 4: Redactar solicitud FOIA a MININTER**
```
Solicitud bajo Ley 27806:
- Padrón de comisarías por región (ubicación, jurisdicción)
- Ratio policía/población por provincia
- Tiempo promedio respuesta a denuncias (agregado)
```

**Tarea 5: Mining de Peruano + prensa**
```bash
# Script: docs/scripts/mine-resolutions-pnp.py
# Busca en elperuano.pe resoluciones de PNP
# Extrae destinos de oficiales (comisarías mencionadas)
```

### Semana 4: Documentación + Siguiente Fase

**Tarea 6: ADR (Architecture Decision Record)**
```markdown
docs/adr/XXXX-pnp-equipamiento-capacidad-operacional.md

Problema: Fotografía de seguridad Lima incompleta sin:
- Padrón de comisarías + personal
- Equipamiento operacional

Solución propuesta (Fase 1, bajo esfuerzo):
1. Parsear informes-control (comisarías mencionadas)
2. Scraping experimental mapa PNP
3. SEACE contratos (equipamiento)

Solución futura (alto esfuerzo, requiere FOIA):
1. Padrón oficial MININTER
2. Crowdsourcing tiempo de respuesta
```

---

## Conectores Nuevos (Pseudocódigo)

### Connector 1: `informes-control-comisarias-extractor.ts`

```typescript
/**
 * Parsea informes de Contraloría, extrae menciones de comisarías en Lima.
 * 
 * GET /api/comisarias?departamento=LIMA&anio=2024
 * 
 * Devuelve:
 * {
 *   nombre: "Comisaría Breña",
 *   ubicacion_aproximada: "Breña, Lima",
 *   hallazgos_auditoría: [
 *     { anio: 2024, crítica: "Hacinamiento de celdas (120% capacidad)" },
 *     { anio: 2024, crítica: "Falta mantenimiento de infraestructura" }
 *   ],
 *   fuente_informe: { id_informe: 12345, url: "..." }
 * }
 */
```

### Connector 2: `seace-pnp-equipamiento-connector.ts`

```typescript
/**
 * Consulta SEACE awards de PNP, agrega por tipo de equipamiento.
 * 
 * Lógica: PNP compra vehículos/armas/comun → SEACE
 * Luego: Agrupar por (anio, tipo_equipamiento) → inversión total anual
 * 
 * GET /api/equipamiento?anio=2020-2026&tipo=VEHICULO|ARMAMENTO|COMUNICACIONES
 * 
 * Devuelve:
 * {
 *   anio: 2024,
 *   tipo: "VEHICULO",
 *   cantidad_comprada: 50,
 *   monto_soles: 5000000,
 *   proveedores: ["Provedor A", "Proveedor B"],
 *   observacion: "Compra documentada en SEACE"
 * }
 */
```

### Connector 3: `pnp-mapa-comisarias-scraper.ts` (Experimental)

```typescript
/**
 * Intenta scrapear el mapa interactivo de comisarías de PNP.
 * 
 * Flujo:
 * 1. Inspeccionar www.pnp.gob.pe/mapa-de-comisarias con DevTools
 * 2. Encontrar endpoint AJAX (probablemente POST a GIS/Mapbox)
 * 3. Reproducir con curl/node-fetch
 * 4. Parsear respuesta GeoJSON
 * 5. Normalizar ubicaciones con geopy + OpenStreetMap
 * 
 * Si funciona:
 * GET /api/comisarias-gis?departamento=LIMA
 * Devuelve: [{ nombre, lat, lng, telefono, jurisdiccion: [...distritos] }]
 * 
 * Riesgo: WAF, cambios en API, ToS violation
 * Status: EXPERIMENTAL - no producción sin confirmación legal
 */
```

---

## Recomendación Final

**Hacer en las próximas 2 semanas:**

1. ✓ Connector 1 + Connector 2 (bajo esfuerzo, datos públicos, alto impacto)
2. 🧪 Connector 3 como POC (experimental, sin producción aún)
3. ✉️ Enviar FOIA a MININTER (tiempo: se resuelve en paralelo)

**Resultado esperado:**
- Fotografía Lima "v1.5": Padrón comisarías (parcial) + Equipamiento + Infraestructura (auditoría)
- "v2.0" (posterior a FOIA): Padrón oficial + Personal + Tiempo respuesta

---

## Tickets para el Backlog

```
[SEC-01] Extraer comisarías de informes-control (parseo de Contraloría)
[SEC-02] Scraper experimental: Mapa PNP
[SEC-03] Query SEACE: Equipamiento PNP (vehículos, armamento, comun)
[SEC-04] FOIA MININTER: Padrón oficial + personal + tiempo respuesta
[SEC-05] Mining de El Peruano: Resoluciones PNP (destinos comisarías)
```
