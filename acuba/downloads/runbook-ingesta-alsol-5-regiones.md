# Runbook ALSOL — Ingesta Fase 2 (5 regiones)

**Versión:** 2026-08-26 v2 (contrastada con código en repo)  
**Audiencia:** equipo ALSOL / datos  
**Repo:** `github.com/Treevu-ai/appsperu`

> **Antes de ejecutar:** este documento distingue explícitamente qué aplica en `master` y qué solo existe en la rama de PR. Si un comando “no existe” en tu máquina, casi seguro estás en un checkout desactualizado o en la rama equivocada.

---

## 0. Verificación de checkout (obligatorio)

```powershell
cd C:\Users\acuba\appsperu
git fetch origin
git branch -a
git log --oneline -3
```

### Ramas relevantes

| Rama | Qué incluye |
|---|---|
| `master` | Conectores base, docs Fase 2 (PR #26 mergeado), `coverage:infobras`, `cobertura:territorial`, `ingest:invierte:full`, app `ceplan-geo` |
| `cursor/alsol-ingest-5-regiones-f938` | Todo lo anterior **más** `ingest:mef:pilot`, `mef-section-bounds.ts`, reintentos INFOBRAS ampliados (PR #27, puede no estar mergeado) |

```powershell
# Para el flujo piloto MEF multiregional (si existe el script):
git checkout cursor/alsol-ingest-5-regiones-f938
git pull origin cursor/alsol-ingest-5-regiones-f938

# Para flujo estable en master:
git checkout master
git pull origin master
```

### Comprobar que un script existe

```powershell
# INFOBRAS
Get-Content apps\infobras\api\package.json | Select-String "ingest:infobras|coverage:infobras"

# MEF
Get-Content apps\radar-ejecucion\api\package.json | Select-String "ingest:mef"

# Invierte
Get-Content apps\radar-inversiones\api\package.json | Select-String "ingest:invierte"

# Geo
Get-Content apps\ceplan-geo\api\package.json | Select-String "cobertura:geoserver"
```

---

## 1. Mapa de verdad — variables, scripts y apps

### 1.1 INFOBRAS — variables de entorno

**Fuente:** `apps/infobras/api/src/ingest/infobras-connector.ts` (bloque `process.argv` al final del archivo).

| Variable | Alcance | Notas |
|---|---|---|
| `INFOBRAS_DEPARTAMENTOS` | **Plural, lista CSV** | Preferida para multirregional. Ej: `LA LIBERTAD,LAMBAYEQUE,PIURA` |
| `INFOBRAS_DEPARTAMENTO` | **Singular, un departamento** | Fallback si no hay plural |
| *(ninguna)* | Default del conector | Usa `parseDepartamentoScope()` sin env |

**Excepción:** `crossref:build` en `apps/infobras/api/src/crossref/build-crosswalk.ts` solo lee `INFOBRAS_DEPARTAMENTO` (singular), default `LA LIBERTAD`. No usar plural ahí.

**`.env.example` oficial:** define `INFOBRAS_DEPARTAMENTOS=LA LIBERTAD,LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO`.

### 1.2 INFOBRAS — reintentos

| Rama | `MAX_ATTEMPTS` | Archivo |
|---|---:|---|
| `master` | **4** | `infobras-connector.ts` |
| `cursor/alsol-ingest-5-regiones-f938` | **6** (+ fallback curl) | mismo archivo |

### 1.3 MEF — dos rutas de ingesta

#### Ruta A — `master` (vía `npm run ingest:mef`)

**Fuente:** `apps/radar-ejecucion/api/src/ingest/mef-connector.ts` (~líneas 854–890).

| Modo | Variables requeridas |
|---|---|
| Ejecutora GR/GL año completo | `MEF_DATA_FILENAME` + `MEF_INGESTA_ANIO_COMPLETO=true` + `MEF_FILTER_EJECUTORA_DEPARTAMENTO=<DEPTO>` |
| Gobierno Nacional por meta | `MEF_DATA_FILENAME` + `MEF_INGESTA_META_DEPARTAMENTO=true` + `MEF_FILTER_DEPARTAMENTO=<DEPTO>` |
| Byte-range manual | `MEF_DATA_FILENAME` + `MEF_RANGE_START_BYTES` + `MEF_RANGE_MAX_BYTES` |

**No existe** `MEF_PILOT_DEPARTAMENTOS` en `master`.

#### Ruta B — rama PR (vía `npm run ingest:mef:pilot`)

**Fuente:** `apps/radar-ejecucion/api/src/cli/ingest-pilot-mef.ts`

| Variable | Uso |
|---|---|
| `MEF_DATA_FILENAME` | Obligatorio |
| `MEF_PILOT_DEPARTAMENTOS` | Lista CSV opcional; default = 5 deptos piloto en `pilot-departments.ts` |

Ejecuta por departamento: `ingestMefFullYearForDepartamento` + `ingestMefFullYearForMetaDepartamento`.

### 1.4 MEF — advertencia de offsets (crítica)

`ingestMefFullYearForDepartamento` **no usa offsets genéricos por departamento confirmados para todos**.

En la rama PR, `apps/radar-ejecucion/api/src/ingest/mef-section-bounds.ts`:

- **La Libertad:** offsets confirmados (`SECTION_OFFSETS_LA_LIBERTAD`).
- **Otros departamentos:** ventana estimada por posición alfabética dentro de la sección (`estimateDepartamentoCenter`).

**Implicación:** Cajamarca y Cusco pueden quedar **parciales** o con `seccionesSinDatos` no vacío hasta validar ventanas byte a byte. No asumir paridad con La Libertad sin revisar el JSON de salida.

El runbook canónico del repo ya lo advierte: `docs/RUNBOOK_Cobertura_Territorial_ALSOL.md` — *“No reutilizar offsets de La Libertad”*.

### 1.5 Scripts npm — tabla de verdad

| Script | App | `master` | Rama PR |
|---|---|:---:|:---:|
| `npm run ingest:infobras` | `apps/infobras/api` | ✅ | ✅ |
| `npm run coverage:infobras` | `apps/infobras/api` | ✅ | ✅ |
| `npm run crossref:build` | `apps/infobras/api` | ✅ | ✅ |
| `npm run ingest:mef` | `apps/radar-ejecucion/api` | ✅ | ✅ |
| `npm run ingest:mef:meta` | `apps/radar-ejecucion/api` | ✅ | ✅ |
| `npm run ingest:mef:pilot` | `apps/radar-ejecucion/api` | ❌ | ✅ |
| `npm run ingest:mef:pilot:ejecutora` | `apps/radar-ejecucion/api` | ❌ | ✅ |
| `npm run cobertura:territorial` | `apps/radar-ejecucion/api` | ✅ | ✅ |
| `npm run ingest:invierte` | `apps/radar-inversiones/api` | ✅ | ✅ |
| `npm run ingest:invierte:full` | `apps/radar-inversiones/api` | ✅ | ✅ |
| `npm run cobertura:geoserver` | `apps/ceplan-geo/api` | ✅ | ✅ |

**App geo correcta:** `apps/ceplan-geo` (no confundir con `apps/ceplan-estrategico`, que es indicadores nacionales).

**Invierte en Windows:** el repo incluye `scripts/run-invierte-full.ps1` y `scripts/verify-invierte-full.ps1` (ver `docs/RUNBOOK_Cobertura_Territorial_ALSOL.md`).

### 1.6 Documentación en repo

Tras `git pull origin master`, deben existir (verificar con `Test-Path`):

```
docs/matriz-cobertura-5-regiones-2026-08.md
docs/indice-analisis-5-regiones-2026-08.md
docs/PRD_CEPLAN_ALSOL_Fase2_5Regiones_v1.md
docs/analisis-la-libertad-2026-08.md
docs/analisis-lambayeque-2026-08.md
docs/analisis-piura-2026-08.md
docs/analisis-cajamarca-2026-08.md
docs/analisis-cusco-2026-08.md
docs/RUNBOOK_Cobertura_Territorial_ALSOL.md   ← runbook canónico preexistente
docs/data-contracts/infobras-obras-publicas.md
docs/data-contracts/mef-presupuesto-ejecucion.md
```

Si no aparecen: `git pull` incompleto o clone antiguo.

---

## 2. Objetivo operativo

Cerrar ingesta verificable para **LA LIBERTAD, LAMBAYEQUE, PIURA, CAJAMARCA, CUSCO**:

| Fuente | Bloqueo conocido |
|---|---|
| INFOBRAS | Cloud agent sin ruta TLS estable a `infobras.contraloria.gob.pe` → **corrida local obligatoria** |
| MEF costa (LL/LAM/PIU) | Verificado en rama PR; requiere checkout PR o replicar con Ruta A en master |
| MEF sierra (CAJ/CUS) | Parcial / offsets por validar |
| Invierte | Script full disponible; verificar con `verify-invierte-full.ps1` |

---

## 3. Preparación

### 3.1 `.env` mínimos

**`apps/infobras/api/.env`:**

```env
DATABASE_URL=postgres://infobras:infobras@localhost:5435/infobras
EJECUCION_DATABASE_URL=postgres://radar:radar@localhost:5432/radar_ejecucion
INFOBRAS_DEPARTAMENTOS=LA LIBERTAD,LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO
```

**`apps/radar-ejecucion/api/.env`:**

```env
DATABASE_URL=postgres://radar:radar@localhost:5432/radar_ejecucion
MEF_DATA_FILENAME=2026-Gasto-Mensual.csv
```

### 3.2 Migraciones

```powershell
cd apps\infobras\api; npm install; npm run migrate
cd ..\..\radar-ejecucion\api; npm install; npm run migrate
cd ..\..\radar-inversiones\api; npm install; npm run migrate
```

### 3.3 Preflight red INFOBRAS

Abrir: https://infobras.contraloria.gob.pe/InfobrasWeb/DataSets

Si no carga en el navegador, la ingesta CLI también fallará.

---

## 4. Tarea A — INFOBRAS (prioridad 1)

### 4.1 Ejecutar (PowerShell)

```powershell
cd C:\Users\acuba\appsperu\apps\infobras\api

# Si INFOBRAS_DEPARTAMENTOS está en .env:
npm run ingest:infobras

# O en una línea:
$env:INFOBRAS_DEPARTAMENTOS="LA LIBERTAD,LAMBAYEQUE,PIURA,CAJAMARCA,CUSCO"; npm run ingest:infobras

# Un solo departamento (alternativa):
$env:INFOBRAS_DEPARTAMENTO="LAMBAYEQUE"; npm run ingest:infobras
```

**No usar** sintaxis Bash en PowerShell (`INFOBRAS_DEPARTAMENTOS=... npm run`).

### 4.2 Guardar log auditable

```powershell
npm run ingest:infobras 2>&1 | Tee-Object -FilePath "..\..\..\logs\infobras-$(Get-Date -Format yyyyMMdd-HHmm).log"
```

(Crear carpeta `logs/` si no existe.)

### 4.3 Criterio de éxito

- Mensaje: `Ingesta de INFOBRAS completada:` con `accepted` >> 5.
- Exit code 0.
- Reintentos: **4** en master, **6** en rama PR.

### 4.4 SQL de verificación

```sql
SELECT departamento, COUNT(*) AS obras
FROM public_works
GROUP BY departamento
ORDER BY departamento;

SELECT departamento,
       COUNT(*) AS obras,
       COUNT(*) FILTER (WHERE existe_paralizacion) AS paralizadas,
       ROUND(100.0 * COUNT(*) FILTER (WHERE existe_paralizacion) / NULLIF(COUNT(*), 0), 1) AS pct
FROM public_works
GROUP BY departamento
ORDER BY departamento;
```

**Referencia La Libertad** (corrida histórica documentada en `docs/analisis-la-libertad-2026-08.md`): ~10,134 obras, ~2.5% paralizadas. Usar como sanity check, no como criterio automático.

### 4.5 Materializar cobertura

```powershell
cd C:\Users\acuba\appsperu\apps\infobras\api
npm run coverage:infobras
```

Escribe en `radar_ejecucion.territorial_coverage`.

### 4.6 Troubleshooting

| Síntoma | Acción |
|---|---|
| `curl 28` / `fetch failed` | Red/firewall; probar otra red |
| `curl 000` | Sin DNS/ruta |
| HTTP 503 mid-download | Reintentar (backoff en conector) |
| `accepted: 0` | Revisar nombres de departamento en MAYÚSCULAS exactas |

---

## 5. Tarea B — MEF

### 5.1 Opción recomendada si tienes la rama PR

```powershell
cd C:\Users\acuba\appsperu\apps\radar-ejecucion\api

# Costa (ya verificada en PR; re-correr solo si hay regresión):
$env:MEF_PILOT_DEPARTAMENTOS="LA LIBERTAD,LAMBAYEQUE,PIURA"; npm run ingest:mef:pilot

# Sierra (pendiente validación offsets):
$env:MEF_PILOT_DEPARTAMENTOS="CAJAMARCA,CUSCO"; npm run ingest:mef:pilot

# Solo ejecutora, sin meta GN:
$env:MEF_PILOT_DEPARTAMENTOS="CAJAMARCA,CUSCO"; npm run ingest:mef:pilot:ejecutora
```

**Criterio:** `"seccionesSinDatos": []` en JSON de salida (ejecutora y meta).

**Evidencia auditable:** guardar el JSON completo del resumen + timestamp en `logs/mef-pilot-*.json`.

### 5.2 Opción en `master` (un departamento a la vez)

```powershell
cd C:\Users\acuba\appsperu\apps\radar-ejecucion\api

# Ejecutora GR/GL
$env:MEF_DATA_FILENAME="2026-Gasto-Mensual.csv"
$env:MEF_INGESTA_ANIO_COMPLETO="true"
$env:MEF_FILTER_EJECUTORA_DEPARTAMENTO="LAMBAYEQUE"
npm run ingest:mef

# Meta GN dirigido al departamento
$env:MEF_INGESTA_META_DEPARTAMENTO="true"
$env:MEF_FILTER_DEPARTAMENTO="LAMBAYEQUE"
npm run ingest:mef
```

Repetir por departamento. **Validar offsets** antes de declarar completo (ver §1.4).

### 5.3 Cifras de referencia (rama PR, no auditar sin log propio)

Estas cifras provienen de corridas del cloud agent en PR #27. **No son evidencia en tu máquina** hasta replicar:

| Dept | GR % | GL % |
|---|---:|---:|
| LA LIBERTAD | 49.2 | 41.2 |
| LAMBAYEQUE | 52.9 | 42.6 |
| PIURA | 55.7 | 44.5 |

Log referenciado en PR (cloud): `/tmp/mef-retry-3dept-20260826.log` — no disponible localmente.

---

## 6. Tarea C — Invierte

```powershell
cd C:\Users\acuba\appsperu
.\scripts\run-invierte-full.ps1
.\scripts\verify-invierte-full.ps1
```

Equivalente directo:

```powershell
cd apps\radar-inversiones\api
npm run ingest:invierte:full
```

**No confundir** `ingest:invierte` (conector base, requiere params) con `ingest:invierte:full` (corrida completa por rangos).

---

## 7. Tarea D — Cobertura territorial (punto de control)

Runbook canónico: `docs/RUNBOOK_Cobertura_Territorial_ALSOL.md`

```powershell
cd C:\Users\acuba\appsperu\apps\radar-ejecucion\api
npm run cobertura:territorial -- --todas --require-complete

# Por jurisdicción:
npm run cobertura:territorial -- --app infobras --jurisdiccion LAMBAYEQUE
```

Geo:

```powershell
cd C:\Users\acuba\appsperu\apps\ceplan-geo\api
npm run cobertura:geoserver
```

---

## 8. Tarea E — Actualizar documentación

Solo después de tener **log + SQL** propios:

| Archivo | Actualizar |
|---|---|
| `docs/matriz-cobertura-5-regiones-2026-08.md` | Estado INFOBRAS / MEF por dept |
| `docs/indice-analisis-5-regiones-2026-08.md` | Tabla comparativa |
| `docs/analisis-{depto}-2026-08.md` | Secciones de obras y ejecución |

Plantilla de evidencia en memo:

```markdown
| Fuente | Estado | Evidencia |
|---|---|---|
| infobras | COMPLETA_VERIFICADA | log `logs/infobras-YYYYMMDD-HHMM.log`; SQL obras/pct |
| radar-ejecucion | COMPLETA_VERIFICADA | JSON `seccionesSinDatos: []`; log mef-pilot |
```

### 8.2 Plantilla de memos — decisión de producto

Los cinco memos (`docs/analisis-{depto}-2026-08.md`) pueden seguir dos rutas. Producto debe elegir una antes de cerrar Sprint 6:

| Opción | Base | Cuándo usar |
|---|---|---|
| **A — Plantilla v1** | `docs/plantilla-memo-regional-alsol-v1.md` | Memos ya redactados (Lambayeque, Piura, Cajamarca, Cusco) siguen esta estructura narrativa + tablas preflight |
| **B — Evidencia runbook v2** | §8.1 + §11 de este documento | Priorizar trazabilidad: cada afirmación con log/SQL/fecha; menos narrativa hasta cerrar INFOBRAS local |

**Recomendación datos:** Opción A para contenido público (LinkedIn); añadir bloque de evidencia §11 al final de cada memo sin reescribir el cuerpo.

---

## 9. Definición de terminado

| # | Criterio | Cómo verificar |
|---|---|---|
| 1 | INFOBRAS 5 deptos con `obras > 0` | SQL §4.4 |
| 2 | `coverage:infobras` sin error | Exit 0 + `territorial_coverage` |
| 3 | MEF costa `seccionesSinDatos: []` | JSON salida pilot o ingest:mef por dept |
| 4 | MEF sierra validado o documentado como parcial | JSON + nota en matriz |
| 5 | Invierte full verificado | `verify-invierte-full.ps1` |
| 6 | `cobertura:territorial` ejecutado | Log CLI |
| 7 | Memos actualizados con evidencia local | Commit en rama de trabajo |

---

## 10. Secuencia recomendada

```text
1. git fetch + verificar rama (§0)
2. migraciones + .env (§3)
3. INFOBRAS + log + SQL (§4)          ← bloqueante
4. coverage:infobras (§4.5)
5. MEF pilot o ingest:mef por dept (§5)
6. Invierte verify (§6)
7. cobertura:territorial (§7)
8. actualizar docs con evidencia (§8)
```

---

## 11. Plantilla de reporte (PR o ticket)

```markdown
## Corrida local ALSOL — YYYY-MM-DD HH:MM
**Rama:** master | cursor/alsol-ingest-5-regiones-f938
**Operador:** @nombre

### INFOBRAS
- Log: `logs/infobras-....log`
- accepted: NNNN | rejected: NNN

| Dept | Obras | Paralizadas | % |
|------|------:|------------:|--:|
| ... | | | |

### MEF
- Log/JSON: `logs/mef-pilot-....json`
| Dept | seccionesSinDatos ejecutora | seccionesSinDatos meta |
|------|----------------------------|------------------------|
| ... | [] o [lista] | [] o [lista] |

### Invierte
- verify-invierte-full.ps1: PASS/FAIL
```

---

## 12. Correcciones respecto al runbook v1 (desfasado)

| Error v1 | Verdad en código |
|---|---|
| Solo `INFOBRAS_DEPARTAMENTO` singular | **Ambos** plural y singular; plural preferido para multirregional |
| `coverage:infobras` no existe | **Sí existe** en `master` |
| `ingest:invierte:full` no existe | **Sí existe** en `master` |
| `cobertura:geoserver` no existe | **Sí existe** en `apps/ceplan-geo/api` |
| App geo = ceplan-estrategico | **Incorrecto** — geo = `apps/ceplan-geo` |
| `ingest:mef:pilot` en master | **Solo rama PR** — en master usar `ingest:mef` + env flags |
| MAX_ATTEMPTS siempre 6 | **4 en master**, 6 en rama PR |
| MEF genérico para cualquier dept | **La Libertad confirmado**; otros estimados — validar |
| Docs no existen | **Existen en master** tras PR #26; hacer `git pull` |
| Rama PR no existe | **Existe en origin**; `git fetch` + checkout |

---

## 13. Referencias

- Runbook canónico cobertura: `docs/RUNBOOK_Cobertura_Territorial_ALSOL.md`
- Matriz: `docs/matriz-cobertura-5-regiones-2026-08.md`
- Contrato INFOBRAS: `docs/data-contracts/infobras-obras-publicas.md`
- Contrato MEF: `docs/data-contracts/mef-presupuesto-ejecucion.md`
- PR ingesta piloto (si aplica): https://github.com/Treevu-ai/appsperu/pull/27

---

*Generado 2026-08-26. Contrastado contra `master` @ 78b696f y rama `cursor/alsol-ingest-5-regiones-f938` @ 13dab37.*
