# Scraper del directorio PROMPERÚ (Power BI público) — estado: incompleto, bloqueado

Objetivo: extraer el directorio real de empresas exportadoras peruanas 2023-2025
(15,390 empresas, con RUC, razón social, web, sector productivo, región y FOB por
año) publicado por PROMPERÚ como un reporte Power BI público embebido
(`rebrand.ly/emp_exp_pub` → `app.powerbi.com/view?r=...`), para reemplazar el panel
sesgado de `padron-exportadores-candidatos-seed.json` (13,366 RUC, sesgado hacia
proveedores del Estado y agroexportadores).

## Qué se intentó y qué funcionó

1. **Replicar la API de Power BI directamente** (sesión 2026-10-15): bloqueado.
   La petición `POST .../public/reports/querydata?synchronous=true` requiere un
   header de autorización (tipo `X-PowerBI-ResourceKey`) que el bundle de Power BI
   agrega internamente antes de que cualquier parche a `fetch`/`XMLHttpRequest`
   pueda interceptarlo. No se resolvió.

2. **Raspar el DOM vía scroll** (esta sesión, 2026-10-18): la tabla es un grid
   virtualizado (`div.innerContainer div[role="row"]`) — solo ~27-29 filas existen
   en el DOM a la vez, las demás no están renderizadas hasta que se desplaza hasta
   ellas. Confirmado que un **clic real en una celda + tecla `PageDown`** (no
   flechas, no `scrollTop`, no eventos `wheel` sintéticos — Power BI los ignora
   por no ser "trusted") avanza la tabla de forma fiable, ~7 filas por ciclo, en
   una sesión de navegador real (extensión Claude in Chrome): se extrajeron y
   verificaron ~190 filas reales con el esquema completo antes de perderse por no
   haberlas persistido a disco a tiempo.

3. **Automatizar lo anterior con Playwright (headless y headed)** — no funcionó
   de forma confiable:
   - Headless: el renderer crashea (`Page crashed` / `Target crashed`) en los
     primeros ~40 ciclos, probablemente por acumulación de un popup de
     "quick insights" (gráfico de barras) que Power BI muestra en cada clic sobre
     una celda de fila, y que en modo headless parece no liberar memoria GPU/canvas
     correctamente.
   - Headed: no crashea tan rápido, pero el foco de teclado se pierde de forma
     intermitente — `page.keyboard.press('PageDown')` deja de tener efecto tras
     unos ciclos aunque el clic previo se haya ejecutado sin error, y la tabla deja
     de avanzar (`stall` se dispara) sin un patrón claro. Se probaron: clic en cada
     ciclo, clic solo una vez al inicio, `.focus()` programático sin clic (no
     reproduce el estado de "celda seleccionada" interno de Power BI, por lo que
     `PageDown` queda sin efecto), y tecla `Escape` tras cada clic para cerrar el
     popup de insights antes de que se acumule.
   - `scrape.js` en este directorio es el script resultante (con reinicio
     automático del navegador tras `MAX_STALL_ITERATIONS` sin crecimiento) —
     **funcional pero no confiable para completar las 15,390 filas sin supervisión**.

## Por qué importa resolverlo

Desbloquea directamente 4 de las 5 líneas de investigación identificadas para
Oscar Malca (ver memoria `project_rastro_propuestas_investigacion_malca`), todas
las cuales dependen de un panel poblacional real de exportadores por RUC, no del
panel sesgado actual (13,366 candidatos vía Aduanet/proveedores sancionados).

## Próximo paso recomendado (no iniciado)

Diagnosticar por qué el foco de teclado de Playwright se comporta distinto al de
una ventana de Chrome real controlada por la extensión — posiblemente relacionado
con que el contexto de automatización de Playwright no obtiene foco real de
ventana a nivel de sistema operativo en Windows. Alternativas a evaluar antes de
reintentar: (a) usar `xdotool`/`nut.js` o una librería de automatización a nivel
de SO en vez de `page.keyboard`, para simular el `PageDown` como si viniera del
teclado físico; (b) investigar si el popup de "quick insights" se puede
deshabilitar vía algún parámetro de URL del reporte público; (c) retomar el
intento de capturar el payload real de `querydata` ahora que se confirmó que el
endpoint SÍ se vuelve a llamar en cada scroll (no todo está precargado como se
asumió en la sesión 2026-10-15) — interceptar esas respuestas via CDP
(`Network.getResponseBody`, no parche de `fetch`) podría ser más robusto que
parchear `fetch`/`XMLHttpRequest` desde JS de página.
