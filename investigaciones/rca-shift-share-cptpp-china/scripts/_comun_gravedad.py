"""
Módulo común para los análisis avanzados del proyecto WGI (Perú / CPTPP-China).

Centraliza la carga y construcción del panel de gravedad para evitar duplicar
lógica entre los scripts 20-26. Todas las rutas son relativas a scripts/.

Convención de rezago: para explicar las exportaciones del año t se usa la
gobernanza del año t-`rezago` (rezago=1 por defecto), replicando 16_modelo_gravedad.py.
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw"
PROCESSED = Path(__file__).parent / ".." / "data" / "processed"
RESULTADOS = Path(__file__).parent / ".." / "results_avanzados"
RESULTADOS.mkdir(exist_ok=True)

DIMENSIONES = {
    "GOV_WGI_CC.EST": "control_corrupcion",
    "GOV_WGI_GE.EST": "efectividad_gubernamental",
    "GOV_WGI_PV.EST": "estabilidad_politica",
    "GOV_WGI_RL.EST": "estado_derecho",
    "GOV_WGI_RQ.EST": "calidad_regulatoria",
    "GOV_WGI_VA.EST": "voz_rendicion_cuentas",
}

# Socios del CPTPP presentes en el panel (sin China ni Reino Unido).
CPTPP = {"AUS", "BRN", "CAN", "CHL", "JPN", "MYS", "MEX", "NZL", "SGP", "VNM"}


def cargar_wdi_wgi() -> pd.DataFrame:
    return pd.read_csv(RAW / "wdi_wgi.csv")


def cargar_wgi_wide(rezago: int = 1, dimensiones: bool = True) -> pd.DataFrame:
    """Gobernanza por iso3 y año, desplazada `rezago` años hacia adelante para
    empalmar con las exportaciones del año t (WGI de t-rezago)."""
    wdi = cargar_wdi_wgi()
    wgi = wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")].copy()
    if dimensiones:
        wgi["dim"] = wgi["indicador_codigo"].map(DIMENSIONES)
        wide = (
            wgi.pivot_table(index=["pais_iso3", "anio"], columns="dim", values="valor")
            .reset_index()
            .rename(columns={"pais_iso3": "iso3"})
        )
        wide["wgi_promedio"] = wide[list(DIMENSIONES.values())].mean(axis=1)
    else:
        wide = (
            wgi.groupby(["pais_iso3", "anio"])["valor"].mean().rename("wgi_promedio")
            .reset_index().rename(columns={"pais_iso3": "iso3"})
        )
    wide["anio"] = wide["anio"] + rezago
    return wide


def cargar_atributos_pais() -> pd.DataFrame:
    """Región, nivel de ingreso y latitud del Banco Mundial por iso3."""
    raw = json.loads((RAW / "wb_countries_raw.json").read_text(encoding="utf-8"))
    registros = raw[1] if isinstance(raw, list) else raw
    filas = []
    for r in registros:
        iso3 = r.get("id", "")
        region = (r.get("region") or {}).get("id", "")
        if len(iso3) != 3 or region == "Aggregates":
            continue
        try:
            lat = float(r.get("latitude") or "nan")
        except ValueError:
            lat = np.nan
        filas.append({
            "iso3": iso3,
            "region": (r.get("region") or {}).get("value", "").strip(),
            "region_id": region,
            "nivel_ingreso": (r.get("incomeLevel") or {}).get("value", ""),
            "latitud": lat,
        })
    attrs = pd.DataFrame(filas)
    attrs["abs_latitud"] = attrs["latitud"].abs()
    return attrs


def cargar_geodist() -> pd.DataFrame:
    g = pd.read_csv(RAW / "geodist_peru.csv").rename(columns={"iso_d": "iso3"})
    return g[["iso3", "dist", "contig", "comlang_off", "colony"]]


def cargar_exportaciones() -> pd.DataFrame:
    """Exportaciones Perú -> cada socio (positivas)."""
    exp = pd.read_csv(RAW / "baci_peru_todos_socios.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")[
        ["country_code", "country_iso3"]
    ].rename(columns={"country_iso3": "iso3"})
    return exp.merge(codigos, left_on="partner_codigo", right_on="country_code", how="left")


def cargar_fta() -> pd.DataFrame:
    """Acuerdos comerciales (CEPII RTA) Perú <-> socio por año. `rta` = cualquier
    acuerdo; `fta` = acuerdo de libre comercio. Simetrizado (max de ambas direcciones)."""
    with zipfile.ZipFile(RAW / "rta_20260111_csv.zip") as z:
        df = pd.read_csv(z.open("rta_20260111.csv"),
                         usecols=["exporter", "importer", "year", "rta", "fta"])
    peru = df[(df["exporter"] == "PER") | (df["importer"] == "PER")].copy()
    peru["iso3"] = np.where(peru["exporter"] == "PER", peru["importer"], peru["exporter"])
    peru = peru[peru["iso3"] != "PER"]
    agg = peru.groupby(["iso3", "year"])[["rta", "fta"]].max().reset_index()
    return agg.rename(columns={"year": "anio"})


def cargar_gravedad_socios() -> pd.DataFrame:
    """Base socio x año con WDI (PIB, población, etc.) ya pivotado a columnas."""
    wdi = cargar_wdi_wgi()
    ind = {
        "NY.GDP.MKTP.CD": "pib_usd",
        "SP.POP.TOTL": "poblacion",
        "NY.GDP.PCAP.CD": "pib_pc_usd",
        "IT.NET.USER.ZS": "internet_pct",
        "FP.CPI.TOTL.ZG": "inflacion",
        "NE.EXP.GNFS.ZS": "apertura_x",
        "SL.UEM.TOTL.ZS": "desempleo",
        "TM.TAX.MRCH.SM.AR.ZS": "arancel",
    }
    base = wdi[wdi["indicador_codigo"].isin(ind)].copy()
    base["var"] = base["indicador_codigo"].map(ind)
    wide = (
        base.pivot_table(index=["pais_iso3", "anio"], columns="var", values="valor")
        .reset_index().rename(columns={"pais_iso3": "iso3"})
    )
    return wide


def construir_panel(
    rezago: int = 1,
    incluir_ceros: bool = False,
    con_fta: bool = False,
    con_atributos: bool = False,
) -> pd.DataFrame:
    """Construye el panel de gravedad Perú vs. socios.

    incluir_ceros: rejilla balanceada socio x año con v=0 donde BACI no registra
      comercio (margen extensivo). ADVERTENCIA: solo incluye socios que comercian
      al menos un año; no captura socios con cero en todos los años.
    """
    exp = cargar_exportaciones()
    socios = cargar_gravedad_socios()
    wgi = cargar_wgi_wide(rezago=rezago, dimensiones=True)
    geo = cargar_geodist()

    if incluir_ceros:
        anios = range(2016, 2025)
        grid = pd.MultiIndex.from_product(
            [sorted(exp["iso3"].dropna().unique()), list(anios)],
            names=["iso3", "anio"],
        ).to_frame(index=False)
        exp = grid.merge(exp[["iso3", "anio", "v_miles_usd"]], on=["iso3", "anio"], how="left")
        exp["v_miles_usd"] = exp["v_miles_usd"].fillna(0.0)

    df = exp.merge(socios, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi, on=["iso3", "anio"], how="inner")
    df = df.merge(geo, on="iso3", how="inner")

    df = df[(df["pib_usd"] > 0) & (df["dist"] > 0)].copy()
    df["exporta"] = (df["v_miles_usd"] > 0).astype(int)
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_dist"] = np.log(df["dist"])
    # log de exportaciones solo definido para positivos
    with np.errstate(divide="ignore"):
        df["log_exportaciones"] = np.where(df["v_miles_usd"] > 0, np.log(df["v_miles_usd"].clip(lower=1e-6)), np.nan)

    if con_fta:
        df = df.merge(cargar_fta(), on=["iso3", "anio"], how="left")
        df[["rta", "fta"]] = df[["rta", "fta"]].fillna(0).astype(int)
    if con_atributos:
        df = df.merge(cargar_atributos_pais(), on="iso3", how="left")

    return df.reset_index(drop=True)


def panel_positivos(rezago: int = 1, **kw) -> pd.DataFrame:
    """Panel estándar (solo flujos positivos), como el de 16_modelo_gravedad.py."""
    df = construir_panel(rezago=rezago, incluir_ceros=False, **kw)
    return df.dropna(subset=["log_exportaciones", "wgi_promedio"]).reset_index(drop=True)


def guardar_csv(df: pd.DataFrame, nombre: str) -> None:
    df.to_csv(PROCESSED / nombre, index=False)
    print(f"guardado: data/processed/{nombre} ({len(df):,} filas)")


if __name__ == "__main__":
    p = panel_positivos()
    print("panel positivos:", p.shape, "| socios:", p["iso3"].nunique(), "| años:", sorted(p['anio'].unique()))
    pz = construir_panel(incluir_ceros=True, con_fta=True, con_atributos=True)
    print("panel ceros+FTA+attrs:", pz.shape, "| cero exports:", (pz['v_miles_usd'] == 0).sum())
    print("FTA=1:", int(pz['fta'].sum()), "| RTA=1:", int(pz['rta'].sum()))
    print(pz[["iso3", "anio", "v_miles_usd", "wgi_promedio", "fta", "region_id", "latitud"]].head(3).to_string())
    print("regiones:", pz["region_id"].nunique(), "| sin región:", pz["region_id"].isna().sum())
