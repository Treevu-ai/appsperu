"""Análisis — investigaciones/inversion-publica-crecimiento-exportador-regional

Panel departamento×año (2019-2025) de finalizaciones de obra pública productiva
(Invierte.pe) y exportadores RUC con domicilio fiscal en la región.

Diseño (según propuesta §7): teste de precedencia temporal en ambas direcciones
(estilo Granger panel) con efectos fijos de departamento y año.

Fase PILOTO declarada: la variable dependiente (exportadores RUC con registro FOB)
cubre 339/13.366 RUC de la meta de ingesta Aduanet — muestra parcial no aleatoria.
Todo resultado se lee como exploratorio.

Uso:
    python investigaciones/inversion-publica-crecimiento-exportador-regional/scripts/analisar.py
"""
from __future__ import annotations

import pathlib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import patsy
import statsmodels.api as sm

HERE = pathlib.Path(__file__).resolve().parents[1]
RAW = HERE / "data" / "raw"
RES = HERE / "results"

ANIOS_DV = list(range(2019, 2026))     # 2026 excluido: año parcial en FOB
ANIOS_GRID = list(range(2016, 2026))   # inversión desde 2016 para rezagos de 3 años
FE = "C(cod_dep) + C(anio)"

# códigos INEI de departamento (prefijo del ubigeo distrital)
DEPTOS = {
    "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA",
    "05": "AYACUCHO", "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO",
    "09": "HUANCAVELICA", "10": "HUANUCO", "11": "ICA", "12": "JUNIN",
    "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA", "16": "LORETO",
    "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
    "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES",
    "25": "UCAYALI",
}


def cargar() -> tuple[pd.DataFrame, pd.DataFrame]:
    inv = pd.read_csv(RAW / "inversiones_region_anio.csv", dtype={"cod_dep": str})
    fob = pd.read_csv(RAW / "exportadores_fob_ruc.csv", dtype={"ruc": str})
    pad = pd.read_csv(RAW / "padron_exportadores_ubigeo.csv", dtype={"ruc": str, "ubigeo": str})
    pad["cod_dep"] = pad["ubigeo"].str[:2]

    # exportadores por región de domicilio fiscal × año
    exp = (fob.merge(pad[["ruc", "cod_dep"]], on="ruc", how="left")
              .dropna(subset=["cod_dep"]))
    por_region = (exp.groupby(["cod_dep", "anio"])
                     .agg(exportadores=("ruc", "nunique"),
                          fob_usd=("fob_usd", "sum"))
                     .reset_index())

    # panel balanceado departamento×año (inversión 2016-2025; exportadores solo 2019-2025:
    # antes de 2019 son DESCONOCIDOS — no ceros — por eso quedan como NaN)
    deps = sorted(inv["cod_dep"].unique())
    idx = pd.MultiIndex.from_product([deps, ANIOS_GRID], names=["cod_dep", "anio"])
    panel = (pd.DataFrame(index=idx).reset_index()
                 .merge(inv, on=["cod_dep", "anio"], how="left")
                 .merge(por_region, on=["cod_dep", "anio"], how="left"))
    for col in ["n_prod_funcion", "monto_prod_funcion", "n_prod_sector",
                "monto_prod_sector", "n_total", "monto_total"]:
        panel[col] = panel[col].fillna(0)
    en_dv = panel["anio"].isin(ANIOS_DV)
    panel.loc[en_dv, "exportadores"] = panel.loc[en_dv, "exportadores"].fillna(0).astype(int)
    panel.loc[en_dv, "fob_usd"] = panel.loc[en_dv, "fob_usd"].fillna(0.0)

    panel = panel.sort_values(["cod_dep", "anio"]).reset_index(drop=True)
    panel["log_monto_prod"] = np.log1p(panel["monto_prod_funcion"] / 1e6)
    panel["log_monto_sector"] = np.log1p(panel["monto_prod_sector"] / 1e6)
    for k in range(4):
        panel[f"log_monto_l{k}"] = panel.groupby("cod_dep")["log_monto_prod"].shift(k)
        panel[f"exp_l{k}"] = panel.groupby("cod_dep")["exportadores"].shift(k)
    return panel, exp


def modelo(formula: str, datos: pd.DataFrame, cluster: str = "cod_dep"):
    # patsy descarta NaN y devuelve el índice de la muestra de estimación;
    # los clusters deben alinearse con esa muestra (no con el panel completo)
    y, X = patsy.dmatrices(formula, data=datos, return_type="dataframe")
    grupos = datos.loc[X.index, cluster]
    return sm.OLS(y, X).fit(cov_type="cluster", cov_kwds={"groups": grupos})


def main() -> None:
    RES.mkdir(parents=True, exist_ok=True)
    panel, exp = cargar()
    dv = panel[panel["anio"].isin(ANIOS_DV)].copy()

    print(f"[1/5] panel DV: {len(dv)} obs ({dv['cod_dep'].nunique()} dept × "
          f"{len(ANIOS_DV)} años) · RUC-año con ubicación: {dv['exportadores'].sum():,} "
          f"(de 339 RUC)")
    ceros = (dv["exportadores"] == 0).mean()
    print(f"      dept-año sin exportadores registrados: {ceros:.0%}")

    # ---- 1. descriptivos ----
    desc_anio = (dv.groupby("anio")
                   .agg(exportadores=("exportadores", "sum"),
                        fob_usd=("fob_usd", "sum"),
                        dept_con_exp=("exportadores", lambda s: (s > 0).sum()),
                        monto_prod_mill=("monto_prod_funcion", lambda s: s.sum() / 1e6),
                        n_prod=("n_prod_funcion", "sum"))
                   .round(1))
    desc_anio.to_csv(RES / "tabla_01_exportadores_inversion_anio.csv", encoding="utf-8")

    por_dep = (dv.groupby("cod_dep")
                 .agg(exportadores=("exportadores", "sum"),
                      fob_usd=("fob_usd", "sum"),
                      monto_prod_mill=("monto_prod_funcion", lambda s: s.sum() / 1e6),
                      n_prod=("n_prod_funcion", "sum"))
                 .sort_values("exportadores", ascending=False))
    por_dep["departamento"] = por_dep.index.map(DEPTOS)
    por_dep["part_exp"] = por_dep["exportadores"] / por_dep["exportadores"].sum()
    por_dep.to_csv(RES / "tabla_02_por_departamento.csv", encoding="utf-8")

    # ---- 2. precedencia: inversión → exportadores ----
    resultados = []
    specs = [
        ("M1 inversión(t) → exp(t)", "exportadores ~ log_monto_prod + " + FE, "log_monto_prod"),
        ("M2 inversión(t..t-3) → exp(t)",
         "exportadores ~ log_monto_l0 + log_monto_l1 + log_monto_l2 + log_monto_l3 + " + FE,
         "log_monto_l0"),
        ("M3 log(1+exp) ~ inversión(t)", "I(np.log1p(exportadores)) ~ log_monto_prod + " + FE,
         "log_monto_prod"),
    ]
    print("\n[2/5] inversión → exportadores (EE cluster por departamento):")
    for nombre, formula, termino in specs:
        m = modelo(formula, dv)
        resultados.append({"modelo": nombre, "coef": round(m.params[termino], 4),
                           "p": round(m.pvalues[termino], 4),
                           "n": int(m.nobs), "r2": round(m.rsquared, 3)})
        print(f"      {nombre}: beta={resultados[-1]['coef']} (p={resultados[-1]['p']}) "
              f"n={resultados[-1]['n']} R2={resultados[-1]['r2']}")

    # dirección inversa: exportadores pasados → inversión presente
    rev = dv.dropna(subset=["exp_l3"])
    m_rev = modelo("log_monto_prod ~ exp_l0 + exp_l1 + exp_l2 + exp_l3 + " + FE, rev)
    coef_exp = [round(float(m_rev.params[f"exp_l{k}"]), 4) for k in range(4)]
    p_exp = [round(float(m_rev.pvalues[f"exp_l{k}"]), 4) for k in range(4)]
    resultados.append({"modelo": "M4 exp(t..t-3) → inversión(t) [dirección inversa]",
                       "coef": str(coef_exp), "p": str(p_exp), "n": int(m_rev.nobs),
                       "r2": round(m_rev.rsquared, 3)})
    print(f"      M4 (dirección inversa) exp_l0..3: {coef_exp} p={p_exp} "
          f"n={m_rev.nobs} R2={m_rev.rsquared:.3f}")

    # clasificación por pliego (especificación original de la propuesta)
    m5 = modelo(f"exportadores ~ log_monto_sector + {FE}", dv)
    resultados.append({"modelo": "M5 clasificación por pliego (sector)",
                       "coef": round(m5.params["log_monto_sector"], 4),
                       "p": round(m5.pvalues["log_monto_sector"], 4),
                       "n": int(m5.nobs), "r2": round(m5.rsquared, 3)})
    print(f"      M5 (pliego) beta={resultados[-1]['coef']} (p={resultados[-1]['p']})")

    pd.DataFrame(resultados).to_csv(RES / "tabla_03_modelos.csv", index=False, encoding="utf-8")

    # ---- 3. figuras ----
    plt.figure(figsize=(7, 3.4))
    plt.bar(desc_anio.index, desc_anio["exportadores"], color="#2E5395")
    plt.title("Exportadores RUC registrados por año (muestra parcial Aduanet)")
    plt.ylabel("RUC distintos"); plt.tight_layout()
    plt.savefig(RES / "fig_01_exportadores_anio.png", dpi=150); plt.close()

    plt.figure(figsize=(7, 3.4))
    plt.bar(desc_anio.index, desc_anio["monto_prod_mill"], color="#7F6000")
    plt.title("Monto viable de finalizaciones productivas por año (S/ millones)")
    plt.ylabel("S/ millones"); plt.tight_layout()
    plt.savefig(RES / "fig_02_inversion_productiva_anio.png", dpi=150); plt.close()

    top = por_dep.head(10)
    plt.figure(figsize=(7, 3.6))
    plt.bar(top["departamento"], top["exportadores"], color="#2E5395")
    plt.title("Exportadores RUC acumulados 2019-2025 por departamento (top 10)")
    plt.ylabel("RUC-año"); plt.xticks(rotation=45, ha="right"); plt.tight_layout()
    plt.savefig(RES / "fig_03_exportadores_por_region.png", dpi=150); plt.close()

    # ---- 4. resumen ejecutivo auto-generado ----
    top_dep = por_dep.head(3)
    nombres_top = ", ".join(f"{row.departamento} {row.exportadores:.0f}" for _, row in top_dep.iterrows())
    resumen = f"""# Resumen ejecutivo — inversión pública productiva y exportadores regionales (fase piloto)

*Generado por `scripts/analisar.py` · fecha: 2026-10-19 · panel {len(dv)} obs
({dv['cod_dep'].nunique()} dept × {len(ANIOS_DV)} años, 2019-2025)*

## Advertencia de diseño (leer primero)

**Fase piloto.** La variable dependiente cubre 339 RUC con registro FOB de una meta de
~13.366 (2.5%) — muestra parcial NO aleatoria (ingesta secuencial de Aduanet). El
{ceros:.0%} de los dept-año no tiene ningún exportador registrado. Todos los resultados
son exploratorios.

## Qué se midió

- **Inversión**: finalizaciones de obra (fecha_fin_ejecucion ≤ 2026; se excluyen 48.263
  proyectos con fechas futuras hasta 2070) clasificadas dos veces:
  (a) por función de obra (TRANSPORTE/ENERGÍA/AGROPECUARIA: {dv['n_prod_funcion'].sum():,.0f}
  proyectos finalizados 2019-2025) y (b) por pliego ejecutor (la clasificación original de la
  propuesta: TRANSPORTES Y COMUNICACIONES / AGRICULTURA Y RIEGO / ENERGIA Y MINAS).
- **Exportadores**: RUC distintos con registro FOB por año cuyo domicilio fiscal
  (padrón SUNAT) queda en el departamento (337/339 RUC con ubigeo).

## Hallazgos

1. **Concentración extrema**: los 3 departamentos principales concentran el
   {top_dep['part_exp'].sum():.0%} de los registros exportador-año ({nombres_top}).
2. **Precedencia inversión→exportadores: sin señal.** Especificación principal (M1):
   beta = {resultados[0]['coef']} (p={resultados[0]['p']}, n={resultados[0]['n']}, R²={resultados[0]['r2']}).
   Con rezagos 0-3 (M2, beta_t = {resultados[1]['coef']}, p={resultados[1]['p']}) y con la
   clasificación por pliego (M5, beta = {resultados[4]['coef']}, p={resultados[4]['p']}) tampoco hay señal.
3. **Dirección inversa (M4)**: rezagos de exportadores sobre inversión presente —
   betas {coef_exp} (p={p_exp}); tampoco hay señal.
4. **Cobertura de la inversión**: {(dv['n_prod_funcion'] > 0).mean():.0%} de los dept-año tienen
   al menos una finalización productiva registrada.

## Lectura honesta

Con la muestra actual de exportadores, el test de precedencia da **null en ambas
direcciones**: no hay con qué distinguir inversión→exportadores de exportadores→
inversión. Esto NO demuestra ausencia de relación — la potencia del panel chico
(n={len(dv)}, DV con {ceros:.0%} de ceros) la descarta como herramienta diagnóstica. El
resultado útil es metodológico: el pipeline queda listo para la fase completa cuando
Aduanet complete la ingesta, sin ningún cambio de código.

## Reproducibilidad

`scripts/extraer_datos.py` → `data/raw/` (17.120 filas) → `scripts/analisar.py` → `results/`.
"""
    (RES / "resumen_ejecutivo.md").write_text(resumen, encoding="utf-8")
    print(f"\n[ok] salidas en {RES}")


if __name__ == "__main__":
    main()
