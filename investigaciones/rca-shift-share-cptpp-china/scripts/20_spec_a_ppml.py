"""Spec A. PPML de las exportaciones de Perú hacia el destino j.

El WGI del Perú no varía entre destinos, así que esta ecuación no identifica
las instituciones peruanas. El coeficiente es la asociación entre la
gobernanza del destino y las exportaciones hacia ese destino. Los efectos
de año no son efectos importador-año: con un solo exportador no controlan
la resistencia multilateral.

La reproducción OLS en logaritmos sigue el script 16 y tiene que devolver
el coeficiente ya publicado (0,667) antes de informar cualquier PPML.

Uso:
    python 20_spec_a_ppml.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from sklearn.decomposition import PCA

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
PROCESSED = Path(__file__).resolve().parent.parent / "data" / "processed"
RESULTS = Path(__file__).resolve().parent.parent / "results"
RTA_CSV = RAW / "rta_larch" / "rta_20260111.csv"

ANIOS = list(range(2016, 2025))
DIMENSIONES = {
    "GOV_WGI_CC.EST": "wgi_cc",
    "GOV_WGI_GE.EST": "wgi_ge",
    "GOV_WGI_PV.EST": "wgi_pv",
    "GOV_WGI_RL.EST": "wgi_rl",
    "GOV_WGI_RQ.EST": "wgi_rq",
    "GOV_WGI_VA.EST": "wgi_va",
}
FORMULA_BASE = (
    "v_miles_usd ~ wgi_rezago + log_pib + log_dist + contig + comlang_off + colony + C(anio)"
)
FORMULA_PC = FORMULA_BASE + " + log_pib_pc"
FORMULA_COMPLETA = FORMULA_PC + " + rta"
OLS_COEF_PUBLICADO = 0.667
OLS_N_PUBLICADO = 1496


def _anios_comercio(wgi_anio: pd.Series, rezago: int) -> pd.Series:
    return wgi_anio + rezago


def cargar_wgi(wdi: pd.DataFrame) -> pd.DataFrame:
    """WGI en el año de la medición, no rezagado. Seis estimaciones .EST."""
    codigos = sorted(wdi.loc[wdi["indicador_codigo"].str.startswith("GOV_WGI_"), "indicador_codigo"].unique())
    print("Códigos WGI en el archivo:", codigos)
    extra = [c for c in codigos if c not in DIMENSIONES]
    if extra:
        raise SystemExit(f"Hay códigos WGI no previstos y el promedio del script 16 los incluiría: {extra}")
    ancho = (
        wdi[wdi["indicador_codigo"].isin(DIMENSIONES)]
        .pivot_table(index=["pais_iso3", "anio"], columns="indicador_codigo", values="valor", aggfunc="mean")
        .reset_index()
        .rename(columns={"pais_iso3": "iso3", **DIMENSIONES})
    )
    cols = list(DIMENSIONES.values())
    ancho["wgi_promedio"] = ancho[cols].mean(axis=1)
    return ancho


def cargar_rta_peru() -> pd.DataFrame:
    """Dummy rta de Larch (esencial, 11 ene 2026), solo Perú como exportador."""
    piezas = []
    for bloque in pd.read_csv(
        RTA_CSV, usecols=["exporter", "importer", "year", "rta"], chunksize=400_000
    ):
        peru = bloque[(bloque["exporter"] == "PER") & (bloque["year"].isin(ANIOS))]
        if not peru.empty:
            piezas.append(peru)
    rta = pd.concat(piezas, ignore_index=True)
    duplicados = int(rta.duplicated(["importer", "year"]).sum())
    if duplicados:
        print(f"Filas RTA duplicadas Perú-destino-año: {duplicados}; se conserva el máximo.")
        rta = rta.groupby(["importer", "year"], as_index=False)["rta"].max()
    rta = rta.rename(columns={"importer": "iso3", "year": "anio"})
    return rta[["iso3", "anio", "rta"]]


def serie_macro(wdi: pd.DataFrame, codigo: str, nombre: str) -> pd.DataFrame:
    return (
        wdi.loc[wdi["indicador_codigo"] == codigo, ["pais_iso3", "anio", "valor"]]
        .rename(columns={"pais_iso3": "iso3", "valor": nombre})
        .drop_duplicates(["iso3", "anio"])
    )


def reproducir_ols(exportaciones: pd.DataFrame, codigos: pd.DataFrame, geodist: pd.DataFrame, wdi: pd.DataFrame):
    """Copia el diseño del script 16. Sirve de control, no de especificación nueva."""
    flujos = exportaciones.merge(
        codigos[["country_code", "country_iso3"]],
        left_on="partner_codigo",
        right_on="country_code",
        how="left",
    ).rename(columns={"country_iso3": "iso3"})
    pib = serie_macro(wdi, "NY.GDP.MKTP.CD", "pib_usd")
    wgi = (
        wdi[wdi["indicador_codigo"].str.startswith("GOV_WGI_")]
        .groupby(["pais_iso3", "anio"])["valor"]
        .mean()
        .rename("wgi_promedio")
        .reset_index()
        .rename(columns={"pais_iso3": "iso3"})
    )
    wgi["anio"] = _anios_comercio(wgi["anio"], 1)
    df = flujos.merge(pib, on=["iso3", "anio"], how="inner")
    df = df.merge(wgi, on=["iso3", "anio"], how="inner")
    df = df.merge(
        geodist.rename(columns={"iso_d": "iso3"})[["iso3", "dist", "contig", "comlang_off", "colony"]],
        on="iso3",
        how="inner",
    )
    df = df[(df["v_miles_usd"] > 0) & (df["pib_usd"] > 0) & (df["dist"] > 0)].copy()
    df["log_exportaciones"] = np.log(df["v_miles_usd"])
    df["log_pib"] = np.log(df["pib_usd"])
    df["log_dist"] = np.log(df["dist"])
    df = df.dropna(
        subset=["log_exportaciones", "log_pib", "log_dist", "wgi_promedio", "contig", "comlang_off", "colony", "anio", "iso3"]
    ).reset_index(drop=True)
    formula = (
        "log_exportaciones ~ log_pib + log_dist + wgi_promedio + contig + comlang_off + colony + C(anio)"
    )
    modelo = smf.ols(formula, data=df).fit(cov_type="cluster", cov_kwds={"groups": df["iso3"].to_numpy()})
    return df, modelo


def universo(codigos: pd.DataFrame, geodist: pd.DataFrame) -> list[str]:
    bac = set(codigos["country_iso3"].dropna())
    geo = set(geodist.loc[geodist["iso_o"] == "PER", "iso_d"].dropna())
    return sorted((bac & geo) - {"PER"})


def panel_rectangular(
    exportaciones: pd.DataFrame,
    codigos: pd.DataFrame,
    geodist: pd.DataFrame,
    wdi: pd.DataFrame,
    rta: pd.DataFrame,
    socios: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Socios del universo × 2016–2024. El flujo ausente es cero. La covariable ausente no."""
    flujos = exportaciones.merge(
        codigos[["country_code", "country_iso3"]],
        left_on="partner_codigo",
        right_on="country_code",
        how="left",
    ).rename(columns={"country_iso3": "iso3"})
    flujos_ventana = flujos[flujos["anio"].isin(ANIOS)].copy()
    positivos = flujos_ventana.groupby(["iso3", "anio"], as_index=False)["v_miles_usd"].sum()

    base = pd.MultiIndex.from_product([socios, ANIOS], names=["iso3", "anio"]).to_frame(index=False)
    panel = base.merge(positivos, on=["iso3", "anio"], how="left")
    panel["flujo_observado"] = panel["v_miles_usd"].notna()
    panel["v_miles_usd"] = panel["v_miles_usd"].fillna(0.0)
    panel["cero_estructural"] = ~panel["flujo_observado"]

    geo = geodist.loc[geodist["iso_o"] == "PER", ["iso_d", "dist", "contig", "comlang_off", "colony"]].rename(
        columns={"iso_d": "iso3"}
    )
    panel = panel.merge(geo, on="iso3", how="left")
    panel = panel.merge(serie_macro(wdi, "NY.GDP.MKTP.CD", "pib_usd"), on=["iso3", "anio"], how="left")
    panel = panel.merge(serie_macro(wdi, "SP.POP.TOTL", "poblacion"), on=["iso3", "anio"], how="left")
    panel = panel.merge(rta, on=["iso3", "anio"], how="left")
    panel["pib_pc"] = np.where(
        (panel["pib_usd"] > 0) & (panel["poblacion"] > 0),
        panel["pib_usd"] / panel["poblacion"],
        np.nan,
    )
    panel["log_pib"] = np.where(panel["pib_usd"] > 0, np.log(panel["pib_usd"]), np.nan)
    panel["log_pib_pc"] = np.where(panel["pib_pc"] > 0, np.log(panel["pib_pc"]), np.nan)
    panel["log_dist"] = np.where(panel["dist"] > 0, np.log(panel["dist"]), np.nan)

    fuera = positivos[(positivos["iso3"].isna()) | (~positivos["iso3"].isin(socios))].copy()
    return panel, fuera


def chequeo_pib_pc(wdi: pd.DataFrame, panel: pd.DataFrame) -> pd.DataFrame:
    """El extracto oficial NY.GDP.PCAP.CD no cubre la muestra. Se contrasta donde sí existe."""
    oficial = serie_macro(wdi, "NY.GDP.PCAP.CD", "pib_pc_oficial")
    construido = panel[["iso3", "anio", "pib_pc"]].dropna()
    ambos = construido.merge(oficial, on=["iso3", "anio"], how="inner")
    ambos = ambos[(ambos["pib_pc"] > 0) & (ambos["pib_pc_oficial"] > 0)].copy()
    ambos["dif_pct"] = (ambos["pib_pc"] - ambos["pib_pc_oficial"]) / ambos["pib_pc_oficial"]
    resumen = pd.DataFrame(
        [
            {
                "filas_oficiales": int((wdi["indicador_codigo"] == "NY.GDP.PCAP.CD").sum()),
                "iso_oficiales": int(wdi.loc[wdi["indicador_codigo"] == "NY.GDP.PCAP.CD", "pais_iso3"].nunique()),
                "filas_comparadas": int(len(ambos)),
                "iso_comparados": int(ambos["iso3"].nunique()) if len(ambos) else 0,
                "correlacion": float(ambos["pib_pc"].corr(ambos["pib_pc_oficial"])) if len(ambos) > 2 else np.nan,
                "mediana_abs_dif_pct": float(ambos["dif_pct"].abs().median()) if len(ambos) else np.nan,
                "max_abs_dif_pct": float(ambos["dif_pct"].abs().max()) if len(ambos) else np.nan,
            }
        ]
    )
    return resumen


def perdida_de_muestra(panel: pd.DataFrame, fuera: pd.DataFrame, flujos: pd.DataFrame) -> pd.DataFrame:
    def n_socios(mascara: pd.Series) -> int:
        return int(panel.loc[mascara, "iso3"].nunique())

    etapas = [
        ("rectangulo_universo_2016_2024", pd.Series(True, index=panel.index)),
        ("con_flujo_positivo", panel["flujo_observado"]),
        ("cero_estructural", panel["cero_estructural"]),
        ("con_wgi_se_evalua_despues", pd.Series(False, index=panel.index)),
        ("con_geografia", panel["log_dist"].notna() & panel["contig"].notna() & panel["comlang_off"].notna() & panel["colony"].notna()),
        ("con_pib_y_poblacion", panel["log_pib"].notna() & panel["log_pib_pc"].notna()),
        ("con_rta", panel["rta"].notna()),
        (
            "muestra_completa",
            panel["log_dist"].notna()
            & panel["contig"].notna()
            & panel["comlang_off"].notna()
            & panel["colony"].notna()
            & panel["log_pib"].notna()
            & panel["log_pib_pc"].notna()
            & panel["rta"].notna(),
        ),
    ]
    filas = []
    for nombre, mascara in etapas:
        if nombre == "con_wgi_se_evalua_despues":
            continue
        filas.append({"etapa": nombre, "filas": int(mascara.sum()), "socios": n_socios(mascara)})
    filas.append(
        {
            "etapa": "flujos_positivos_fuera_del_universo_o_sin_iso3",
            "filas": int(len(fuera)),
            "socios": int(fuera["iso3"].nunique(dropna=True)),
        }
    )
    filas.append(
        {
            "etapa": "flujos_baci_crudos_todos_los_anios",
            "filas": int(len(flujos)),
            "socios": int(flujos["partner_codigo"].nunique()),
        }
    )
    return pd.DataFrame(filas)


def adjuntar_rezago(panel: pd.DataFrame, wgi: pd.DataFrame, rezago: int, columna: str) -> pd.DataFrame:
    rez = wgi[["iso3", "anio", columna]].dropna().copy()
    rez["anio"] = _anios_comercio(rez["anio"], rezago)
    rez = rez.rename(columns={columna: "wgi_rezago"})
    return panel.merge(rez, on=["iso3", "anio"], how="left")


def muestra_estimable(panel: pd.DataFrame, requiere_rta: bool) -> pd.DataFrame:
    cols = ["v_miles_usd", "wgi_rezago", "log_pib", "log_pib_pc", "log_dist", "contig", "comlang_off", "colony", "anio", "iso3"]
    if requiere_rta:
        cols.append("rta")
    return panel.dropna(subset=cols).reset_index(drop=True)


def ajustar_ppml(df: pd.DataFrame, formula: str):
    return smf.glm(formula, data=df, family=sm.families.Poisson()).fit(
        cov_type="cluster",
        cov_kwds={"groups": df["iso3"].to_numpy()},
        maxiter=100,
    )


def filas_coeficientes(modelo, meta: dict) -> list[dict]:
    sd = meta.get("sd_wgi", np.nan)
    filas = []
    for nombre in modelo.params.index:
        if nombre == "Intercept" or nombre.startswith("C(anio)"):
            continue
        coef = float(modelo.params[nombre])
        se = float(modelo.bse[nombre])
        fila = {
            **meta,
            "variable": nombre,
            "coef": coef,
            "se": se,
            "z_o_t": coef / se if se else np.nan,
            "p": float(modelo.pvalues[nombre]),
        }
        if nombre in {"wgi_rezago", "wgi_promedio"} and pd.notna(sd):
            fila["efecto_pct_1sd_muestra"] = float(np.exp(coef * sd) - 1)
            fila["sd_wgi_muestra"] = float(sd)
        filas.append(fila)
    return filas


def meta_de(spec: str, df: pd.DataFrame, nota: str, columna_wgi: str = "wgi_rezago") -> dict:
    return {
        "spec": spec,
        "nota": nota,
        "n": int(len(df)),
        "socios": int(df["iso3"].nunique()),
        "anios": int(df["anio"].nunique()),
        "ceros": int((df["v_miles_usd"] <= 0).sum()) if "v_miles_usd" in df.columns else 0,
        "sd_wgi": float(df[columna_wgi].std(ddof=0)),
        "convergio": True,
    }


def sanidad_rta(rta: pd.DataFrame) -> None:
    consulta = {
        "CHL": "acuerdo previo a 2016",
        "CHN": "TLC en vigor antes de 2016",
        "USA": "TLC en vigor antes de 2016",
        "AUS": "CPTPP para Perú desde 2021",
        "DEU": "acuerdo con la UE en vigor antes de 2016",
        "NGA": "sin ACR notificado esperado",
    }
    print("Sanidad del dummy rta (Larch), Perú como exportador:")
    for iso, nota in consulta.items():
        sub = rta.loc[rta["iso3"] == iso, ["anio", "rta"]].sort_values("anio")
        valores = ",".join(f"{int(a)}:{int(v)}" for a, v in sub.to_numpy()) if len(sub) else "AUSENTE"
        print(f"  PER-{iso} ({nota}): {valores}")


def componentes_principales(muestra: pd.DataFrame, wgi: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    nivel = wgi[["iso3", "anio", *DIMENSIONES.values()]].dropna().copy()
    nivel["anio"] = _anios_comercio(nivel["anio"], 1)
    datos = muestra[["iso3", "anio"]].merge(nivel, on=["iso3", "anio"], how="left")
    matriz = datos[list(DIMENSIONES.values())]
    if matriz.isna().any().any():
        raise SystemExit("La muestra completa tiene dimensiones WGI faltantes; no se calcula el PCA.")
    valores = matriz.to_numpy()
    media = valores.mean(axis=0)
    escala = valores.std(axis=0, ddof=0)
    estandar = (valores - media) / escala
    pca = PCA(n_components=1)
    score = pca.fit_transform(estandar).ravel()
    promedio = valores.mean(axis=1)
    if np.corrcoef(score, promedio)[0, 1] < 0:
        score = -score
        loadings = -pca.components_[0]
    else:
        loadings = pca.components_[0]
    salida = muestra.copy()
    salida["wgi_rezago"] = score
    cargas = pd.DataFrame(
        {
            "dimension": list(DIMENSIONES.values()),
            "codigo": list(DIMENSIONES.keys()),
            "carga_pc1": loadings,
            "varianza_explicada_pc1": pca.explained_variance_ratio_[0],
        }
    )
    return salida, cargas


def media_tres_anios(panel: pd.DataFrame, wgi: pd.DataFrame) -> pd.DataFrame:
    base = None
    for k in (1, 2, 3):
        rez = wgi[["iso3", "anio", "wgi_promedio"]].dropna().copy()
        rez["anio"] = _anios_comercio(rez["anio"], k)
        rez = rez.rename(columns={"wgi_promedio": f"w{k}"})
        base = rez if base is None else base.merge(rez, on=["iso3", "anio"], how="inner")
    base["wgi_rezago"] = base[["w1", "w2", "w3"]].mean(axis=1)
    return panel.merge(base[["iso3", "anio", "wgi_rezago"]], on=["iso3", "anio"], how="left")


def estimar_bloque(spec: str, df: pd.DataFrame, formula: str, nota: str, filas: list[dict]) -> None:
    if df["iso3"].nunique() < 5 or df["anio"].nunique() < 2 or len(df) < 30:
        print(f"SE OMITE {spec}: muestra {len(df)} filas / {df['iso3'].nunique()} socios")
        return
    modelo = ajustar_ppml(df, formula)
    meta = meta_de(spec, df, nota)
    meta["mcfadden"] = float(1 - modelo.llf / modelo.llnull) if modelo.llnull else np.nan
    meta["convergio"] = bool(modelo.converged) if hasattr(modelo, "converged") else True
    print(
        f"{spec}: N={meta['n']} socios={meta['socios']} ceros={meta['ceros']} "
        f"WGI={modelo.params.get('wgi_rezago', np.nan):.4f} "
        f"(se {modelo.bse.get('wgi_rezago', np.nan):.4f}) convergio={meta['convergio']}"
    )
    filas.extend(filas_coeficientes(modelo, meta))


def correlaciones(wgi: pd.DataFrame, muestra: pd.DataFrame) -> pd.DataFrame:
    nivel = wgi[["iso3", "anio", *DIMENSIONES.values()]].copy()
    nivel["anio"] = _anios_comercio(nivel["anio"], 1)
    datos = muestra[["iso3", "anio"]].merge(nivel, on=["iso3", "anio"], how="inner")
    return datos[list(DIMENSIONES.values())].corr()


def main() -> None:
    RESULTS.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    exportaciones = pd.read_csv(RAW / "baci_peru_todos_socios.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")
    geodist = pd.read_csv(RAW / "geodist_peru.csv")
    wdi = pd.read_csv(RAW / "wdi_wgi.csv")
    wgi = cargar_wgi(wdi)
    rta = cargar_rta_peru()
    sanidad_rta(rta)

    ols_df, ols = reproducir_ols(exportaciones, codigos, geodist, wdi)
    coef_ols = float(ols.params["wgi_promedio"])
    se_ols = float(ols.bse["wgi_promedio"])
    print(
        f"OLS script 16: N={int(ols.nobs)} socios={ols_df['iso3'].nunique()} "
        f"anios={ols_df['anio'].nunique()} WGI={coef_ols:.6f} se={se_ols:.6f} "
        f"t={coef_ols / se_ols:.3f} R2={ols.rsquared:.4f}"
    )
    if abs(coef_ols - OLS_COEF_PUBLICADO) > 0.002 or int(ols.nobs) != OLS_N_PUBLICADO:
        raise SystemExit(
            "La reproducción OLS no calza con el coeficiente publicado 0,667 y N=1496. "
            "No se informan resultados PPML hasta corregir la muestra."
        )
    print("Reproducción OLS dentro de 0,002 de 0,667 y N=1496.")

    socios = universo(codigos, geodist)
    panel, fuera = panel_rectangular(exportaciones, codigos, geodist, wdi, rta, socios)
    perdida = perdida_de_muestra(panel, fuera, exportaciones)
    chequeo = chequeo_pib_pc(wdi, panel)
    print(perdida.to_string(index=False))
    print(chequeo.to_string(index=False))
    if len(fuera):
        print("ISO3 con flujo positivo fuera del universo:")
        print(sorted(fuera["iso3"].dropna().unique()))
        sin_codigo = int(fuera["iso3"].isna().sum())
        print(f"Flujos de la ventana sin ISO3: {sin_codigo}")

    con_rezago = adjuntar_rezago(panel, wgi, 1, "wgi_promedio")
    completa = muestra_estimable(con_rezago, requiere_rta=True)
    sin_rta = muestra_estimable(con_rezago, requiere_rta=False)
    perdida = pd.concat(
        [
            perdida,
            pd.DataFrame(
                [
                    {
                        "etapa": "con_wgi_rezago_t-1_geografia_pib",
                        "filas": int(len(sin_rta)),
                        "socios": int(sin_rta["iso3"].nunique()),
                    },
                    {
                        "etapa": "muestra_ppml_completa_con_rta",
                        "filas": int(len(completa)),
                        "socios": int(completa["iso3"].nunique()),
                    },
                ]
            ),
        ],
        ignore_index=True,
    )
    print(
        f"Correlación log PIB y log PIB per cápita en la muestra completa: "
        f"{completa['log_pib'].corr(completa['log_pib_pc']):.3f}"
    )

    filas: list[dict] = []
    meta_ols = {
        "spec": "OLS_log_script16",
        "nota": "Reproducción del log-OLS publicado. Flujos positivos, sin PIB per cápita ni ACR.",
        "n": int(ols.nobs),
        "socios": int(ols_df["iso3"].nunique()),
        "anios": int(ols_df["anio"].nunique()),
        "ceros": 0,
        "sd_wgi": float(ols_df["wgi_promedio"].std(ddof=0)),
        "convergio": True,
        "mcfadden": float(ols.rsquared),
    }
    filas.extend(filas_coeficientes(ols, meta_ols))

    estimar_bloque(
        "PPML_positivos_covariables_OLS",
        ols_df.rename(columns={"wgi_promedio": "wgi_rezago"}),
        FORMULA_BASE,
        "Misma muestra que el log-OLS. Cambia solo el estimador.",
        filas,
    )
    estimar_bloque(
        "PPML_ceros_covariables_OLS",
        sin_rta,
        FORMULA_BASE,
        "Rectángulo con ceros estructurales. Covariables del log-OLS. Sin ACR.",
        filas,
    )
    estimar_bloque(
        "PPML_muestra_final_solo_PIB",
        completa,
        FORMULA_BASE,
        "Misma muestra que la spec completa, sin PIB per cápita ni ACR.",
        filas,
    )
    estimar_bloque(
        "PPML_muestra_final_PIB_pc",
        completa,
        FORMULA_PC,
        "Misma muestra que la spec completa, con PIB per cápita y sin ACR.",
        filas,
    )
    estimar_bloque(
        "PPML_completa",
        completa,
        FORMULA_COMPLETA,
        "Spec A. Ceros, PIB, PIB per cápita construido, ACR de Larch, efectos de año, clúster por destino.",
        filas,
    )

    for rezago in (2, 3):
        pegado = adjuntar_rezago(panel, wgi, rezago, "wgi_promedio")
        estimar_bloque(
            f"PPML_rezago_t-{rezago}",
            muestra_estimable(pegado, True),
            FORMULA_COMPLETA,
            f"Spec completa con WGI en t-{rezago}.",
            filas,
        )

    ma = media_tres_anios(panel, wgi)
    estimar_bloque(
        "PPML_media_movil_3",
        muestra_estimable(ma, True),
        FORMULA_COMPLETA,
        "Promedio de WGI en t-1, t-2 y t-3. Exige los tres años, así que empieza en 2018.",
        filas,
    )

    for codigo, columna in DIMENSIONES.items():
        pegado = adjuntar_rezago(panel, wgi, 1, columna)
        estimar_bloque(
            f"PPML_dimension_{columna}",
            muestra_estimable(pegado, True),
            FORMULA_COMPLETA,
            f"Una dimensión en lugar del promedio. Código {codigo}. Rezago t-1.",
            filas,
        )

    pca_df, cargas = componentes_principales(completa, wgi)
    estimar_bloque(
        "PPML_pca",
        pca_df,
        FORMULA_COMPLETA,
        "Primer componente de las seis dimensiones estandarizadas en la muestra completa. Signo alineado con el promedio.",
        filas,
    )

    for nombre, quitar in (
        ("PPML_sin_CHN", ["CHN"]),
        ("PPML_sin_USA", ["USA"]),
        ("PPML_sin_CHN_USA", ["CHN", "USA"]),
    ):
        recorte = completa[~completa["iso3"].isin(quitar)].reset_index(drop=True)
        estimar_bloque(nombre, recorte, FORMULA_COMPLETA, f"Spec completa sin {', '.join(quitar)}.", filas)

    sin_covid = completa[~completa["anio"].isin([2020, 2021])].reset_index(drop=True)
    estimar_bloque(
        "PPML_sin_2020_2021",
        sin_covid,
        FORMULA_COMPLETA,
        "Spec completa sin los años 2020 y 2021.",
        filas,
    )

    coefs = pd.DataFrame(filas)
    coefs.to_csv(RESULTS / "spec_a_coeficientes.csv", index=False)
    perdida.to_csv(RESULTS / "spec_a_muestra.csv", index=False)
    chequeo.to_csv(RESULTS / "spec_a_pib_pc_chequeo.csv", index=False)
    cargas.to_csv(RESULTS / "spec_a_pca_cargas.csv", index=False)
    correlaciones(wgi, completa).to_csv(RESULTS / "spec_a_correlaciones_wgi.csv")
    completa.to_csv(PROCESSED / "panel_spec_a.csv", index=False)
    print("CORE_GUARDADO")
    print(f"Sociedad del universo: {len(socios)} destinos geográficos que también son países BACI, sin Perú.")
    print(f"Resultados en {RESULTS}")


if __name__ == "__main__":
    main()
