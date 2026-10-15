"""
Tres chequeos de endogeneidad sobre el hallazgo de la Variante A/C
(WGI rezagado -> competitividad normalizada, signo negativo, ver README.md).
Con N=12 países, IV/GMM dinámico no son confiables (small-N panel) — estos
tres chequeos son lo que SÍ se puede hacer honestamente con este tamaño de
muestra.

  F. Precedencia inversa: ¿la competitividad de hoy predice la gobernanza de
     mañana? (swap de la dirección de la regresión)
  G. Rezago t-2 en vez de t-1 (¿el efecto sobrevive a un rezago más largo?)
  H. Primeras diferencias (elimina cualquier confusor fijo por país no
     capturado del todo por EntityEffects)

Uso:
    python 14_endogeneidad.py
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


def cargar_wgi_sin_rezago() -> pd.DataFrame:
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wgi = wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
    prom = wgi.groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio").reset_index()
    return prom


def main() -> None:
    base = cargar_base()
    wgi = cargar_wgi_sin_rezago()

    # F — precedencia inversa: competitividad(t) -> wgi(t+1)
    print("=" * 70)
    print("F — Precedencia inversa: ¿competitividad(t) predice WGI(t+1)?")
    print("=" * 70)
    wgi_futuro = wgi.copy()
    wgi_futuro["anio"] = wgi_futuro["anio"] - 1  # wgi(t+1) alineado con fila t
    datos_f = base.merge(wgi_futuro, on=["pais_iso3", "anio"], how="inner").set_index(["pais_iso3", "anio"])
    modelo_f = PanelOLS.from_formula(
        "wgi_promedio ~ competitividad_normalizada + EntityEffects + TimeEffects", datos_f
    )
    print(modelo_f.fit(cov_type="clustered", cluster_entity=True).summary.tables[1])

    # G — rezago t-2
    print("\n" + "=" * 70)
    print("G — WGI rezagado 2 años (en vez de 1)")
    print("=" * 70)
    wgi_t2 = wgi.copy()
    wgi_t2["anio"] = wgi_t2["anio"] + 2
    datos_g = base.merge(wgi_t2, on=["pais_iso3", "anio"], how="inner").set_index(["pais_iso3", "anio"])
    print(f"(observaciones: {len(datos_g)})")
    modelo_g = PanelOLS.from_formula(
        "competitividad_normalizada ~ wgi_promedio + EntityEffects + TimeEffects", datos_g
    )
    print(modelo_g.fit(cov_type="clustered", cluster_entity=True).summary.tables[1])

    # H — primeras diferencias
    print("\n" + "=" * 70)
    print("H — Primeras diferencias (Δcompetitividad ~ ΔWGI rezagado)")
    print("=" * 70)
    wgi_t1 = wgi.copy()
    wgi_t1["anio"] = wgi_t1["anio"] + 1
    datos_h = base.merge(wgi_t1, on=["pais_iso3", "anio"], how="inner").sort_values(["pais_iso3", "anio"])
    datos_h["d_competitividad"] = datos_h.groupby("pais_iso3")["competitividad_normalizada"].diff()
    datos_h["d_wgi"] = datos_h.groupby("pais_iso3")["wgi_promedio"].diff()
    datos_h = datos_h.dropna(subset=["d_competitividad", "d_wgi"])
    print(f"(observaciones: {len(datos_h)})")
    import statsmodels.formula.api as smf
    modelo_h = smf.ols("d_competitividad ~ d_wgi", data=datos_h).fit(
        cov_type="cluster", cov_kwds={"groups": datos_h["pais_iso3"]}
    )
    print(modelo_h.summary().tables[1])


if __name__ == "__main__":
    main()
