"""
Pruebas de robustez sobre la Variante A (dep. var normalizada, WGI promedio,
coeficiente -0.0021, p=0.051 — ver README.md):

  C. Estabilidad política sola (la dimensión individual más cercana a
     significancia en la Variante B).
  D. Excluyendo Brunéi (menor volumen de comercio del panel, outlier
     potencial en una variable normalizada por tamaño de mercado).
  E. Sin efectos de tiempo (solo efectos de entidad) — con 9 períodos,
     TimeEffects puede estar absorbiendo variación real.

Uso:
    python 13_panel_robustez.py
"""
from pathlib import Path
import pandas as pd
from linearmodels.panel import PanelOLS

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"

ISO3 = {
    36: "AUS", 96: "BRN", 124: "CAN", 152: "CHL", 156: "CHN", 392: "JPN",
    458: "MYS", 484: "MEX", 554: "NZL", 702: "SGP", 704: "VNM", 826: "GBR",
}


def cargar_base() -> pd.DataFrame:
    panel = pd.read_csv(PROCESSED / "shift_share_panel.csv")
    importaciones = pd.read_csv(RAW / "baci_importaciones_socios_hs2.csv")
    import_totales = (
        importaciones.groupby(["partner_codigo", "anio"])["importaciones_miles_usd"].sum().reset_index()
    )
    import_totales["pais_iso3"] = import_totales["partner_codigo"].map(ISO3)
    df = panel.merge(
        import_totales[["pais_iso3", "anio", "importaciones_miles_usd"]],
        on=["pais_iso3", "anio"], how="left",
    )
    df["competitividad_normalizada"] = df["efecto_competitividad"] / df["importaciones_miles_usd"]
    return df


def cargar_wgi() -> pd.DataFrame:
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wide = wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")].pivot_table(
        index=["pais_iso3", "anio"], columns="indicador_codigo", values="valor"
    ).reset_index()
    wide = wide.rename(columns={
        "GOV_WGI_CC.EST": "control_corrupcion", "GOV_WGI_GE.EST": "efectividad_gubernamental",
        "GOV_WGI_PV.EST": "estabilidad_politica", "GOV_WGI_RL.EST": "estado_derecho",
        "GOV_WGI_RQ.EST": "calidad_regulatoria", "GOV_WGI_VA.EST": "voz_rendicion_cuentas",
    })
    wide["wgi_promedio"] = wide[[
        "control_corrupcion", "efectividad_gubernamental", "estabilidad_politica",
        "estado_derecho", "calidad_regulatoria", "voz_rendicion_cuentas",
    ]].mean(axis=1)
    wide["anio"] = wide["anio"] + 1
    return wide


def correr(nombre: str, datos: pd.DataFrame, formula: str) -> None:
    print(f"\n{'=' * 70}\n{nombre}\n{'=' * 70}")
    modelo = PanelOLS.from_formula(formula, datos)
    resultado = modelo.fit(cov_type="clustered", cluster_entity=True)
    print(resultado.summary.tables[1])


def main() -> None:
    base = cargar_base()
    wgi = cargar_wgi()
    datos = base.merge(wgi, on=["pais_iso3", "anio"], how="inner").set_index(["pais_iso3", "anio"])
    print(f"Observaciones: {len(datos)}")

    correr(
        "C — Estabilidad política sola",
        datos,
        "competitividad_normalizada ~ estabilidad_politica + EntityEffects + TimeEffects",
    )

    sin_brn = datos[datos.index.get_level_values("pais_iso3") != "BRN"]
    print(f"\n(sin Brunéi: {len(sin_brn)} observaciones)")
    correr(
        "D — WGI promedio, excluyendo Brunéi",
        sin_brn,
        "competitividad_normalizada ~ wgi_promedio + EntityEffects + TimeEffects",
    )

    correr(
        "E — WGI promedio, solo efectos de entidad (sin TimeEffects)",
        datos,
        "competitividad_normalizada ~ wgi_promedio + EntityEffects",
    )


if __name__ == "__main__":
    main()
