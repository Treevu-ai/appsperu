# ADR-0016: Automatización de los conectores núcleo (mef, oece-connector, oece-records) — evaluación (CX-04)

- Estado: Evaluado — sin implementación en esta iteración (ver "Decisión" abajo).
- Fecha: 2026-09-02
- Ámbito: `mef-connector.ts` (radar-ejecucion), `oece-connector.ts` y `oece-records-connector.ts`
  (compras-publicas).
- Origen: [`docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md`](../PRD_Confiabilidad_Conectores_y_Cruces_v1.md)
  §5 CX-04.

## Contexto

`docs/conectores.md` confirma que ninguno de los 21 conectores tiene scheduler hoy — es una
decisión de diseño explícita, no una omisión (búsqueda de `cron`/`schedule`/`setInterval` en
todo el repo sin resultados). `docs/arquitectura/scraping-arquitectura.md` §3.7 ya documenta el
mismo problema para la capa `tools/scrapers/` y propone Cloudflare Workers Cron Triggers como
ruta futura, pero solo para esa capa — no para los conectores de `apps/*/api`.

Este ADR evalúa si automatizar `mef-connector.ts`, `oece-connector.ts` y
`oece-records-connector.ts` (los tres conectores con más cruces dependientes, ver
`docs/conectores.md#mapa-de-cruces-entre-apps`) vale el costo de infraestructura, antes de
asumir que automatizar es siempre la mejora correcta.

## Hallazgo de infraestructura (determinante para la decisión)

Cada app expone su Postgres únicamente en `127.0.0.1:5432` (confirmado en
`apps/radar-ejecucion/api/docker-compose.yml` y equivalentes en el resto de apps) — **las bases
de datos no son alcanzables desde internet**. Esto descarta de entrada la opción más obvia de
automatización (un workflow de GitHub Actions con `schedule:` corriendo en runners de GitHub,
que no tienen ruta de red hacia una base de datos que solo escucha en loopback de la máquina
local del desarrollador). Las opciones reales quedan reducidas a:

1. **Cron/Task Scheduler local** en la máquina donde ya corren las 14 APIs y sus Postgres.
2. **Self-hosted GitHub Actions runner** en esa misma máquina/red — técnicamente equivalente a
   (1) pero con la observabilidad y el historial de ejecuciones de GitHub Actions.
3. **Migrar a una base de datos alcanzable desde internet** (RDS, Neon, Supabase, etc.) y recién
   ahí automatizar con GitHub Actions cloud — cambio de infraestructura mucho mayor, fuera del
   alcance de "automatizar 3 conectores".

## Pregunta 1: ¿qué tan stale puede estar el dato antes de que un cruce sea engañoso?

| Conector | Frecuencia real de la fuente | Riesgo de estar stale |
|---|---|---|
| `mef-connector.ts` | MEF publica corte mensual/diario para 2025-2026 (según `docs/conectores.md`). | **Alto para el caso de uso "vigilancia de gasto en curso"**: un usuario viendo `budget_execution` de hace 2-3 meses sin saberlo puede concluir que una entidad no ejecutó gasto que en realidad ya se registró en el MEF. Los 7 consumidores del cruce (ver ADR-0015) heredan ese riesgo sin ningún aviso visible — no hay endpoint que muestre "última corrida exitosa" hoy. |
| `oece-connector.ts` / `oece-records-connector.ts` | API en vivo del portal OECE, actualizada continuamente. | **Medio**: cada corrida manual trae hasta `DEFAULT_MAX_PAGES=10` páginas recientes, así que el dato nunca es "completo" independientemente de la frecuencia — automatizar reduciría el lag entre publicación y disponibilidad en la plataforma, pero no resuelve la cobertura parcial de fondo (eso es un problema de diseño del conector, no de frecuencia). |

## Pregunta 2: ¿qué costo de infraestructura implica cada opción?

- **Cron local**: costo casi nulo (el `dev-local.sh`/`dev-local.ps1` del repo ya asume que las
  14 APIs corren en la máquina del desarrollador) — pero depende de que esa máquina esté
  encendida y con las APIs levantadas en el momento programado. No hay garantía de disponibilidad
  fuera del horario en que alguien la esté usando activamente.
- **Self-hosted runner**: costo de configuración inicial (registrar el runner, mantenerlo
  actualizado) más el mismo problema de disponibilidad que el cron local — el runner también
  depende de que la máquina esté encendida.
- **DB alcanzable desde internet**: costo recurrente real (hosting de base de datos) y una
  decisión de seguridad/exposición que ningún ticket de este backlog está autorizado a tomar por
  su cuenta — requiere aprobación explícita fuera del alcance de CX-04.

## Decisión

**Evaluado, diferido.** No se implementa automatización en esta iteración. Razones:

1. El bloqueador real no es "falta un cron script" — es que las bases de datos no son
   alcanzables desde ningún runner que no esté en la misma red que la máquina de desarrollo. Un
   cron local no añade garantías reales sobre correr el script a mano (misma dependencia de que
   la máquina esté encendida), y un self-hosted runner agrega complejidad operativa sin resolver
   el problema de disponibilidad.
2. El PRD que originó este ticket (CX-02) ya priorizó la mitigación de mayor impacto para
   `mef-connector.ts` (offsets + monitoreo activo, ver ADR-0015) sin necesitar automatización —
   el monitoreo de deriva de tamaño de archivo funciona igual de bien en una corrida manual que
   en una programada.
3. Automatizar sin resolver primero la disponibilidad de base de datos daría una falsa sensación
   de "esto corre solo", cuando en realidad seguiría fallando en silencio si la máquina está
   apagada — el mismo problema de honestidad de datos que el resto de este PRD busca evitar.

## Recomendación para una futura iteración

Si se decide automatizar más adelante, el orden de prioridad recomendado es:

1. Exponer un endpoint de "última ingesta exitosa" por conector núcleo (fecha, filas
   aceptadas/rechazadas, batch id) — bajo costo, alto valor: hace visible el problema de
   frescura sin automatizar nada todavía.
2. Evaluar migrar la base de datos de al menos `radar-ejecucion` y `compras-publicas` (las dos
   con más cruces dependientes) a un hosting alcanzable desde internet, como parte de una
   decisión de infraestructura más amplia — no como efecto secundario de "automatizar 3
   conectores".
3. Recién ahí, un workflow de GitHub Actions con `schedule:` para `mef-connector.ts`,
   `oece-connector.ts` y `oece-records-connector.ts`, con el `DATABASE_URL` de destino como
   secret de repositorio.

## Referencias

- Ticket: [`docs/TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md#CX-04`](../TICKETS_Confiabilidad_Conectores_y_Cruces_v1.md)
- Mitigación de mayor impacto ya implementada: [ADR-0015](0015-mef-connector-offsets-manuales-decision.md)
- Precedente del mismo problema en otra capa: `docs/arquitectura/scraping-arquitectura.md` §3.7
