# Dashboard — Radar de Captura Contractual

Dashboard Streamlit sobre `GET /api/radar` (`apps/proveedores-sancionados/api`).
Cierra la Historia 1.6 del backlog (`RCC-16` a `RCC-19`, ver
`docs/backlog/backlog-rastro-proyectos.md`).

No recalcula nada: toda la lógica de cruce, vigencia de sanciones y
deduplicación de montos vive en el endpoint. Este dashboard solo visualiza
esa respuesta.

## Correr

1. Levantar la API (si no está corriendo):
   ```bash
   cd apps/proveedores-sancionados/api
   npm run dev
   ```
2. Instalar dependencias del dashboard (un entorno separado, no comparte
   `node_modules` con la API):
   ```bash
   cd apps/proveedores-sancionados/dashboard
   pip install -r requirements.txt
   ```
3. Correr el dashboard:
   ```bash
   streamlit run streamlit_app.py
   ```

Por defecto apunta a `http://localhost:4008`. Para apuntar a otro entorno,
usar la variable `RADAR_API_BASE` o cambiar la URL en el sidebar de la app:

```bash
RADAR_API_BASE=https://api.rastro.fyi streamlit run streamlit_app.py
```

## Qué muestra

- **Frescura** (RCC-19): última ingesta de proveedores-sancionados y de
  compras-publicas por separado, con badge de color (umbrales ilustrativos,
  no normativos: ≤2 días = ok, ≤7 = alerta, más = atención).
- **KPIs**: monto total en contratos (PEN, deduplicado), proveedores con
  contratos, doble inhabilitación vigente, nuevos contratos detectados en la
  ventana elegida.
- **Top 5 proveedores / Top 5 entidades** por monto, con filtro de búsqueda
  por RUC o nombre.
- **Alertas**: contratos nuevos detectados (`RCC-14`), con días desde que la
  sanción empezó a regir y días desde la detección.

## Limitación conocida

`nuevosDesdeUltimaCorrida`/alertas dependen de que alguien haya corrido
`GET /api/crossref?soloNuevos=` recientemente — no hay scheduler automático
todavía (`RCC-10/11/12`, diseño en
`docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md`, no activado). Si no se ha
corrido en la ventana elegida, el dashboard puede mostrar 0 alertas aunque
existan sanciones nuevas sin detectar — eso es "nadie corrió la detección",
no "no hay novedades".
