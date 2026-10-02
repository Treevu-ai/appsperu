"""Dashboard de Radar de Captura Contractual (RCC-16 a RCC-19).

Consume `GET /api/radar` de `proveedores-sancionados` (puerto 4008 en local).
No recalcula nada -- toda la lógica de cruce, vigencia de sanciones y
deduplicación de montos vive en el endpoint (ver routes/radar.ts); este
dashboard solo visualiza esa respuesta.

RCC-16 Scaffold -- este archivo.
RCC-17 Tabla interactiva -- st.dataframe con column_config (no se usa AG Grid:
  el backlog lo proponía como opción, pero st.dataframe nativo ya cubre
  ordenamiento/formato de columnas sin una dependencia externa).
RCC-18 Filtros -- ventana de días para "nuevos", búsqueda por RUC/proveedor.
RCC-19 Indicador de frescura -- sección dedicada con el campo `frescura` del
  propio endpoint (ingestión de proveedores-sancionados y de compras-publicas
  por separado, cada una con sus días sin actualizar).
"""

from __future__ import annotations

import os
from datetime import datetime

import pandas as pd
import requests
import streamlit as st

st.set_page_config(
    page_title="Radar de Captura Contractual",
    page_icon=":material/radar:",
    layout="wide",
)

DEFAULT_API_BASE = os.environ.get("RADAR_API_BASE", "http://localhost:4008")

# Umbrales de frescura en días -- ilustrativos, no vienen de ningún PRD; se
# documentan en el propio badge para que no se confundan con una regla oficial.
FRESCURA_OK_DIAS = 2
FRESCURA_ALERTA_DIAS = 7


@st.cache_data(ttl="2m", show_spinner="Consultando /api/radar...")
def load_radar(api_base: str, ventana_dias: int) -> dict:
    """Llama a GET /api/radar. Cache corto (2 min) porque el endpoint mismo
    ya resume datos que cambian poco a poco (sanciones/contratos), no hace
    falta pegarle en cada rerun de un widget."""
    url = f"{api_base}/api/radar"
    res = requests.get(url, params={"ventanaDiasNuevos": ventana_dias}, timeout=15)
    res.raise_for_status()
    return res.json()


def badge_frescura(dias: int | None) -> str:
    if dias is None:
        return ":gray-badge[sin dato]"
    if dias <= FRESCURA_OK_DIAS:
        return f":green-badge[hace {dias} día(s)]"
    if dias <= FRESCURA_ALERTA_DIAS:
        return f":orange-badge[hace {dias} día(s)]"
    return f":red-badge[hace {dias} día(s)]"


def fmt_soles(monto: float | None) -> str:
    if monto is None:
        return "—"
    return f"S/ {monto:,.0f}"


# =============================================================================
# Sidebar -- conexión y filtros (RCC-18)
# =============================================================================

with st.sidebar:
    st.markdown("### Conexión")
    api_base = st.text_input(
        "URL base de la API",
        value=DEFAULT_API_BASE,
        help="proveedores-sancionados corre por defecto en el puerto 4008.",
    )

    st.markdown("### Filtros")
    ventana_dias = st.slider(
        "Ventana de días para \"nuevos\"",
        min_value=1,
        max_value=90,
        value=7,
        help="Mismo parámetro que ventanaDiasNuevos del endpoint -- contratos "
        "detectados por primera vez dentro de esta ventana.",
    )
    busqueda = st.text_input(
        "Buscar por RUC o nombre de proveedor/entidad",
        placeholder="ej. 20600... o ACOPAGRO",
    )

try:
    data = load_radar(api_base, ventana_dias)
except requests.exceptions.RequestException as exc:
    st.error(
        f":material/error: No se pudo conectar a `{api_base}/api/radar`.\n\n"
        f"¿Está corriendo la API de proveedores-sancionados? "
        f"(`npm run dev` en `apps/proveedores-sancionados/api`, puerto 4008)\n\n"
        f"Detalle: {exc}"
    )
    st.stop()

resumen = data["resumen"]
frescura = data["frescura"]
alertas = data["alertas"]

# =============================================================================
# Encabezado
# =============================================================================

st.markdown("# :material/radar: Radar de Captura Contractual")
st.caption(
    "Cruce de proveedores con inhabilitación vigente (TCE/OSCE) contra "
    "contrataciones públicas nacionales (OCDS/SEACE)."
)

generado_en = datetime.fromisoformat(data["generadoEn"].replace("Z", "+00:00"))
st.caption(f"Datos generados por la API: {generado_en.strftime('%Y-%m-%d %H:%M:%S UTC')}")

# =============================================================================
# RCC-19 -- Indicador de frescura
# =============================================================================

with st.container(border=True):
    st.markdown("**:material/schedule: Frescura de los datos fuente**")
    col1, col2 = st.columns(2)
    with col1:
        ps = frescura["proveedoresSancionados"]
        st.markdown(
            f"Última ingesta de sanciones (TCE/OSCE): {badge_frescura(ps['diasSinActualizar'])}"
        )
        if ps["filasIngeridas"] is not None:
            st.caption(f"{ps['filasIngeridas']:,} filas en la última corrida.")
    with col2:
        cp = frescura["comprasPublicas"]
        st.markdown(
            f"Última ingesta de compras públicas (OCDS/SEACE): {badge_frescura(cp['diasSinActualizar'])}"
        )
    st.caption(
        "No hay scheduler automático todavía (ver `docs/BACKLOG_Scheduler_Ingesta_Diseno_v1.md`) -- "
        "estos valores reflejan la última corrida manual de cada conector."
    )

# =============================================================================
# KPIs
# =============================================================================

with st.container(horizontal=True):
    st.metric(
        "Monto total en contratos (PEN)",
        fmt_soles(resumen["totalContratosMonto"]),
        border=True,
        help="Cuenta cada contrato una sola vez, incluso si lo comparten varios proveedores sancionados.",
    )
    st.metric("Proveedores sancionados con contratos", resumen["totalProveedores"], border=True)
    st.metric(
        "Doble inhabilitación vigente (admin + judicial)",
        resumen["proveedoresDobleInhabilitacion"],
        border=True,
    )
    st.metric(
        f"Nuevos en los últimos {resumen['ventanaDiasNuevos']} días",
        resumen["nuevosDesdeUltimaCorrida"],
        border=True,
        help="Depende de que GET /api/crossref?soloNuevos= se haya corrido en esta ventana -- "
        "0 puede significar 'sin novedades' o 'nadie corrió la detección todavía'.",
    )

if resumen["contratosConMontoDesconocido"] or resumen["contratosEnOtraMoneda"]:
    with st.expander(
        f":material/info: {resumen['contratosConMontoDesconocido']} contrato(s) sin monto conocido, "
        f"{resumen['contratosEnOtraMoneda']} en otra moneda (excluidos del total en soles)"
    ):
        if resumen["montoPorOtraMoneda"]:
            st.markdown("**Montos en otras monedas (no convertidos):**")
            for moneda, monto in resumen["montoPorOtraMoneda"].items():
                st.markdown(f"- {moneda}: {monto:,.2f}")

# =============================================================================
# RCC-17 -- Tablas interactivas: top proveedores / top entidades
# =============================================================================

col1, col2 = st.columns(2)

with col1:
    with st.container(border=True):
        st.markdown("**:material/person: Top 5 proveedores sancionados por monto**")
        df_prov = pd.DataFrame(resumen["top5Proveedores"])
        if busqueda:
            mask = df_prov["ruc"].str.contains(busqueda, case=False, na=False) | df_prov[
                "supplierName"
            ].str.contains(busqueda, case=False, na=False)
            df_prov = df_prov[mask]
        if df_prov.empty:
            st.info("Sin resultados para el filtro actual.")
        else:
            st.dataframe(
                df_prov,
                column_config={
                    "ruc": st.column_config.TextColumn("RUC", width="small"),
                    "supplierName": st.column_config.TextColumn("Proveedor", width="medium"),
                    "montoTotal": st.column_config.NumberColumn(
                        "Monto total (PEN)", format="S/ %.0f"
                    ),
                    "contratos": st.column_config.NumberColumn("N° contratos", format="%d"),
                },
                column_order=["ruc", "supplierName", "montoTotal", "contratos"],
                hide_index=True,
            )

with col2:
    with st.container(border=True):
        st.markdown("**:material/apartment: Top 5 entidades contratantes**")
        df_ent = pd.DataFrame(resumen["top5Entidades"])
        if busqueda:
            df_ent = df_ent[df_ent["buyerName"].str.contains(busqueda, case=False, na=False)]
        if df_ent.empty:
            st.info("Sin resultados para el filtro actual.")
        else:
            st.dataframe(
                df_ent,
                column_config={
                    "buyerName": st.column_config.TextColumn("Entidad", width="medium"),
                    "montoTotal": st.column_config.NumberColumn(
                        "Monto total (PEN)", format="S/ %.0f"
                    ),
                    "contratos": st.column_config.NumberColumn("N° contratos", format="%d"),
                },
                column_order=["buyerName", "montoTotal", "contratos"],
                hide_index=True,
            )

# =============================================================================
# RCC-14/RCC-17/RCC-18 -- Alertas de nuevos contratos
# =============================================================================

with st.container(border=True):
    st.markdown(
        f"**:material/notifications_active: Alertas -- contratos nuevos detectados "
        f"(últimos {resumen['ventanaDiasNuevos']} días)**"
    )

    if not alertas:
        st.success(
            "Sin alertas en esta ventana. Recuerda: esto requiere que "
            "`GET /api/crossref?soloNuevos=` se haya corrido recientemente para "
            "que el flag se actualice -- ver el indicador de frescura arriba."
        )
    else:
        df_alertas = pd.DataFrame(alertas)
        if busqueda:
            mask = (
                df_alertas["ruc"].str.contains(busqueda, case=False, na=False)
                | df_alertas["supplierName"].str.contains(busqueda, case=False, na=False)
                | df_alertas["buyerName"].fillna("").str.contains(busqueda, case=False, na=False)
            )
            df_alertas = df_alertas[mask]

        if df_alertas.empty:
            st.info("Sin alertas para el filtro actual.")
        else:
            st.dataframe(
                df_alertas,
                column_config={
                    "ruc": st.column_config.TextColumn("RUC", width="small"),
                    "supplierName": st.column_config.TextColumn("Proveedor", width="medium"),
                    "buyerName": st.column_config.TextColumn("Entidad", width="medium"),
                    "monto": st.column_config.NumberColumn("Monto", format="%.0f"),
                    "moneda": st.column_config.TextColumn("Moneda", width="small"),
                    "diasDesdeSancion": st.column_config.NumberColumn(
                        "Días desde inicio de sanción", format="%d"
                    ),
                    "diasDesdeDeteccion": st.column_config.NumberColumn(
                        "Días desde detección", format="%d"
                    ),
                },
                column_order=[
                    "ruc",
                    "supplierName",
                    "buyerName",
                    "monto",
                    "moneda",
                    "diasDesdeSancion",
                    "diasDesdeDeteccion",
                ],
                hide_index=True,
            )

st.caption(data["fuente"]["nota"])
