"""
Dos variantes de especificación sobre el panel socio x año (ver
06_panel_regresion.py, resultado nulo documentado en README.md):

  A. Variable dependiente normalizada: efecto de competitividad / importaciones
     totales del socio ese año (en vez de niveles en miles de USD, que tienen
     outliers grandes por tamaño de mercado — China vs. Brunéi).
  B. Las 6 dimensiones WGI por separado (rezagadas 1 año) en vez de su
     promedio, en el mismo modelo de efectos fijos.

Entradas:
  ../data/processed/shift_share_panel.csv
  ../data/raw/baci_importaciones_socios_hs2.csv
  ../data/raw/wdi_wgi.csv

Uso:
    python 12_panel_regresion_refinado.py
"""
from pathlib import Path
import pandas as pd
from linearmodels.panel import PanelOLS

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"

DIMENSIONES_WGI = {
    "GOV_WGI_CC.EST": "control_corrupcion",
    "GOV_WGI_GE.EST": "efectividad_gubernamental",
    "GOV_WGI_PV.EST": "estabilidad_politica",
    "GOV_WGI_RL.EST": "estado_derecho",
    "GOV_WGI_RQ.EST": "calidad_regulatoria",
    "GOV_WGI_VA.EST": "voz_rendicion_cuentas",
}


def cargar_base() -> pd.DataFrame:
    panel = pd.read_csv(PROCESSED / "shift_share_panel.csv")
    importaciones = pd.read_csv(RAW / "baci_importaciones_socios_hs2.csv")
    import_totales = (
        importaciones.groupby(["partner_codigo", "anio"])["importaciones_miles_usd"]
        .sum()
        .reset_index()
    )
    # mapear partner_codigo -> iso3 vía el propio panel (ya tiene pais_iso3 por socio)
    # usamos el nombre tal como viene en importaciones (partner_nombre) para unir por nombre sería frágil;
    # en vez de eso reconstruimos el mapeo numérico -> iso3 igual que en 11_shift_share_panel_bilateral.py
    ISO3 = {
        36: "AUS", 96: "BRN", 124: "CAN", 152: "CHL", 156: "CHN", 392: "JPN",
        458: "MYS", 484: "MEX", 554: "NZL", 702: "SGP", 704: "VNM", 826: "GBR",
    }
    import_totales["pais_iso3"] = import_totales["partner_codigo"].map(ISO3)

    df = panel.merge(
        import_totales[["pais_iso3", "anio", "importaciones_miles_usd"]],
        on=["pais_iso3", "anio"], how="left",
    )
    df["competitividad_normalizada"] = df["efecto_competitividad"] / df["importaciones_miles_usd"]
    return df


def cargar_wgi_dimensiones() -> pd.DataFrame:
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wgi = wdi[wdi["indicador_codigo"].isin(DIMENSIONES_WGI.keys())].copy()
    wgi["dimension"] = wgi["indicador_codigo"].map(DIMENSIONES_WGI)
    wide = wgi.pivot_table(index=["pais_iso3", "anio"], columns="dimension", values="valor").reset_index()
    wide["anio"] = wide["anio"] + 1  # rezago t-1
    return wide


def main() -> None:
    base = cargar_base()
    wgi_dim = cargar_wgi_dimensiones()

    datos = base.merge(wgi_dim, on=["pais_iso3", "anio"], how="inner").set_index(["pais_iso3", "anio"])
    print(f"Observaciones tras fusión: {len(datos)}\n")

    print("=" * 70)
    print("VARIANTE A — variable dependiente normalizada (% de importaciones del socio)")
    print("=" * 70)
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wgi_prom = (
        wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
        .groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
    )
    wgi_prom["anio"] = wgi_prom["anio"] + 1
    datos_a = base.merge(wgi_prom, on=["pais_iso3", "anio"], how="inner").set_index(["pais_iso3", "anio"])
    modelo_a = PanelOLS.from_formula(
        "competitividad_normalizada ~ wgi_promedio + EntityEffects + TimeEffects", datos_a
    )
    resultado_a = modelo_a.fit(cov_type="clustered", cluster_entity=True)
    print(resultado_a)

    print("\n" + "=" * 70)
    print("VARIANTE B — las 6 dimensiones WGI por separado (dep. var normalizada)")
    print("=" * 70)
    formula_b = (
        "competitividad_normalizada ~ control_corrupcion + efectividad_gubernamental + "
        "estabilidad_politica + estado_derecho + calidad_regulatoria + voz_rendicion_cuentas + "
        "EntityEffects + TimeEffects"
    )
    modelo_b = PanelOLS.from_formula(formula_b, datos)
    resultado_b = modelo_b.fit(cov_type="clustered", cluster_entity=True)
    print(resultado_b)


if __name__ == "__main__":
    main()
