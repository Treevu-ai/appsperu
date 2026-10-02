# Diseño propuesto — Scheduler de ingesta (RCC-10 a RCC-12, SID-14 a SID-16)

**Estado:** PROPUESTA, no implementada ni activada. Ver
`docs/backlog/backlog-rastro-proyectos.md` (Épica 1, Historia 1.4; Épica 2, Historia 2.4).
Configurar un cron real en producción es una decisión operativa (quién lo monitorea, qué pasa si
falla, qué le cuesta a la cuenta de Neon/GitHub) — esto solo deja el diseño listo para que el
usuario decida si lo activa.

## Por qué GitHub Actions y no Cloudflare Cron Triggers

El Worker del MCP (`mcp-server/wrangler.toml`) ya tiene `[triggers] crons = []` como placeholder,
así que la opción "obvia" sería usar un Cron Trigger de Cloudflare.

**Corrección (hallazgo de CodeRabbit en PR #224):** la primera versión de este documento afirmaba
que el runtime de Cloudflare Workers no soporta TCP crudo, usándolo como razón para descartar esa
opción. Es falso — Workers sí admite sockets TCP salientes (API `connect()`) y Cloudflare documenta
explícitamente `node-postgres` (el driver `pg`, el mismo que usan los conectores) vía Hyperdrive.
La razón real para preferir GitHub Actions no es una limitación del runtime, sino el costo de
migración: los conectores ya están escritos contra `pg`/Node tal cual corren hoy a mano. Llevarlos
al Worker significaría adaptar cada uno a Hyperdrive (pooling, límites de conexión del runtime,
posible reescritura si usan APIs de Node que Workers no expone) y configurar un binding de
Hyperdrive por app — trabajo real, no una imposibilidad técnica. Si el usuario prefiere esa ruta
más adelante, es viable; este documento prioriza la opción de menor cambio para una v1.

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
      # Si falla, GitHub ya notifica por correo al usuario asociado al workflow
      # (quien hizo el commit/push que lo disparó) si tiene activadas las
      # notificaciones de fallo -- no depende de "Watch" al repo, no hace
      # falta un paso extra de alerta para la v1.
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
4. **Qué pasa si falla.** GitHub Actions notifica por correo al usuario asociado al workflow (quien
   disparó la ejecución, ej. el autor del commit/push) si tiene habilitadas las notificaciones de
   fallo de Actions en su cuenta — no es una notificación genérica a todos los que tengan "Watch"
   en el repo (hallazgo de CodeRabbit en PR #224, corregido). Suficiente para v1, pero decisión del
   usuario si eso basta o si hace falta algo más (Slack, PagerDuty). RCC-12 ("alerta si la ingesta
   no corre en 48h") necesitaría
   además un chequeo activo (ej. un segundo workflow que lea `ingestion_log`/`raw_*_batches` y
   falle si el `MAX(created_at)` es demasiado viejo), no solo depender de que el cron se dispare.

## Candidatos para la primera corrida programada (no todos a la vez)

| App | Conector | ¿Idempotente hoy? | Frecuencia sugerida |
|---|---|---|---|
| `proveedores-sancionados` | `sanciones-connector.ts` | Sí (tiene `ingestion_log`) | Semanal |
| `seguridad-ciudadana` | SIDPOL | No verificado en esta sesión — confirmar antes de activar | Mensual |
| `osinergmin-combustibles` | `precios-combustibles-connector.ts` | Sí (idempotencia por checksum agregada en PR #223, 2026-10-02) | Diario (la fuente se actualiza a diario) |

**Recomendación:** empezar con UNA sola app en un workflow con `workflow_dispatch` (disparo manual
desde la UI) antes de agregar `schedule:`, para verificar que corre limpio en el entorno de
Actions (dependencias, timeouts, secrets) sin esperar a que el cron dispare solo.
