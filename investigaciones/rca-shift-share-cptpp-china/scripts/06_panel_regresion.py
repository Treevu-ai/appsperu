"""
Regresión de panel: efecto de las 6 dimensiones de gobernanza (WGI, t-1)
sobre el componente de competitividad real (shift-share), controlando por
tipo de cambio real y PIB per cápita.

ESTADO: scaffold, no ejecutable todavía. Depende de:
  1. ../data/processed/shift_share.csv con panel completo país-año (hoy solo
     Perú; falta repetir el cálculo para cada socio CPTPP+China una vez que
     Comtrade los cubra — ver ../data/raw/README.md).
  2. El paquete `linearmodels` (prueba de Hausman, PanelOLS) — NO está
     instalado en este entorno. `statsmodels` sí está disponible pero no
     trae Hausman ni el manejo de panel no balanceado que linearmodels sí
     tiene. Pedir confirmación antes de `pip install linearmodels`.

Uso previsto (una vez resueltas las dependencias de datos):
    python 06_panel_regresion.py
"""
from pathlib import Path

import pandas as pd

try:
    from linearmodels.panel import PanelOLS, RandomEffects, compare
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Falta el paquete 'linearmodels' (prueba de Hausman + panel no "
        "balanceado). No se instaló automáticamente -- confirmar antes de "
        "`pip install linearmodels`."
    ) from exc

SHIFT_SHARE = Path(__file__).parent / ".." / "data" / "processed" / "shift_share_panel.csv"
WDI_WGI = Path(__file__).parent / ".." / "data" / "raw" / "wdi_wgi.csv"


def main() -> None:
    if not SHIFT_SHARE.exists():
        raise SystemExit(
            f"No existe {SHIFT_SHARE} -- construir primero el panel país-año de "
            "shift-share (ver 05_shift_share.py, hoy solo corre para Perú)."
        )

    panel = pd.read_csv(SHIFT_SHARE)
    wdi = pd.read_csv(WDI_WGI)

    wgi = wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
    wgi_prom = (
        wgi.groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
    )
    wgi_prom["anio"] = wgi_prom["anio"] + 1  # rezago t-1: gobernanza del año anterior

    datos = panel.merge(wgi_prom, on=["pais_iso3", "anio"], how="inner")
    datos = datos.set_index(["pais_iso3", "anio"])

    modelo_fe = PanelOLS.from_formula("efecto_competitividad ~ wgi_promedio + EntityEffects + TimeEffects", datos)
    resultado_fe = modelo_fe.fit(cov_type="clustered", cluster_entity=True)

    modelo_re = RandomEffects.from_formula("efecto_competitividad ~ wgi_promedio", datos)
    resultado_re = modelo_re.fit()

    print(compare({"Efectos fijos": resultado_fe, "Efectos aleatorios": resultado_re}))
    # TODO: prueba de Hausman explícita (linearmodels no la expone directo;
    # comparar manualmente los coeficientes y errores estándar de ambos modelos).


if __name__ == "__main__":
    main()
