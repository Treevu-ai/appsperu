# Diseño propuesto — Scheduler de ingesta (RCC-10 a RCC-12, SID-14 a SID-16)

**Estado:** PROPUESTA, no implementada ni activada. Ver
`docs/backlog/backlog-rastro-proyectos.md` (Épica 1, Historia 1.4; Épica 2, Historia 2.4).
Configurar un cron real en producción es una decisión operativa (quién lo monitorea, qué pasa si
falla, qué le cuesta a la cuenta de Neon/GitHub) — esto solo deja el diseño listo para que el
usuario decida si lo activa.

## Por qué GitHub Actions y no Cloudflare Cron Triggers

El Worker del MCP (`mcp-server/wrangler.toml`) ya tiene `[triggers] crons = []` como placeholder,
así que la opción "obvia" sería usar un Cron Trigger de Cloudflare. Pero los conectores de ingesta
(`apps/*/api/src/ingest/*-connector.ts`) son scripts Node que abren conexiones TCP directas a
Postgres con el driver `pg` — el runtime de Cloudflare Workers no soporta TCP crudo ni child
processes, solo el driver HTTP de `@neondatabase/serverless` que ya usa el Worker para servir
tools. Mover la lógica de ingesta al Worker sería reescribir cada conector, no agregar un cron.

**GitHub Actions ya está en el repo** (`.github/workflows/ci.yml`,
`.github/workflows/check-connectors.yml`), ya sabe instalar cada app y ya tiene (o puede tener) los
secrets de `DATABASE_URL` por app como GitHub Secrets. Un `schedule:` trigger ejecuta
`npx tsx src/ingest/<conector>.ts` tal cual se corre hoy a mano — cero reescritura de conectores,
cero infraestructura nueva.

## Propuesta de workflow (ejemplo, NO creado todavía)

```yaml
# .github/workflows/ingest-scheduled.yml (BORRADOR, no commiteado)
name: Ingesta programada

on:
  schedule:
    # SIDPOL: el origen (datosabiertos.gob.pe) publica mensualmente, no hace
    # falta correr a diario. 06:00 UTC del día 5 de cada mes.
    - cron: "0 6 5 * *"
  workflow_dispatch: {} # permite correrlo a mano desde la UI de Actions

jobs:
  ingest-sidpol:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - working-directory: apps/seguridad-ciudadana/api
        run: npm install
      - working-directory: apps/seguridad-ciudadana/api
        env:
          DATABASE_URL: ${{ secrets.SEGURIDAD_CIUDADANA_DATABASE_URL }}
        run: npx tsx src/ingest/sidpol-connector.ts
      # Si falla, GitHub ya notifica por correo a quien tenga watch en el
      # repo -- no hace falta un paso extra de alerta para la v1.
```

## Qué falta para que esto sea seguro de activar (no es "solo pegar el YAML")

1. **Cada conector que se agregue a un cron tiene que ser idempotente.** No todos lo son hoy:
   `osinergmin-connector.ts` (grifos) usa `ON CONFLICT ... DO UPDATE` y es seguro re-correr;
   `ositran-connector.ts` ya se corrigió en esta sesión para hacer `DELETE` + reemplazo completo
   antes de insertar. Pero varios conectores del repo (ver `apps/*/api/src/ingest/*.ts`) solo
   hacen `INSERT` sin `ON CONFLICT` ni limpieza previa — correrlos dos veces duplicaría filas. Antes
   de agregar un conector a un cron, confirmar cuál de los dos patrones usa.
2. **Secrets por app.** Cada app tiene su propia `DATABASE_URL` de Neon (ver
   `mcp-server/src/db/neon-env.ts` para el patrón de nombres de base). Hay que cargar cada una como
   GitHub Secret (`gh secret set <APP>_DATABASE_URL`) — no están ahí todavía, hoy las ingestas se
   corren a mano con la variable en la línea de comandos.
3. **Registro de la corrida.** `proveedores-sancionados` ya tiene `ingestion_log` (RCC-01/02, con
   endpoint `/api/meta/freshness`) — ese es el patrón a replicar en las apps que se agreguen al
   cron, para que "¿cuándo corrió por última vez?" sea una consulta, no una suposición.
4. **Qué pasa si falla.** GitHub Actions notifica por correo a quien tenga "Watch" en el repo
   cuando un workflow falla — suficiente para v1, pero decisión del usuario si eso basta o si hace
   falta algo más (Slack, PagerDuty). RCC-12 ("alerta si la ingesta no corre en 48h") necesitaría
   además un chequeo activo (ej. un segundo workflow que lea `ingestion_log`/`raw_*_batches` y
   falle si el `MAX(created_at)` es demasiado viejo), no solo depender de que el cron se dispare.

## Candidatos para la primera corrida programada (no todos a la vez)

| App | Conector | ¿Idempotente hoy? | Frecuencia sugerida |
|---|---|---|---|
| `proveedores-sancionados` | `sanciones-connector.ts` | Sí (tiene `ingestion_log`) | Semanal |
| `seguridad-ciudadana` | SIDPOL | No verificado en esta sesión — confirmar antes de activar | Mensual |
| `osinergmin-combustibles` | `precios-combustibles-connector.ts` | Sí sería seguro agregar `ON CONFLICT`, hoy solo hace `INSERT` sin dedupe — ver nota de la sesión 2026-10-01/02 | Diario (la fuente se actualiza a diario) |

**Recomendación:** empezar con UNA sola app en un workflow con `workflow_dispatch` (disparo manual
desde la UI) antes de agregar `schedule:`, para verificar que corre limpio en el entorno de
Actions (dependencias, timeouts, secrets) sin esperar a que el cron dispare solo.
