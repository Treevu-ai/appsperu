# -*- coding: utf-8 -*-
"""
Paso 30 — Intensidad contractual por producto (Nunn 2007) y clasificación Rauch (1999).

Construye la variable de EXPOSICIÓN diferencial del diseño central (H3) a nivel
de producto, mapeando a HS6 y HS4 (vintage HS 1988/92, el de BACI):

  - ci_nunn_lib  : Nunn (2007), fracción de insumos intermedios diferenciados
                   (medida liberal). ISIC rev.2 -> HS6/HS4 (concordance).
  - ci_nunn_cons : Nunn (2007), variante conservadora.
  - rauch_lib_diff / rauch_con_diff : Rauch (1999) "n" (no cotiza en mercado
                   organizado ni tiene precio de referencia) = diferenciado.
                   Contraste prometido en la propuesta.

Fuentes (Nunn, sitio personal; paquete R `concordance` de insongkim):
  data/raw/nunn/isic_1997/contract_intensity_ISIC_1997.dta
  data/raw/nunn/  (exportes de las tablas del paquete)
Salidas:
  data/raw/nunn/intensidad_contractual_hs6.csv
  data/raw/nunn/intensidad_contractual_hs4.csv
  data/raw/nunn/_nunn_isic2.csv, _hs92_isic2.csv, _hs92_sitc2.csv, _sitc2_rauch.csv
"""
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pyreadr

RAW = Path(__file__).parent / ".." / "data" / "raw"
NUNN = RAW / "nunn"
REPO = Path(tempfile.gettempdir()) / "concordance_repo"


def tabla_rdata(nombre: str) -> pd.DataFrame:
    res = pyreadr.read_r(str(REPO / "data" / f"{nombre}.RData"))
    return list(res.values())[0]


def main() -> None:
    # --- 1. Nunn (2007), intensidad contractual por industria ISIC rev.2 ---
    nunn = pd.read_stata(NUNN / "isic_1997" / "contract_intensity_ISIC_1997.dta")
    nunn["industry_code"] = nunn["industry_code"].astype(str).str.strip()
    nunn_small = (
        nunn[["industry_code", "industry_description", "frac_lib_diff", "frac_cons_diff"]]
        .rename(columns={"industry_code": "ISIC2_3d",
                         "frac_lib_diff": "ci_nunn_lib",
                         "frac_cons_diff": "ci_nunn_cons"})
    )
    nunn_small.to_csv(NUNN / "_nunn_isic2.csv", index=False)
    print(f"Nunn ISIC rev.2: {len(nunn_small)} industrias. "
          f"ci_nunn_lib media={nunn_small['ci_nunn_lib'].mean():.3f} "
          f"rango=[{nunn_small['ci_nunn_lib'].min():.3f}, {nunn_small['ci_nunn_lib'].max():.3f}]")

    # --- 2. Concordancias HS 1988/92 -> ISIC rev.2 y -> SITC rev.2 ---
    hs_isic2 = tabla_rdata("hs0_isic2")     # HS0_6d, HS0_4d, ISIC2_3d
    hs_sitc2 = tabla_rdata("hs0_sitc2")     # HS0_6d, HS0_4d, SITC2_4d
    rauch = tabla_rdata("sitc2_rauch")      # SITC2, CON, LIB

    hs_isic2["ISIC2_3d"] = hs_isic2["ISIC2_3d"].astype(str).str.strip()
    hs_sitc2["SITC2_4d"] = hs_sitc2["SITC2_4d"].astype(str).str.strip()
    rauch["SITC2"] = rauch["SITC2"].astype(str).str.strip()

    hs_isic2.to_csv(NUNN / "_hs92_isic2.csv", index=False)
    hs_sitc2.to_csv(NUNN / "_hs92_sitc2.csv", index=False)
    rauch.to_csv(NUNN / "_sitc2_rauch.csv", index=False)
    print(f"concordancias: HS->ISIC2 {len(hs_isic2):,} | HS->SITC2 {len(hs_sitc2):,} | Rauch {len(rauch):,}")

    # --- 3. Ensamblar a HS6 ---
    hs6 = hs_isic2[["HS0_6d", "HS0_4d", "ISIC2_3d"]].rename(
        columns={"HS0_6d": "hs6", "HS0_4d": "hs4"})
    hs6 = hs6.merge(nunn_small[["ISIC2_3d", "ci_nunn_lib", "ci_nunn_cons"]],
                    on="ISIC2_3d", how="left")
    hs6 = hs6.merge(hs_sitc2[["HS0_6d", "SITC2_4d"]].rename(columns={"HS0_6d": "hs6"}),
                    on="hs6", how="left")
    hs6 = hs6.merge(rauch[["SITC2", "CON", "LIB"]], left_on="SITC2_4d", right_on="SITC2", how="left")

    def rauch_dummy(serie: pd.Series) -> pd.Series:
        return pd.Series(np.where(serie.notna(), (serie == "n").astype(float), np.nan),
                         index=serie.index)

    hs6["rauch_lib_diff"] = rauch_dummy(hs6["LIB"])
    hs6["rauch_con_diff"] = rauch_dummy(hs6["CON"])

    # Un HS6 puede mapear a varios SITC2/ISIC2: se conserva la fila con más información.
    hs6 = (hs6.sort_values(["hs6", "ci_nunn_lib"], ascending=[True, False])
              .drop_duplicates("hs6")
              .drop(columns=["SITC2", "SITC2_4d", "CON", "LIB"]))

    # --- 4. Agregado a HS4 (media entre HS6 del mismo HS4) ---
    hs4 = (hs6.groupby("hs4")
              .agg(ci_nunn_lib=("ci_nunn_lib", "mean"),
                   ci_nunn_cons=("ci_nunn_cons", "mean"),
                   rauch_lib_diff=("rauch_lib_diff", "mean"),
                   rauch_con_diff=("rauch_con_diff", "mean"),
                   n_hs6=("hs6", "size"))
              .reset_index())

    hs6.to_csv(NUNN / "intensidad_contractual_hs6.csv", index=False)
    hs4.to_csv(NUNN / "intensidad_contractual_hs4.csv", index=False)

    print(f"\nHS6: {len(hs6):,} productos | con Nunn: {hs6['ci_nunn_lib'].notna().sum():,} "
          f"| con Rauch: {hs6['rauch_lib_diff'].notna().sum():,}")
    print(f"HS4: {len(hs4):,} productos | con Nunn: {hs4['ci_nunn_lib'].notna().sum():,} "
          f"| con Rauch: {hs4['rauch_lib_diff'].notna().sum():,}")

    # --- 5. Cobertura sobre la canasta exportada del Perú ---
    peru = pd.read_csv(RAW / "baci_peru_exports_hs6.csv")
    peru["hs6"] = peru["hs6"].astype(str).str.zfill(6)
    peru["hs4"] = peru["hs6"].str[:4]
    cov6 = peru.merge(hs6[["hs6", "ci_nunn_lib"]], on="hs6", how="left")
    cov4 = peru.merge(hs4[["hs4", "ci_nunn_lib"]], on="hs4", how="left")
    print(f"\nCobertura Nunn sobre exportaciones Perú (HS6): "
          f"{cov6['ci_nunn_lib'].notna().mean():.1%} de filas, "
          f"{cov6.loc[cov6['ci_nunn_lib'].notna(), 'v_miles_usd'].sum() / peru['v_miles_usd'].sum():.1%} del valor")
    print(f"Cobertura Nunn sobre exportaciones Perú (HS4): "
          f"{cov4['ci_nunn_lib'].notna().mean():.1%} de filas, "
          f"{cov4.loc[cov4['ci_nunn_lib'].notna(), 'v_miles_usd'].sum() / peru['v_miles_usd'].sum():.1%} del valor")


if __name__ == "__main__":
    main()
