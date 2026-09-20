# Data contract — SISMED (Observatorio de Disponibilidad) — fuente descartada

> No hay conector para esta fuente. Este documento existe para dejar registro de por qué, y
> evitar que alguien intente automatizarla de nuevo sin ver este historial primero.

Investigación en vivo: 2026-09-19.

## Qué es

El **Observatorio de Disponibilidad** de SISMED (Sistema Integrado de Suministro de Productos
Farmacéuticos, MINSA/DIGEMID) — un dashboard público que muestra el % de establecimientos de
salud con Disponibilidad de Medicamentos Esenciales (DME) por rango, a nivel nacional y por
región. Enlazado desde `appsalud.minsa.gob.pe/portal_sismed/`.

Datos reales verificados en vivo (corte abril 2026): 8,693 establecimientos públicos, 82.0%
(7,118) con DME > 80%, 16.0% (1,388) entre 60-80%, 2.0% (176) en estado crítico (≤ 60%).
Desglosado por tipo de establecimiento (Hospital: 168, C.S.: 1,900, P.S.: 6,602, Instituto: 12) y
filtrable por región/DIRESA/Red, con serie histórica mensual.

## Por qué no se construyó un conector

1. **El enlace del dashboard es un embed de Power BI** (`app.powerbi.com/view?r=<token>`), no una
   página con datos en el DOM ni un endpoint documentado.
2. **Se confirmó que Power BI sí expone una API real de datos** detrás del embed —
   `wabi-paas-1-scus-api.analysis.windows.net/public/reports/querydata?synchronous=true` —
   confirmado en vivo: la carga inicial del reporte dispara ~20 POST a ese endpoint.
3. **No se pudo capturar un cuerpo de consulta real para replicar.** Se instaló un hook sobre
   `window.fetch` para interceptar esas peticiones, pero:
   - Las 20 peticiones de la carga inicial ya habían ocurrido antes de instalar el hook.
   - Se intentó disparar una petición nueva interactuando con los filtros del reporte (clic en una
     región del listado, clic en el selector de mes) — **ninguna de las dos interacciones generó
     una petición nueva**, sugiriendo que esta vista pública específica tiene la interactividad
     bloqueada o degradada.
4. **El propio dashboard advierte que está desactualizado**: un aviso visible en el reporte dice
   *"Se ha migrado los tableros a un nuevo enlace, consultar en el portal del SISMED para acceder
   a los enlaces activos"*, apuntando a `appsalud.minsa.gob.pe/consolida/login.aspx` — que **exige
   login**. Es decir, el enlace público que sí es navegable podría ser una copia congelada; la
   versión "oficial" vigente ya no tiene garantía de acceso anónimo.

**Decisión**: sin un ejemplo real de la consulta DAX que usa cada visual, armar el `body` del POST
a mano sería adivinar la estructura del modelo semántico — no se hizo. Replicar esta fuente
requeriría, como mínimo, lograr que la interactividad del reporte dispare una consulta nueva
capturable (quizás abriendo la copia con una sesión de navegador distinta, o encontrando el
tablero "nuevo" y evaluando si en algún punto permite acceso anónimo de solo lectura).

## Alternativa usada en su lugar

`cenares-connector.ts` (`apps/servicios-salud/api`) — dataset CSV de CENARES sobre distribución de
medicamentos, sin esta fricción. No mide lo mismo (distribución/despacho, no el indicador DME de
disponibilidad final), pero es la fuente real que sí se pudo ingerir. Ver
`docs/data-contracts/cenares-distribucion.md`.

## Pendiente si alguien retoma esto

1. Verificar si `appsalud.minsa.gob.pe/consolida/login.aspx` permite algún tipo de acceso público
   de solo consulta (sin credenciales), o si es estrictamente para usuarios registrados del
   sistema de salud.
2. Si se logra disparar una consulta nueva del embed de Power BI (ej. cambiando de pestaña dentro
   del reporte, no solo filtros), volver a intentar la captura de red.
3. Evaluar si el Observatorio de Precios de DIGEMID (`observatorio.digemid.minsa.gob.pe/consultasopm/`)
   tiene una arquitectura más simple (no Power BI) que sí permita automatización — no se investigó
   a fondo, solo se identificó como fuente de precio, no de stock.
