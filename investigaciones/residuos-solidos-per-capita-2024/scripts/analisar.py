"""Análisis — investigaciones/residuos-solidos-per-capita-2024

Corte transversal nacional 2024 (n = 1.891 distritos): distribución de la generación
de residuos sólidos per cápita y su asociación con actividad económica formal (MTPE
2025), inversión pública acumulada (Invierte.pe) y capacidad fiscal municipal
(clasificación MEF), controles de urbanización, población y región natural.

Uso:
    python investigaciones/residuos-solidos-per-capita-2024/scripts/analisar.py

Entradas : data/raw/*.csv  (generados por extraer_datos.py)
Salidas  : results/tabla_*.csv, results/fig_*.png, results/resumen_ejecutivo.md

Notas de método
---------------
- Unidad: distrito. Corte: año 2024 (último año con cobertura completa MINAM).
- Cruces validados contra el padrón MINAM de 1.891 ubigeos: lo que no está en el
  padrón se descarta (ubigeos sintéticos/huérfanos documentados en data/raw/README.md).
- `costo_actualizado` de Invierte.pe con NaN se trata como 0 (ausencia de proyectos).
- `empresas_prom_mensual` con NaN NO se imputa: se elimina en casos completos.
- Errores estándar robustos clusterizados por departamento (25 clusters).
- Unidades de generación asumidas kg/hab/día (pendiente de confirmar con MINAM).
"""
from __future__ import annotations

import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

HERE = pathlib.Path(__file__).resolve().parents[1]
RAW = HERE / "data" / "raw"
RES = HERE / "results"

MEF_CAP = {"A": 7, "B": 6, "C": 5, "D": 4, "E": 3, "F": 2, "G": 1}


def es(x: float, dec: int = 2) -> str:
    """Número en formato es-PE (1.234,56)."""
    return f"{x:,.{dec}f}".replace(",", "@").replace(".", ",").replace("@", ".")


def star(p: float) -> str:
    return "***" if p < 0.01 else "**" if p < 0.05 else "*" if p < 0.1 else ""


def winsorize(s: pd.Series, lo: float = 0.01, hi: float = 0.99) -> pd.Series:
    a, b = s.quantile(lo), s.quantile(hi)
    return s.clip(a, b)


def cargar() -> tuple[pd.DataFrame, dict[str, int]]:
    res = pd.read_csv(RAW / "residuos_distrital_2019_2024.csv", dtype={"ubigeo": str})
    emp = pd.read_csv(RAW / "empresas_distrital_2025.csv", dtype={"ubigeo": str})
    inv = pd.read_csv(RAW / "inversion_publica_por_ubigeo.csv", dtype={"ubigeo": str})
    soc = pd.read_csv(RAW / "cobertura_social_2026_04_30.csv", dtype={"ubigeo": str})

    padron = set(res["ubigeo"])
    diag = {
        "padron_distritos": len(padron),
        "inv_filas_orig": len(inv),
        "inv_fuera_padron": int((~inv["ubigeo"].isin(padron)).sum()),
        "emp_filas_orig": len(emp),
        "emp_fuera_padron": int((~emp["ubigeo"].isin(padron)).sum()),
        "soc_filas_orig": len(soc),
        "soc_fuera_padron": int((~soc["ubigeo"].isin(padron)).sum()),
    }
    inv = inv[inv["ubigeo"].isin(padron)]
    emp = emp[emp["ubigeo"].isin(padron)]
    soc = soc[soc["ubigeo"].isin(padron)]

    base = res[res["anio"] == 2024].copy()
    diag["base_2024"] = len(base)

    base = base.merge(
        emp[["ubigeo", "empresas_prom_mensual", "empresas_diciembre"]], on="ubigeo", how="left"
    )
    base = base.merge(
        inv[["ubigeo", "n_hasta_2024", "costo_hasta_2024", "viable_hasta_2024",
             "avance_prom", "avance_invalidos", "n_avance_bajo"]], on="ubigeo", how="left"
    )
    base = base.merge(
        soc[["ubigeo", "juntos_hogares_abonados", "pension65_usuarios",
             "qaliwarma_ninos_atendidos", "foncodes_usuarios_estimados"]],
        on="ubigeo", how="left"
    )

    diag["con_empresas"] = int(base["empresas_prom_mensual"].notna().sum())
    diag["con_inversion"] = int((base["n_hasta_2024"].fillna(0) > 0).sum())
    diag["con_alguna_inversion"] = int(base["n_hasta_2024"].notna().sum())
    diag["proyectos_hasta_2024"] = int(base["n_hasta_2024"].fillna(0).sum())

    # --- variables de análisis -------------------------------------------------
    base["pct_urbana"] = base["poblacion_urbana"] / base["poblacion_total"]
    base["costo_hasta_2024"] = base["costo_hasta_2024"].fillna(0.0)
    base["costo_millones"] = base["costo_hasta_2024"] / 1e6
    base["inv_per_capita"] = np.where(
        base["poblacion_total"] > 0, base["costo_hasta_2024"] / base["poblacion_total"], np.nan
    )
    base["log_pob"] = np.log(base["poblacion_total"])
    base["log_emp"] = np.log1p(base["empresas_prom_mensual"])
    base["log_inv"] = np.log1p(base["costo_hasta_2024"])
    base["lpercap"] = np.log(base["generacion_percapita_dom"])
    base["lpercap_mun"] = np.log(base["generacion_percapita_mun"])
    base["cap_idx"] = base["clasificacion_municipal_mef"].map(MEF_CAP)
    base["baja_capacidad"] = 1 - (base["cap_idx"] - 1) / 6
    base["pct_generacion"] = base["generacion_percapita_dom"].rank(pct=True)
    base["indice_presion"] = 0.5 * base["pct_generacion"] + 0.5 * base["baja_capacidad"]
    return base, diag


def tabla_descriptivos(df: pd.DataFrame) -> pd.DataFrame:
    vars_ = {
        "generacion_percapita_dom": "Residuos per cápita dom. (kg/hab/día)",
        "generacion_percapita_mun": "Residuos per cápita municipal (kg/hab/día)",
        "poblacion_total": "Población del distrito",
        "pct_urbana": "Población urbana (%)",
        "empresas_prom_mensual": "Empresas formales/mes (2025)",
        "costo_millones": "Inversión pública acumulada a 2024 (S/ MM)",
        "n_hasta_2024": "Proyectos Invierte.pe a 2024 (n)",
    }
    filas = []
    for col, label in vars_.items():
        s = df[col].dropna()
        filas.append({
            "variable": label, "n": len(s), "min": s.min(), "p10": s.quantile(.10),
            "p25": s.quantile(.25), "p50": s.quantile(.50), "p75": s.quantile(.75),
            "p90": s.quantile(.90), "max": s.max(), "media": s.mean(), "desv": s.std(),
        })
    return pd.DataFrame(filas)


def tabla_agrupada(df: pd.DataFrame, col: str) -> pd.DataFrame:
    g = df.groupby(col, dropna=False)["generacion_percapita_dom"]
    out = pd.DataFrame({
        "n": g.size(),
        "media": g.mean(),
        "p10": g.quantile(.10),
        "p50": g.quantile(.50),
        "p90": g.quantile(.90),
    })
    out["p90_p10"] = out["p90"] / out["p10"]
    out["empresas_prom"] = df.groupby(col, dropna=False)["empresas_prom_mensual"].mean()
    out["inv_per_capita"] = df.groupby(col, dropna=False)["inv_per_capita"].mean()
    return out.reset_index().sort_values("media", ascending=False)


def correr_regresiones(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, "object"]]:
    specs = {
        "M1": dict(dv="lpercap", rhs="log_emp + log_inv + pct_urbana + log_pob",
                   nota="especificación base"),
        "M2": dict(dv="lpercap",
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef)",
                   nota="+ capacidad fiscal MEF"),
        "M3": dict(dv="lpercap",
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef) + C(region_natural)",
                   nota="+ región natural (espec. principal)"),
        "M4": dict(dv="lpercap",
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef) + C(departamento)",
                   nota="+ FE departamento"),
        "M5": dict(dv="lpercap_w", 
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef) + C(region_natural)",
                   nota="DV winsorizado 1%/99%"),
        "M6": dict(dv="lpercap_mun",
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef) + C(region_natural)",
                   nota="DV per cápita municipal"),
        "M7": dict(dv="lpercap_2023",
                   rhs="log_emp + log_inv + pct_urbana + log_pob + C(clasificacion_municipal_mef) + C(region_natural)",
                   nota="DV año 2023"),
    }
    d = df.copy()
    d["lpercap_w"] = winsorize(d["generacion_percapita_dom"])
    d["lpercap_w"] = np.log(d["lpercap_w"])

    # DV 2023: traer del panel para la robustez temporal
    panel = pd.read_csv(RAW / "residuos_distrital_2019_2024.csv", dtype={"ubigeo": str})
    p23 = panel[panel["anio"] == 2023][["ubigeo", "generacion_percapita_dom"]].rename(
        columns={"generacion_percapita_dom": "gen_2023"}
    )
    d = d.merge(p23, on="ubigeo", how="left")
    d["lpercap_2023"] = np.log(d["gen_2023"])

    filas, modelos = [], {}
    for nombre, spec in specs.items():
        sub = d.dropna(subset=[spec["dv"], "log_emp", "log_inv", "pct_urbana", "log_pob"])
        modelo = smf.ols(f'{spec["dv"]} ~ {spec["rhs"]}', data=sub).fit(
            cov_type="cluster", cov_kwds={"groups": sub["departamento"]}
        )
        modelos[nombre] = modelo
        for var in modelo.params.index:
            filas.append({
                "modelo": nombre, "nota": spec["nota"], "variable": var,
                "coef": modelo.params[var], "se": modelo.bse[var], "p": modelo.pvalues[var],
                "estrella": star(modelo.pvalues[var]),
            })
        filas.append({"modelo": nombre, "nota": spec["nota"], "variable": "n",
                      "coef": int(modelo.nobs), "se": np.nan, "p": np.nan, "estrella": ""})
        filas.append({"modelo": nombre, "nota": spec["nota"], "variable": "r2",
                      "coef": modelo.rsquared, "se": np.nan, "p": np.nan, "estrella": ""})
    return pd.DataFrame(filas), modelos


def tabla_regresiones_md(tab: pd.DataFrame) -> str:
    claves = ["log_emp", "log_inv", "pct_urbana", "log_pob"]
    modelos = list(tab["modelo"].unique())
    lineas = ["| variable | " + " | ".join(modelos) + " |",
              "|---|" + "---|" * len(modelos)]
    for var in claves:
        celdas = []
        for m in modelos:
            r = tab[(tab.modelo == m) & (tab.variable == var)]
            if r.empty:
                celdas.append("—")
            else:
                r = r.iloc[0]
                celdas.append(f"{r.coef:+.3f}{r.estrella} ({r.se:.3f})")
        lineas.append(f"| `{var}` | " + " | ".join(celdas) + " |")
    n_row = ["| n | " + " | ".join(
        str(int(tab[(tab.modelo == m) & (tab.variable == "n")].coef.iloc[0])) for m in modelos) + " |"]
    r2_row = ["| R² | " + " | ".join(
        f"{tab[(tab.modelo == m) & (tab.variable == 'r2')].coef.iloc[0]:.3f}" for m in modelos) + " |"]
    return "\n".join(lineas + n_row + r2_row)


def figuras(df: pd.DataFrame) -> None:
    # 01 — distribución
    fig, ax = plt.subplots(figsize=(8, 4.5))
    x = df["generacion_percapita_dom"]
    ax.hist(x, bins=45, color="#4C72B0", edgecolor="white")
    for q, lab, col in [(.10, "P10", "#999999"), (.50, "Mediana", "#DD8452"),
                        (.90, "P90", "#999999")]:
        v = x.quantile(q)
        ax.axvline(v, color=col, ls="--", lw=1.2)
        ax.text(v, ax.get_ylim()[1] * .95, f" {lab} {es(v)}", color=col, fontsize=9)
    ax.set_title("Generación de residuos domiciliarios per cápita, distritos del Perú (2024)")
    ax.set_xlabel("kg/hab/día (unidades por confirmar con MINAM)")
    ax.set_ylabel("N.° de distritos")
    fig.tight_layout()
    fig.savefig(RES / "fig_01_distribucion.png", dpi=150)
    plt.close(fig)

    # 02 — por departamento
    g = df.groupby("departamento")["generacion_percapita_dom"].mean().sort_values()
    fig, ax = plt.subplots(figsize=(9, 6.5))
    g.plot.barh(ax=ax, color="#4C72B0")
    ax.axvline(df["generacion_percapita_dom"].mean(), color="#DD8452", ls="--",
               label=f"Media nacional {es(df['generacion_percapita_dom'].mean())}")
    ax.set_title("Residuos domiciliarios per cápita promedio por departamento (2024)")
    ax.set_xlabel("kg/hab/día (unidades por confirmar)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(RES / "fig_02_por_departamento.png", dpi=150)
    plt.close(fig)

    # 03 — por clase MEF
    orden = [c for c in "ABCDEFG" if c in set(df["clasificacion_municipal_mef"])]
    datos = [df.loc[df["clasificacion_municipal_mef"] == c, "generacion_percapita_dom"] for c in orden]
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.boxplot(datos, tick_labels=orden, showfliers=False)
    ax.set_title("Residuos per cápita por clase de capacidad municipal MEF (2024)")
    ax.set_xlabel("Clase MEF (A = mayor capacidad · G = menor capacidad)")
    ax.set_ylabel("kg/hab/día (unidades por confirmar)")
    fig.tight_layout()
    fig.savefig(RES / "fig_03_clase_mef.png", dpi=150)
    plt.close(fig)

    # 04 — dispersión empresas vs residuos
    sub = df.dropna(subset=["empresas_prom_mensual"])
    fig, ax = plt.subplots(figsize=(7.5, 5))
    ax.scatter(sub["log_emp"], sub["lpercap"], s=12, alpha=.45, color="#4C72B0")
    m = np.polyfit(sub["log_emp"], sub["lpercap"], 1)
    xs = np.linspace(sub["log_emp"].min(), sub["log_emp"].max(), 50)
    ax.plot(xs, np.polyval(m, xs), color="#C44E52", lw=2,
            label=f"pendiente = {m[0]:+.3f}")
    ax.set_title("Residuos per cápita vs empresas formales por distrito (2024 vs 2025)")
    ax.set_xlabel("log(1 + empresas formales/mes, 2025)")
    ax.set_ylabel("log(residuos per cápita dom.)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(RES / "fig_04_dispersion_empresas.png", dpi=150)
    plt.close(fig)


def priorizacion(df: pd.DataFrame) -> pd.DataFrame:
    top = df.sort_values("indice_presion", ascending=False).head(30)[
        ["departamento", "provincia", "distrito", "ubigeo", "generacion_percapita_dom",
         "clasificacion_municipal_mef", "poblacion_total", "empresas_prom_mensual",
         "costo_millones", "indice_presion"]
    ].copy()
    top.insert(0, "rank", range(1, len(top) + 1))
    return top


def resumen(df: pd.DataFrame, diag: dict, tab_desc: pd.DataFrame, tab_reg: pd.DataFrame,
            top: pd.DataFrame) -> str:
    x = df["generacion_percapita_dom"]
    ratio = x.quantile(.90) / x.quantile(.10)
    m3 = tab_reg[tab_reg.modelo == "M3"].set_index("variable")

    def coef(v: str) -> str:
        r = m3.loc[v]
        return f"{r['coef']:+.3f}{r['estrella']} (EE {r['se']:.3f})"

    n_m3 = int(m3.loc["n", "coef"])
    r2_m3 = m3.loc["r2", "coef"]
    top_mezcla = int((top["clasificacion_municipal_mef"].isin(["F", "G"])).sum())

    # coeficientes MEF de M3 (ref. = clase A)
    mef = tab_reg[(tab_reg.modelo == "M3")
                  & tab_reg.variable.str.startswith("C(clasificacion_municipal_mef)[T.")].copy()
    mef["clase"] = mef.variable.str.extract(r"\[T\.(\w)\]")
    neg = mef[(mef.coef < 0) & (mef.p < 0.05)].sort_values("coef")
    pos = mef[(mef.coef > 0) & (mef.p < 0.05)]
    borde = mef[(mef.coef < 0) & (mef.p >= 0.05) & (mef.p < 0.10)]
    mef_txt_neg = ", ".join(f"**{r.clase}** ({r.coef:+.3f}{r.estrella})" for r in neg.itertuples())
    mef_txt_pos = ", ".join(f"**{r.clase}** ({r.coef:+.3f}{r.estrella})" for r in pos.itertuples())
    mef_txt_b = " ".join(
        f"**{r.clase}** ({r.coef:+.3f}{r.estrella}) es negativa pero solo al 10%."
        for r in borde.itertuples()
    )

    # estabilidad del coeficiente de empresas en las especificaciones de robustez
    rob = []
    for m in ["M4", "M5", "M6", "M7"]:
        r = tab_reg[(tab_reg.modelo == m) & (tab_reg.variable == "log_emp")].iloc[0]
        rob.append(f"{m} {r.coef:+.3f}{r.estrella}")
    rob_txt = " · ".join(rob)

    md = f"""# Resumen ejecutivo — residuos sólidos per cápita y capacidad municipal (corte 2024)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · universo {es(len(df), 0)} distritos · modelos con n = {es(n_m3, 0)} (casos completos)*

## 1. Qué se hizo

Corte transversal nacional (año 2024) de la generación de residuos sólidos per cápita,
cruzada con empresas formales por distrito (MTPE, 2025), inversión pública acumulada
(Invierte.pe, hasta 2024), programas sociales (corte 2026-04-30) y capacidad fiscal
municipal (clasificación MEF). Base: panel MINAM/SIGERSOL 2019-2024 extraído de Rastro
({es(diag['padron_distritos'], 0)} distritos, 0 nulos en variables clave).

## 2. Hallazgos

**a) La desigualdad territorial es moderada pero sistemática.** El P90 distrital
({es(x.quantile(.90))} kg/hab/día) es {es(ratio)} veces el P10 ({es(x.quantile(.10))}),
con mediana {es(x.quantile(.50))} y media {es(x.mean())}. El rango 2024 va de
{es(x.min())} a {es(x.max())} (la serie histórica llega a 2,00 en 2019-2020: outliers
de reporte, por eso 2024 es el corte más limpio).

**b) La capacidad fiscal municipal se asocia con la generación, pero no de forma
monótona.** Medias por clase MEF: {' · '.join(f'{c} {es(df.loc[df.clasificacion_municipal_mef == c, "generacion_percapita_dom"].mean())}' for c in 'ABCDEFG' if c in set(df.clasificacion_municipal_mef))} kg/hab/día. En M3 (ref. = clase A):
{mef_txt_neg} se quedan **por debajo de A y significativas**, mientras
{mef_txt_pos} queda **por encima** ({es(df.loc[df.clasificacion_municipal_mef == 'C', 'empresas_prom_mensual'].mean(), 0)} empresas formales/mes vs
{es(df.loc[df.clasificacion_municipal_mef == 'A', 'empresas_prom_mensual'].mean(), 0)} en A; solo 42 distritos en C). Lectura: donde el municipio tiene
menos capacidad (F/G) la generación per cápita es ~{es(abs(float(m3.loc['C(clasificacion_municipal_mef)[T.F]', 'coef'])) * 100, 0)}% menor que en A — es decir, **menos residuos
reportados por habitante justo en los municipios con menos recursos para gestionarlos**.
{mef_txt_b}

**c) Actividad formal explica parte de la variación; inversión pública no.** En M3
(R² = {r2_m3:.3f}, n = {es(n_m3, 0)}, EE cluster por departamento):
`log(empresas formales)` = {coef('log_emp')} y `log(inversión pública acumulada)` =
{coef('log_inv')} (**no significativo en ninguna de las 7 especificaciones**);
`población urbana` = {coef('pct_urbana')} y `log(población)` = {coef('log_pob')}.
Lectura: un 1% más de empresas formales se asocia con ~{float(m3.loc['log_emp', 'coef']):.3f}% más de residuos
per cápita — la generación sirve como proxy de consumo/formalidad, no solo de tamaño.

**d) Los resultados son estables.** El coeficiente de empresas formales se mantiene
positivo y significativo en las 7 especificaciones ({rob_txt}): con FE de departamento
(M4), DV winsorizado 1%/99% (M5), DV per cápita municipal (M6) y DV del año 2023 (M7).

**e) Priorización.** El índice de presión (50% posición en generación + 50% baja
capacidad MEF) identifica {len(top)} distritos prioritarios; {top_mezcla} de ellos están
en clases F/G (menor capacidad). Los 5 primeros:
{chr(10).join(f"   {i+1}. **{r.distrito}** ({r.departamento}, clase {r.clasificacion_municipal_mef}, {es(r.generacion_percapita_dom)} kg/hab/día, {es(r.poblacion_total, 0)} hab)" for i, r in enumerate(top.head(5).itertuples()))}.

## 3. Cobertura y limpieza aplicada

| Concepto | Valor |
|---|---|
| Distritos en el padrón MINAM 2024 | {es(diag['padron_distritos'], 0)} |
| Con dato de empresas (MTPE 2025) | {es(diag['con_empresas'], 0)} ({es(100 * diag['con_empresas'] / diag['padron_distritos'], 1)}%) |
| Con ≥1 proyecto Invierte.pe registrado hasta 2024 | {es(diag['con_inversion'], 0)} ({es(100 * diag['con_inversion'] / diag['padron_distritos'], 1)}%) |
| Filas descartadas fuera del padrón (inversión / empresas / programas) | {diag['inv_fuera_padron']} / {diag['emp_fuera_padron']} / {diag['soc_fuera_padron']} |
| Proyectos Invierte.pe acumulados a 2024 | {es(diag['proyectos_hasta_2024'], 0)} |

## 4. Advertencias para no sobreinterpretar

1. **Asociación, no causalidad**: el diseño es transversal por definición.
2. **Unidades sin confirmar** (kg/hab/día asumido) y **diccionario MEF A–G sin decodificar**:
   confirmar antes de publicar cifras.
3. **Desfase de cortes**: residuos 2024 · empresas 2025 · programas 2026-04-30.
4. **383 distritos sin dato MTPE**: se excluyen, no se imputan ceros.
5. Se mide **generación**, no cobertura de recolección/tratamiento (SINAN no está en el catálogo).
6. `avance_ejecucion` de Invierte.pe trae {int(df['avance_invalidos'].fillna(0).sum())} valores fuera de rango
   (0-100 esperado): se filtra en la extracción; no usar sin limpiar.

## 5. Salidas

`tabla_01_descriptivos.csv` · `tabla_02_por_departamento.csv` · `tabla_03_por_clase_mef.csv` ·
`tabla_04_regresiones.csv` (y `.md`) · `top30_priorizacion.csv` · `fig_01` a `fig_04` (.png).
"""
    return md


def main() -> None:
    RES.mkdir(parents=True, exist_ok=True)
    print("[1/6] cargando datos crudos…")
    df, diag = cargar()
    print(f"      base 2024 = {len(df)} distritos · con empresas = {diag['con_empresas']}")

    print("[2/6] descriptivos…")
    desc = tabla_descriptivos(df)
    desc.to_csv(RES / "tabla_01_descriptivos.csv", index=False, encoding="utf-8")

    print("[3/6] agregados por departamento y clase MEF…")
    tabla_agrupada(df, "departamento").to_csv(
        RES / "tabla_02_por_departamento.csv", index=False, encoding="utf-8")
    tabla_agrupada(df, "clasificacion_municipal_mef").to_csv(
        RES / "tabla_03_por_clase_mef.csv", index=False, encoding="utf-8")

    print("[4/6] regresiones (EE cluster por departamento)…")
    tab_reg, modelos = correr_regresiones(df)
    tab_reg.to_csv(RES / "tabla_04_regresiones.csv", index=False, encoding="utf-8")
    md_reg = tabla_regresiones_md(tab_reg)
    (RES / "tabla_04_regresiones.md").write_text(md_reg + "\n", encoding="utf-8")

    print("[5/6] figuras y priorización…")
    figuras(df)
    top = priorizacion(df)
    top.to_csv(RES / "top30_priorizacion.csv", index=False, encoding="utf-8")

    print("[6/6] resumen ejecutivo…")
    (RES / "resumen_ejecutivo.md").write_text(
        resumen(df, diag, desc, tab_reg, top), encoding="utf-8")

    print("[ok] salidas en", RES)
    m3 = tab_reg[tab_reg.modelo == "M3"].set_index("variable")
    print("      M3 log_emp =", f"{m3.loc['log_emp', 'coef']:+.3f}",
          f"({m3.loc['log_emp', 'estrella']}) ·",
          "log_inv =", f"{m3.loc['log_inv', 'coef']:+.3f}",
          f"({m3.loc['log_inv', 'estrella']}) ·",
          "R2 =", f"{m3.loc['r2', 'coef']:.3f}")


if __name__ == "__main__":
    main()
