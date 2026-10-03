# PRD-003 · Mapa de Gota a Gota
**Versión:** 1.1 · **Fecha:** 2026-09-26 (actualizado 2026-10-02) · **Estado:** Implementado (v1, sin SBS)
**Autor:** Ricardo · **Alcance:** RASTRO / Treevu · **Prioridad:** 3/4

## 2.1 Actualización 2026-10-02 — SBS descartado, implementado sin ese lado

Al intentar construir el conector SBS (Fase 1, GOT-01/GOT-02) se confirmó en vivo que
**todo el dominio `sbs.gob.pe` está protegido por Incapsula** (WAF anti-bot) — tanto
`curl` como un navegador automatizado reciben el challenge de Incapsula en vez del
contenido real, en cualquier URL del portal (la antigua `casacambioweb.aspx` y la
nueva `/supervisados-y-registros/...`). Se investigó una API o dataset abierto
alternativo (`datosabiertos.gob.pe`, búsqueda de APIs públicas de SBS) — no existe
ninguno para este registro específico. Construir un scraper para evadir ese WAF
queda fuera de lo que este proyecto puede hacer.

**Implementado en su lugar:** candidatas por coincidencia de nombre en el Padrón RUC
nacional (`contribuyentes`, 2.3M filas — sin CIIU, así que no se puede filtrar por
código de actividad económica real) cruzadas con la tasa de extorsión SIDPOL por
departamento. Expuesto como `GET /api/financieras-informales` y
`GET /api/financieras-informales/resumen-geo` en `identidad-fiscal`
(`identidad_fiscal_financieras_informales`/`_resumen_geo` en el catálogo MCP).

Esto reemplaza GOT-01 a GOT-10 de la Fase 1/2 originales — ver
`docs/backlog/backlog-rastro-proyectos.md` Épica 3 para el detalle ticket por ticket.
No se construyó `score_riesgo` combinado (denuncias/casas_registradas de la Fase 2
original): sin el numerador de SBS, un ratio inventado implicaría una relación causal
no verificada. `candidatas`/`candidatasActivas` y `tasaExtorsion100k` se exponen como
dos señales independientes.

---

## 1. Objetivo del producto

Construir el mapa más completo que exista de la infraestructura financiera del crimen organizado urbano peruano: las casas de préstamo ("gota a gota"), empeños y fachadas financieras que mueven S/ 4,000 millones anuales con aproximadamente un millón de borrowers. El mapa cruza tres fuentes para generar una geolocalización aproximada y categorización: denuncias SIDPOL por modalidad, registro formal de la SBS, y Padrón RUC de SUNAT. El producto sirve a periodistas de investigación, fiscales especializados en lavado de activos y analistas de seguridad.

---

## 2. Estado actual — VERIFICADO 2026-09-26

### Resultado de la query SIDPOL (bloqueante)

```sql
SELECT DISTINCT modalidad FROM police_reports ORDER BY modalidad;
```

**Modalidades disponibles:** Estafa · Extorsión · Hurto · Otros · Robo · Secuestro · Violencia contra la mujer e integrantes

**Conclusión: "GOTA A GOTA" NO existe como modalidad en SIDPOL.** Las fachadas financieras se reportan como "Estafa" o "Otros", sin distingir el mecanismo gota a gota. **SIDPOL como fuente directa queda descartada para este producto.**

### Lo que sí existe

- **`identidad-fiscal`** (p.4006): Padrón RUC SUNAT (~2.3M filas). Campos: RUC, razón social, estado, ubigeo, CIIU. Ya está ingestado.
- **`seguridad-ciudadana`** (p.4010): denuncias por distrito/año/mes/modalidad. "Extorsión" es la modalidad más cercana al fenómeno (la extorsion suele usar gota a gota como mecanismo de coerción financiera).
- **SBS**: registro de casas de cambio, préstamos y empeños — interfaz web dinámica, requiere Playwright.

### Lo que no existe

| Gap | Severidad |
|---|---|
| SIDPOL no tiene modalidad gota a gota — enfoque replanteado | 🔴 Crítica |
| SBS sin descarga masiva — requiere Playwright | 🟡 Alta |
| Modelo de datos no existe | 🔴 Crítica |

### Estrategia replanteada

Sin SIDPOL como fuente directa, el mapa se construye desde tres ángulos complementarios:

1. **SBS (Playwright)** — listado de casas registradas formalmente
2. **Padrón RUC** — todas las empresas por ubigeo/giro; filtrar por CIIU relevante (6492, 6499, 6619)
3. **Cruce con extorsión SIDPOL** — los distritos con alta tasa de extorsión tienen alta probabilidad de operar con fachada gota a gota. Esto permite geolocalizar sin tener la modalidad exacta.

---

## 3. Arquitectura propuesta

### Fase 0 — Verificación (bloqueante)

```sql
-- Ejecutar contra seguridad_ciudadana (p.5441)
SELECT DISTINCT modalidad FROM police_reports
WHERE lower(modalidad) LIKE '%gota%'
   OR lower(modalidad) LIKE '%prestamo%'
   OR lower(modalidad) LIKE '%empeno%'
   OR lower(modalidad) LIKE '%informal%'
   OR lower(modalidad) LIKE '%credito%'
ORDER BY modalidad;
```

Si devuelve filas → SIDPOL es la fuente primaria. Si no devuelve → replantear estrategia.

### Fase 1 — Datos (nuevo conector SBS)

**`sbs-casas-prestamo-connector.ts`** — Playwright-based:

```
URL: https://www.sbs.gob.pe/app/pp/regiweb/paginas/casacambioweb.aspx
Tabs: Casas de cambio | Empresas de préstamos y empeños

Campos a extraer:
  - Razón social
  - RUC
  - Dirección
  - Departamento
  - Teléfono

Frecuencia: semanal (el registro cambia poco)
Scheduler: cron semanal
```

### Fase 2 — Modelo de datos

```sql
CREATE TABLE casas_gota_gota (
  ruc            TEXT PRIMARY KEY REFERENCES contribuyentes(ruc),
  razon_social   TEXT,
  estado_sbs     TEXT,         -- 'REGISTRADO' | 'NO_REGISTRADO' | 'BAJA'
  estado_ruc     TEXT,         -- 'ACTIVO' | 'HABIDO' | 'BAJA'
  departamento   TEXT,
  provincia      TEXT,
  distrito       TEXT,
  ubigeo         TEXT,
  origen         TEXT,         -- 'SIDPOL' | 'SBS' | 'RASTRO_RUC' | 'CRUCE'
  modalidades    TEXT[],       -- ['EXTORSION', 'GOTA_A_GOTA']
  score_riesgo   NUMERIC,     -- 0-100, calculado
  ultima_actualizacion DATE
);

CREATE TABLE denuncias_gota_gota (
  anio INT, mes INT, ubigeo TEXT, modalidad TEXT,
  cantidad INT,
  PRIMARY KEY (anio, mes, ubigeo, modalidad)
);
```

### Fase 3 — API

| Endpoint | Descripción |
|---|---|
| `GET /api/gota-gota/casas` | Lista con filtros (departamento, estado_sbs, score_riesgo) |
| `GET /api/gota-gota/denuncias` | Denuncias por modalidad gota a gota, por ubigeo/mes |
| `GET /api/gota-gota/cruce/:ruc` | Detalle de un RUC: sanciones, denuncias, estado SBS |
| `GET /api/gota-gota/resumen-geo` | Agregados por distrito: cantidad casas, density, ratio |

---

## 4. Preocupaciones operacionales

| Preocupación | Mitigación |
|---|---|
| Playwright SBS es frágil (cambios de interfaz) | Tablas HTML con selectores robustos + snapshots de testing |
| "2,000 fachadas" no es dato verificado | Documentar como estimación de FEPCMAC, no como cifra validada |
| SBS sin descarga masiva | Ingest incremental: 1 casa/请求 + rate limiting |

---

## 5. Scope

### In
- Query de verificación SIDPOL (bloqueante)
- Conector SBS (Playwright)
- Tablas `casas_gota_gota` + `denuncias_gota_gota`
- Endpoint `/api/gota-gota/*`
- Tests del conector SBS

### Out
- Mapa geoespacial interactivo (fase 2)
- Modelo de ML de score de riesgo (fase 2)
- Notificaciones de nuevas fachadas detectadas
