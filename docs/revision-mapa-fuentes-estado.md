# Revisión técnica objetiva del mapa de fuentes del Estado peruano

**Fecha**: 2026-08-17
**Propósito**: Revisión técnica basada en evidencia verificada en el proyecto

---

## Discrepancias críticas encontradas

### ❌ MEF – API CKAN (INCORRECTO)

**Afirmación del mapa**: "MEF tiene una API CKAN explícitamente documentada y permite tanto búsqueda mediante `datastore_search` como consultas SQL mediante `datastore_search_sql`."

**Realidad verificada** (según `docs/data-contracts/mef-presupuesto-ejecucion.md`):
> El portal **no expone la API CKAN estándar** (`/api/3/action/datastore_search`) — esa URL devuelve el shell HTML de la SPA Angular, no JSON. El acceso real es por **descarga directa de CSV**, un archivo por año/granularidad, servido desde un host de archivos estático separado.

**Evidencia**: Confirmado en vivo el 2026-08-16 mediante navegación real del portal.

**Impacto**: El mapa sobreestima la facilidad de integración del MEF. No hay API REST ni SQL — es descarga de archivos CSV muy grandes (4.5-10+ GB por año).

**Corrección necesaria**: MEF debería ser "Descarga CSV directa (no API)" con esfuerzo MEDIO-ALTO debido al tamaño de archivos y necesidad de streaming/range requests.

---

## Puntos que coinciden con verificación previa

### ✅ OECE – Contrataciones Abiertas (CORRECTO)

**Afirmación**: "OCDS / datos estructurados"

**Realidad**: Consistente con lo implementado en `compras-publicas`. OECE sí expone datos en formato OCDS.

**Esfuerzo**: Medio es correcto — requiere parsing de OCDS pero el formato es estándar.

---

### ✅ INFOBRAS – Contraloría (CORRECTO)

**Afirmación**: "datasets oficiales"

**Realidad**: Consistente con lo implementado en `infobras`. La Contraloría publica datasets en su área de Datos Abiertos.

**Esfuerzo**: Medio es correcto.

---

### ✅ CEPLAN GeoServer (CORRECTO)

**Afirmación**: "WMS/WFS/TMS/WCS — interfaz programática geoespacial estándar"

**Realidad**: Consistente con mi investigación y el data contract `ceplan-geo.md`. CEPLAN sí mantiene un GeoServer público con servicios OGC.

**Esfuerzo**: Bajo es correcto — WFS es estándar OGC, más estable que scraping.

---

### ✅ CEPLAN/ObservaPerú/V.01 (CORRECTO)

**Afirmación**: "datasets/descargas + apps estructuradas"

**Realidad**: Consistente con el data contract `ceplan-strategic-planning.md`. No hay API REST documentada, pero sí datasets descargables y aplicaciones estructuradas.

**Esfuerzo**: Medio-Alto es correcto — requiere reverse engineering.

---

## Puntos que requieren validación

### ⚠️ SUNAT – Padrón RUC (NO VERIFICADO)

**Afirmación**: "descarga masiva oficial — RUC, razón social, estado, domicilio, ubigeo"

**Estado**: No verificado en el proyecto actual. Es plausible pero necesitaría confirmación en vivo.

**Validación requerida**:
- Verificar que la descarga masiva existe y está actualizada
- Confirmar el formato (CSV, Excel, etc.)
- Verificar frecuencia de actualización
- Revisar términos de uso

---

### ⚠️ INEI – Microdatos (NO VERIFICADO)

**Afirmación**: "microdatos y datasets — población, pobreza, hogares, empleo, brechas"

**Estado**: No verificado en el proyecto actual. Es plausible dado que INEI es la fuente oficial de estadísticas.

**Validación requerida**:
- Verificar acceso a microdatos (requiere registro?)
- Confirmar formatos disponibles
- Revisar términos de uso y licencias
- Evaluar complejidad de integración

---

### ⚠️ BCRPData – API oficial (NO VERIFICADO)

**Afirmación**: "API oficial JSON/CSV/XML — macro, inflación, PBI, tasas, series regionales"

**Estado**: No verificado en el proyecto actual. Es plausible pero necesitaría confirmación.

**Validación requerida**:
- Verificar que la API existe y es pública
- Confirmar endpoints disponibles
- Revisar documentación para desarrolladores
- Evaluar rate limits y términos de uso

---

### ⚠️ ONPE – API resultados (NO VERIFICADO)

**Afirmación**: "API pública read-only de resultados electorales"

**Estado**: No verificado en el proyecto actual. Requiere confirmación.

**Validación requerida**:
- Verificar que la API existe y es pública
- Confirmar que es read-only (no requieren autenticación)
- Revisar estructura de datos

---

### ⚠️ JNE / Infogob (NO VERIFICADO)

**Afirmación**: "base pública estructurada — autoridades, candidatos, partidos, elecciones"

**Estado**: No verificado en el proyecto actual. Requiere confirmación.

**Validación requerida**:
- Verificar acceso a la base
- Confirmar formato de datos
- Revisar términos de uso

---

### ⚠️ MINEDU / MINSA / MTC (NO VERIFICADOS)

**Afirmación**: "datasets/portales sectoriales"

**Estado**: No verificados en el proyecto actual. Son plausibles pero requieren confirmación individual.

**Validación requerida**:
- Verificar existencia de datos abiertos en cada ministerio
- Confirmar formatos y cobertura
- Evaluar calidad y consistencia de datos

---

### ✅ PROINVERSIÓN / VERTIX (VERIFICADO — spike ADR-0010)

**Afirmación**: "portales y documentos estructurados parcialmente / datasets abiertos"

**Estado**: Verificado en vivo (2026-08-28). La cartera APP/PA es JSON estructurado vía
`vertixService.php` en `investinperu.pe` (340 proyectos, sin login). OxI exporta XLSX en
base64; GIS y documentos PDF siguen pendientes de profundizar.

**Detalle**: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`,
`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`

**No confundir** con Invierte.pe (`radar-inversiones`) — universos distintos; VERTIX no publica
CUI en el corte actual.

---

### ⚠️ OEFA / MINAM / ANA (NO VERIFICADOS)

**Afirmación**: "portales y documentos estructurados parcialmente / datasets abiertos"

**Estado**: No verificados en el proyecto actual. Requieren confirmación.

**Validación requerida**:
- Verificar accesibilidad de datos
- Evaluar dispersión de información (documentos vs datasets)
- Revisar restricciones de acceso (salas virtuales, etc.)

---

## Opinión técnica sobre la arquitectura propuesta

### ✅ Flujo principal es sólido

```text
CEPLAN Strategy → TERRITORY → MEF → OECE → Supplier → SUNAT → INFOBRAS → WORK
```

Este flujo principal es técnicamente sólido y coincide con el roadmap que creamos para CEPLAN.

### ⚠️ MEF como "API" es problemático

El mapa presenta MEF como si tuviera una API fácil, pero la realidad es:
- Archivos CSV de 4.5-10+ GB por año
- No hay API REST ni SQL
- Requiere streaming/range requests para ingesta parcial
- El conector actual usa HTTP Range y marca `isPartial: true`

Esto hace que el esfuerzo de MEF sea **MEDIO-ALTO**, no BAJO como indica el mapa.

### ✅ Priorización de waves tiene sentido

**Wave 1** (MEF + OECE + INFOBRAS + SUNAT) es técnicamente la más sólida porque:
- MEF: columna vertebral (aunque difícil de integrar)
- OECE: estándar OCDS
- INFOBRAS: datasets oficiales
- SUNAT: descarga masiva (plausible)

**Wave 2** (CEPLAN + INEI) coincide con nuestro roadmap CEPLAN.

---

## Recomendaciones técnicas

### 1. Corregir la entrada de MEF inmediatamente
- Cambiar "API CKAN oficial + SQL" por "Descarga CSV directa (no API)"
- Cambiar esfuerzo de "Bajo" a "Medio-Alto"
- Documentar el tamaño real de los archivos (4.5-10+ GB)

### 2. Validar antes de implementar
Las siguientes fuentes requieren verificación en vivo antes de ser consideradas para implementación:
- SUNAT (Padrón RUC)
- INEI (Microdatos)
- BCRPData (API)
- ONPE (API resultados)
- JNE/Infogob
- Ministerios sectoriales (MINEDU, MINSA, MTC)

### 3. El PRD maestro es una buena idea
La propuesta de crear un "PRD maestro de Peru Public Data Connectors" con contrato común (`source`, `entity resolution`, `freshness`, `provenance`, `confidence`) es técnicamente sólida y ayudaría a evitar desarrollo en islas.

### 4. No subestimar el esfuerzo de MEF
El mapa subestima significativamente el esfuerzo de integración del MEF. La realidad es:
- Archivos muy grandes
- No hay API real
- Requiere ingeniería de streaming para producción
- Alta probabilidad de cambios en formato/nombres de archivos

---

## Conclusión técnica

**El mapa tiene una visión estratégica valiosa, pero contiene un error crítico en la caracterización del MEF (presenta API donde no la hay) y varias afirmaciones no verificadas que requieren validación en vivo.**

**Puntos fuertes**:
- Visión integrada del ecosistema de datos públicos
- Priorización por waves tiene sentido técnico
- Arquitectura propuesta del knowledge graph es sólida
- Identificación correcta de CEPLAN como capa estratégica valiosa

**Puntos débiles**:
- Error crítico en MEF (no hay API CKAN)
- Múltiples fuentes no verificadas (requieren validación)
- Subestimación del esfuerzo de integración de varias fuentes
- Falta de evidencia para afirmaciones sobre APIs

**Recomendación**: Corregir la entrada de MEF inmediatamente y validar en vivo las fuentes marcadas como "NO VERIFICADO" antes de usar este mapa como base de planificación técnica.
