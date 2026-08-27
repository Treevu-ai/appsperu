# Brief producto — Retoma Sprint 6 ALSOL (Fase 2, 5 regiones)

**De:** equipo datos  
**Para:** equipo producto  
**Fecha:** 2026-08-27  
**Rama:** `cursor/alsol-ingest-5-regiones-f938` @ `d699cf0`  
**PR:** [#27](https://github.com/Treevu-ai/appsperu/pull/27)

---

## Estado de datos (listo para retomar)

### ✅ Hecho

| Fuente | Alcance | Evidencia |
|---|---|---|
| **Invierte** | 5/5 regiones | Corrida full 2026-08-26; cifras en `docs/indice-analisis-5-regiones-2026-08.md` |
| **MEF costa** | La Libertad, Lambayeque, Piura | `seccionesSinDatos: []` (16/16 GR/GL + meta GN); rama PR |
| **MEF La Libertad** | Baseline histórico | `docs/analisis-la-libertad-2026-08.md` |
| **Runbook operativo** | v2 contrastado con código | `acuba/downloads/runbook-ingesta-alsol-5-regiones.md` |

### 🟡 Bloqueantes operativos (no requieren decisión de producto, solo visibilidad)

| Item | Motivo | Quién destraba |
|---|---|---|
| **INFOBRAS 5 regiones** | Cloud agent: curl 28 / SSL timeout hacia `infobras.contraloria.gob.pe` | Operador con red local (runbook v2 §4) |
| **MEF Cajamarca/Cusco** | Offsets del CSV MEF no confirmados para sierra (runbook v2 §1.4) | Datos + validación JSON antes de declarar completo |

---

## 3 decisiones que necesitamos de producto

Reunión sugerida: **30 min**. Sin esto no cerramos puerta Sprint 6.

### 1. Plantilla de los 5 memos

**Archivos:** `docs/analisis-{la-libertad,lambayeque,piura,cajamarca,cusco}-2026-08.md`

| Opción | Descripción | Trade-off |
|:---:|---|---|
| **A** | Mantener `docs/plantilla-memo-regional-alsol-v1.md` (narrativa + preflight) | Más rápido para contenido; evidencia en anexo |
| **B** | Reescribir con plantilla evidencia runbook v2 §8.1 + §11 | Máxima trazabilidad; más lento hasta INFOBRAS local |

**Recomendación datos:** A + bloque de evidencia al final (híbrido).

**Decisión producto:** ☐ A  ☐ B  ☐ Híbrido (A + anexo evidencia)

---

### 2. INFOBRAS — dueño y fecha límite corrida local

| Campo | Propuesta (rellenar en reunión) |
|---|---|
| **Dueño** | |
| **Fecha límite** | |
| **Entorno** | Máquina con acceso a Contraloría (no cloud agent) |
| **Comando** | runbook v2 §4.1 |
| **Entregable** | Log + SQL §4.4 + `npm run coverage:infobras` |

**Decisión producto:** dueño _______________ · fecha _______________

---

### 3. MEF sierra (Cajamarca, Cusco)

| Opción | Descripción | Impacto Sprint 6 |
|:---:|---|---|
| **A** | Validar offsets ahora (spike técnico + re-corrida) | Puerta MEF+INFOBRAS más estricta; retrasa cierre |
| **B** | Dejar **parcial** con nota explícita en matriz | Cierra narrativa comparativa con caveat; SEG proxy dept sigue null |

**Decisión producto:** ☐ A validar offsets  ☐ B parcial con nota

---

## Referencias

| Recurso | Ruta |
|---|---|
| Runbook operativo v2 | `acuba/downloads/runbook-ingesta-alsol-5-regiones.md` |
| Runbook canónico cobertura | `docs/RUNBOOK_Cobertura_Territorial_ALSOL.md` |
| Matriz cobertura | `docs/matriz-cobertura-5-regiones-2026-08.md` |
| Diff v1→v2 (contexto) | `acuba/downloads/runbook-v1-vs-v2.diff` |
| Plantilla memos v1 | `docs/plantilla-memo-regional-alsol-v1.md` |

---

## Puerta Sprint 6 (recordatorio)

| Criterio | Estado |
|---|---|
| ≥ 2 deptos nuevos con MEF + INFOBRAS | 🟡 MEF LAM/PIU OK; INFOBRAS pendiente local |
| La Libertad sin regresión | ✅ |
| Matriz publicada | ✅ |
| Memos con cifras verificadas | 🟡 pendiente decisiones 1–3 |

---

## Mensaje listo para Slack / correo

```
Hola equipo de producto — el lado de datos está listo para retomar.

Runbook v2 commiteado en cursor/alsol-ingest-5-regiones-f938 (PR #27).

✅ Hecho: Invierte 5/5 · MEF costa (LL/LAM/PIU) limpio · baseline LL documentado
🟡 Bloqueante operativo: INFOBRAS local (cloud no alcanza Contraloría) · MEF sierra offsets por validar

Necesitamos 30 min para cerrar 3 puntos:
1. Plantilla memos: v1 narrativa vs evidencia runbook (ver brief §1)
2. Dueño + fecha INFOBRAS corrida local
3. MEF Cajamarca/Cusco: ¿validar offsets o parcial con nota?

Brief: acuba/downloads/brief-producto-sprint6-retoma.md
Runbook: acuba/downloads/runbook-ingesta-alsol-5-regiones.md

¿Cuándo pueden sentarse?
```
