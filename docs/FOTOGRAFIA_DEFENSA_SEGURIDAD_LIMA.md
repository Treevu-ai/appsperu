# Fotografía: Gasto Defensa, Seguridad Ciudadana & Estadísticas Policiales — Lima (2026-09)

> Análisis de disponibilidad de datos en AppsPeru para armar un panel de: lo bueno (eficiencia), lo malo (brechas), y lo que requiere seguimiento.

## Apps disponibles en Rastro

| App | Cobertura | Granularidad | Estado |
|-----|-----------|--------------|--------|
| **radar-ejecucion** | Presupuesto MEF (PIA/PIM/Devengado) | Entidad + Función + Año | ✓ Live |
| **mindef** | Convenios offset, capacitación, misiones de paz | Nacional (no territorial) | ✓ Live |
| **seguridad-ciudadana** | Denuncias policiales SIDPOL | Distrito (año 2024+) | ✓ Live |
| **violencia-escolar** | Casos SíseVe (violencia en IE) | UGEL (01/01/2024-hoy) | ✓ Live |
| **mimp** | Violencia contra la mujer (CEM + Chat 100) | Nacional + DRE (agregado) | ✓ Live |
| **poder-judicial** | Procesos judicales | Distrito Judicial + provincia | ✓ Live (2024+) |
| **informes-control** | Informes de servicios de control (Contraloría) | Nacional (sin datos PJ/PNP específicos) | ✓ Live |

---

## 1. Gasto en Defensa y Seguridad Ciudadana

### Vía `radar-ejecucion` (Presupuesto MEF)

**Función 009: ORDEN PUBLICO Y SEGURIDAD**
```bash
GET /api/execution?funcion=ORDEN%20PUBLICO%20Y%20SEGURIDAD&anio=2026
```

Devuelve:
- `entidad`: Policía Nacional del Perú (código 050100), Ministerio de Defensa (código 120000), etc.
- `PIA` (Presupuesto Institucional de Apertura)
- `PIM` (Presupuesto Institucional Modificado)
- `Devengado` (Gasto ejecutado)

**Para Lima específicamente:**
```bash
GET /api/execution?funcion=ORDEN%20PUBLICO%20Y%20SEGURIDAD&metaDepartamento=LIMA&anio=2026
```

**Crítica: Cobertura PARCIAL en `radar-ejecucion`**
- Solo cubre **gasto dirigido a La Libertad** (aplicado con offsets fijos en el conector MEF)
- Para Lima, la data es **nacional centralizada** — el MEF no desagrega por región en su CSV
- `meta_departamento=LIMA` devuelve gasto NACIONAL presupuestado (ej. sueldo del Comandante General de PNP), no gasto ejecutado EN Lima

**Alternativa: Cruce implícito**
- PNP es una entidad única nacional
- Su presupuesto (Función 009) se ejecuta por oficinas regionales, pero esos detalles no están públicos en MEF
- Hay que buscar datos operacionales por otra vía (ver abajo)

---

## 2. Datos Operacionales de Seguridad: Denuncias por Distrito (Lima)

### Vía `seguridad-ciudadana` (SIDPOL - MININTER)

```bash
GET /api/denuncias?departamento=LIMA&tipo_denuncia=*&anio=2024
```

**Disponible:**
- Denuncias por tipo (robo, homicidio, asalto, hurto, etc.)
- Por distrito (Lima tiene 43 distritos = 43 comisarías aproximadamente)
- Series 2024 en adelante (histórico 2003-2023 también ingeriado, pero el endpoint expone `MAX(anio)` por defecto)

**Estructura real:**
```json
{
  "anio": 2024,
  "mes": 1,
  "departamento": "LIMA",
  "provincia": "LIMA",
  "distrito": "LIMA",
  "tipo_denuncia": "ROBO",
  "cantidad": 1247,
  "tasa_por_100k": 32.1
}
```

**Distritación en Lima:**
- 43 distritos son los que trae la fuente SIDPOL
- Ejemplo: Comas, San Isidro, Breña, Ate, SJL, Los Olivos, Rímac, etc.

**Lo bueno:** Cifras reales de criminalidad por zona
**Lo malo:** 
- Sin desglose por comisaría específica o unidad de policía
- Sin datos de denuncias NO registradas (cifra negra)
- Sin resolución de casos (tasa de esclarecimiento)

---

## 3. Mapeo de Unidades y Activos Policiales

### **GAP CRÍTICO: NO EXISTE EN RASTRO**

Rastro NO ingiere:
- Padrón de comisarías por distrito
- Personal policial por comisaría (efectivos, rango, especialización)
- Equipamiento (vehículos, armamento, comunicaciones)
- Infraestructura (estado de la comisaría, hacinamiento)

**Fuentes externas a Rastro:**
1. **MININTER (no abierto):** padrón de comisarías — requiere acceso directo, no publicado en datosabiertos.gob.pe
2. **PNP Intranet/API interna (no abierto):** Sigespol — requiere credenciales
3. **Reportes anuales PNP:** memory.pdf anual, datos agregados no desagregados
4. **Investigación ad-hoc:** Informes de control de la Contraloría mencionan comisarías específicas

**Alternativa en Rastro:**
- `informes-control` (Contraloría) → buscar "comisaría" en nombre de informe
- Ver si hay auditorías a PNP que mencionen ubicación y estado de instalaciones

---

## 4. Violencia Escolar en Lima (Proxy de Seguridad)

### Vía `violencia-escolar` (SíseVe/MINEDU)

```bash
GET /api/casos?tipoReporte=PERSONAL_IE_A_ESCOLARES&tipoViolencia=FISICA&estado=LIMA
```

**Disponible:**
- Tipo de violencia: Psicológica, Física, Sexual
- Perpetrador: Personal IE vs. Entre Escolares
- Nivel educativo afectado
- DRE Lima (13 UGELs en Lima)

**Para fotografía de seguridad:**
- Violencia sexual en escuelas = indicador de falta de protección
- % de denuncias entre 2024-2026 por UGEL
- Correlación con presupuesto de seguridad escolar (MINEDU)

---

## 5. Violencia Contra la Mujer en Lima

### Vía `mimp` (CEM + Chat 100)

```bash
GET /api/casos?tipo_caso=VIOLENCIA_FISICA&departamento=LIMA&anio=2024
```

**Disponible:**
- Casos atendidos por Centros de Emergencia Mujer (CEM)
- Chat 100 (asesoría telefónica)
- Solo agregados por DRE — sin desagregación por comisaría

**Para fotografía:**
- Tasa de violencia doméstica como indicador de orden público
- Correlación con denuncias SIDPOL de tipo "Violencia Doméstica"

---

## 6. Procesos Judicales (Eficacia del Sistema)

### Vía `poder-judicial` (Estadística Jurisdiccional)

```bash
GET /api/procesos-judicales?distritoJudicial=LIMA&tipoExpediente=PENAL&anio=2024
```

**Disponible:**
- Procesos penales pendientes, resueltos, ingresados
- Resoluciones: sentenciados, absueltos, conciliados, anulados
- Por tipo de delito (especialidad: penal, civil, laboral, etc.)

**Para fotografía:**
- Congestión: (Pendientes / (Pendientes + Resueltos)) = % de retraso
- Tasa de resolución: Resueltos / (Pendientes al año anterior + Ingresados)
- Impunidad: Sentencias absolutoras / Total sentencias

**Limitación:** Código penal cambió en 2024 (CPC) — datos 2024+ pueden no ser comparables con 2023

---

## Queries de ejemplo para armar la "Fotografía"

### **Lo BUENO (Eficiencia, Cobertura)**

```bash
# 1. Ejecución presupuestal en PNP Lima 2024-2026
GET /api/execution?funcion=ORDEN%20PUBLICO%20Y%20SEGURIDAD&entidad=050100&anio=2024,2025,2026
# → Devuelve PIM vs Devengado = % de ejecución (ideal ≈ 85-95%)

# 2. Denuncias resueltas vs ingresadas (poder-judicial)
GET /api/procesos-judicales/resumen?groupBy=distritoJudicial&distritoJudicial=LIMA&anio=2024&condicion=ESPECIALIDAD_PENAL
# → Resueltos vs Pendientes = justicia ágil

# 3. Tasa de violencia sexual en escuelas DOWN (violencia-escolar)
GET /api/casos?tipoViolencia=SEXUAL&estado=LIMA&tipoReporte=ENTRE_ESCOLARES&fechaDesde=2024-01-01&fechaHasta=2025-01-01
# → Comparar 2024 vs 2025 = mejora en prevención
```

### **Lo MALO (Brechas, Riesgos)**

```bash
# 1. Distrito con mayor tasa de robo/asalto (seguridad-ciudadana)
GET /api/denuncias?departamento=LIMA&tipo_denuncia=ROBO&anio=2024&order=cantidad:DESC&limit=5
# → Top 5 distritos más inseguros

# 2. Comisarías sin presupuesto auditable (informes-control)
GET /api/informes?texto=comisaría&departamento=LIMA&anio=2024&resultado=CRÍTICA
# → Hallazgos de auditoría sobre infraestructura

# 3. Violencia contra la mujer SIN denuncia (mimp vs seguridad-ciudadana crossref)
# → Cifra negra: (Casos CEM / (Casos CEM + Denuncias SIDPOL)) = % no registrado formalmente
```

### **Lo que AMERITA SEGUIMIENTO (Indicadores de Alerta)**

```bash
# 1. Congestión judicial penal Lima (poder-judicial)
GET /api/procesos-judicales/resumen?groupBy=distritoJudicial&distritoJudicial=LIMA&anio=2024,2025,2026&especialidad=PENAL
# → Si Pendientes > 30% del total = riesgo de prescripción de delitos

# 2. Tasa de homicidios vs resoluciones (seguridad + poder-judicial cross)
# → Si (Homicidios denunciados 2024 / Sentencias condenatorias 2024) > 3:1 = impunidad

# 3. Violencia escolar sexual con agresor PERSONAL IE (violencia-escolar)
# → Si % PERSONAL_IE_A_ESCOLARES crece respecto a ENTRE_ESCOLARES = fallos de protección

# 4. Infracciones ambientales en distritos de Lima (infracciones-ambientales)
GET /api/infracciones?departamento=LIMA&anio=2024,2025,2026
# → Correlación: Minería ilegal → Inseguridad territorial
```

---

## GAP: Unidades y Activos Policiales

**¿Qué falta para una fotografía COMPLETA?**

- [ ] Padrón oficial de comisarías por distrito (51 comisarías en Lima aprox.)
- [ ] Personal: Total efectivos / Comisaría (crowding factor)
- [ ] Especialidades: UPP (Patrullas Móviles), DIVINCRI (Homicidios), etc.
- [ ] Equipamiento: Vehículos operativos vs. Total, Comunicaciones (tecnología), Armamento
- [ ] Respuesta: Tiempo promedio llegada a denuncia por zona
- [ ] Tasa de esclare­cimiento por tipo de delito

**Solución sugerida:**
1. Solicitar bajo FOIA a MININTER padrón de comisarías + personal
2. O buscar informes de Prensa Libre / Ojo Público que hayan investigado (datos secundarios)
3. O cruzar informes de auditoría de Contraloría (que sí mencionan comisarías específicas)

---

## Cruce Integrado (Recomendado)

Para una **fotografía holística**, combinar en un dashboard:

```
FILA: Distrito de Lima (Lima, SJL, Comas, Breña, etc.)
COLUMNAS:

1. PRESUPUESTO (radar-ejecucion)
   - PIM 2026 (Función ORDEN PUBLICO)
   - % Ejecución al 30 sep 2026

2. INSEGURIDAD (seguridad-ciudadana)
   - Tasa denuncias/100k (2024 vs 2025 vs 2026 YTD)
   - Tipo dominante (robo, asalto, homicidio)

3. VIOLENCIA SEXUAL (violencia-escolar + mimp)
   - Casos SíseVe por UGEL (si aplica distrito)
   - Casos CEM por comisaría zona (si aplica)

4. JUSTICIA (poder-judicial)
   - % Procesos penales resueltos vs pendientes
   - Años de retraso promedio

5. FALLAS AUDITORÍA (informes-control)
   - Críticas sobre infraestructura policial
   - Recomendaciones no implementadas

COLOR: 🟢 Bueno (% ejecución >85%, denuncias ↓, resolución >80%)
       🟡 Atención (% ejecuci­ón 70-85%, denuncias →, resolución 60-80%)
       🔴 Crítico (% ejecución <70%, denuncias ↑, resolución <60%)
```

---

## Herramienta: Queries MCP para CLI

**Desde Kilo CLI / MCP:**

```bash
# Buscar tools sobre seguridad y defensa
rastro_buscar_tools(query="defensa seguridad límadistiDato")

# Ejecutar: Presupuesto orden público Lima 2026
rastro_llamar(tool="radar_ejecucion_execution", args={
  "funcion": "ORDEN PUBLICO Y SEGURIDAD",
  "departamento": "LIMA",
  "anio": "2026"
})

# Ejecutar: Denuncias por distrito 2024
rastro_llamar(tool="seguridad_ciudadana_denuncias", args={
  "departamento": "LIMA",
  "anio": "2024",
  "order": "cantidad:DESC"
})

# Ejecutar: Procesos penales pendientes
rastro_llamar(tool="poder_judicial_procesos_resumen", args={
  "distritoJudicial": "LIMA",
  "especialidad": "PENAL",
  "anio": "2024"
})
```

---

## Nota Crítica: Datos Faltantes (Next Steps)

Para una **fotografía VERDADERA**, necesitarías:

1. ✓ Gasto presupuestal — **Ya en Rastro**
2. ✓ Denuncias por distrito — **Ya en Rastro**
3. ✗ Personal/comisarías por distrito — **NO en Rastro** (fuente privada)
4. ✗ Resolución de casos por tipo de delito — **Parcial en Poder Judicial** (agregado, no por comisaría)
5. ✗ Tiempo de respuesta PNP — **NO en Rastro** (internos PNP)
6. ✓ Violencia sexual en escuelas — **Ya en Rastro**
7. ✓ Violencia contra la mujer — **Ya en Rastro** (agregado nacional)
8. ✓ Procesos judicales — **Ya en Rastro** (2024+)

**Conclusión:** Rastro es fuerte en **datos públicos de inseguridad percibida + justicia**, débil en **capacidad operacional** (personal, equipamiento, respuesta).
