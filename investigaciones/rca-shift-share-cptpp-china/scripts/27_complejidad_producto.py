"""
Paso 27 — Complejidad económica (Hidalgo & Hausmann) y espacio de productos.

A partir de la matriz país x producto HS4 (baci_pais_hs4_2015.csv y _2024.csv,
exportada por 21_), calcula:

  - ECI (Economic Complexity Index) por país y año.
  - PCI (Product Complexity Index) por producto HS4.
  - Ubicuidad y diversificación.
  - Proximidad (φ) y densidad (density) por producto, y las "oportunidades"
    de Perú (productos aún no exportados con mayor densidad).

Salidas:
  results_avanzados/complejidad_hs4.csv   (hs4, pci_2015, pci_2024, ubicuidad, n_paises)
  results_avanzados/eci_paises.csv        (iso3, eci_2015, eci_2024, k_c)
  results_avanzados/peru_oportunidades.csv
"""
import numpy as np
import pandas as pd

from _comun_gravedad import RAW, RESULTADOS


def cargar_matriz(anio: int) -> pd.DataFrame:
    df = pd.read_csv(RAW / f"baci_pais_hs4_{anio}.csv")
    codigos = pd.read_csv(RAW / "baci_country_codes.csv")[
        ["country_code", "country_iso3"]].rename(columns={"country_code": "iso_i",
                                                          "country_iso3": "iso3"})
    df = df.merge(codigos, on="iso_i", how="left").dropna(subset=["iso3"])
    return df.pivot_table(index="iso3", columns="hs4", values="v_miles_usd",
                          aggfunc="sum", fill_value=0.0)


def rca_binaria(X: pd.DataFrame, umbral: float = 1.0) -> pd.DataFrame:
    total_c = X.sum(axis=1)
    total_p = X.sum(axis=0)
    total = X.values.sum()
    rca = (X.div(total_c, axis=0)).div(total_p / total, axis=1)
    return (rca >= umbral).astype(int), rca


def eci_pci(R: pd.DataFrame):
    """ECI por país y PCI por producto (Hidalgo & Hausmann 2009)."""
    M = R.values.astype(float)
    k_c = M.sum(axis=1)
    k_p = M.sum(axis=0)
    valid_c = k_c > 0
    valid_p = k_p > 0
    M = M[np.ix_(valid_c, valid_p)]
    k_c = k_c[valid_c]
    k_p = k_p[valid_p]
    A = (np.diag(1 / k_c) @ M @ np.diag(1 / k_p) @ M.T)
    vals, vecs = np.linalg.eig(A)
    orden = np.argsort(vals.real)[::-1]
    eci = vecs[:, orden[1]].real  # segundo autovector
    # normalizar signo: ECI positivo correlacionado con la diversificación
    if np.corrcoef(eci, k_c)[0, 1] < 0:
        eci = -eci
    eci = (eci - eci.mean()) / eci.std()
    pci = (1 / k_p) * (M.T @ eci)
    pci = (pci - pci.mean()) / pci.std()

    eci_serie = pd.Series(np.nan, index=R.index)
    eci_serie.iloc[np.where(valid_c)[0]] = eci
    pci_serie = pd.Series(np.nan, index=R.columns)
    pci_serie.iloc[np.where(valid_p)[0]] = pci
    return eci_serie, pci_serie, pd.Series(k_c, index=R.index[valid_c])


def proximidad(R: pd.DataFrame) -> pd.DataFrame:
    M = R.values.astype(float)
    k_p = M.sum(axis=0)
    co = M.T @ M
    denom = np.maximum.outer(k_p, k_p)
    with np.errstate(invalid="ignore", divide="ignore"):
        phi = np.where(denom > 0, co / denom, 0.0)
    return pd.DataFrame(phi, index=R.columns, columns=R.columns)


def main() -> None:
    filas = []
    eci_filas = []
    dens_peru = None
    for anio in (2015, 2024):
        X = cargar_matriz(anio)
        R, _ = rca_binaria(X)
        eci, pci, k_c = eci_pci(R)
        eci_filas.append(pd.DataFrame({"iso3": eci.index, f"eci_{anio}": eci.values}))
        div = R.sum(axis=1)
        filas.append(pd.DataFrame({
            "hs4": R.columns, f"pci_{anio}": pci.values,
            f"ubicuidad_{anio}": R.sum(axis=0).values,
            f"n_paises_{anio}": (X > 0).sum(axis=0).values,
        }))
        print(f"{anio}: {X.shape[0]} países x {X.shape[1]} productos | "
              f"RCA>=1 casillas: {int(R.values.sum()):,}")

        if anio == 2024:
            R_peru = R.loc["PER"] if "PER" in R.index else None
            phi = proximidad(R)
            densidad = (phi @ R.T).T / phi.sum(axis=1).values  # país x producto
            if "PER" in densidad.index:
                ya = R.loc["PER"] == 1
                d = pd.DataFrame({
                    "hs4": R.columns, "densidad": densidad.loc["PER"].values,
                    "ya_exporta": ya.values,
                })
                dens_peru = d[~d["ya_exporta"]].sort_values("densidad", ascending=False).head(30)

    comp = filas[0].merge(filas[1], on="hs4", how="outer")
    comp.to_csv(RESULTADOS / "complejidad_hs4.csv", index=False)
    eci = eci_filas[0].merge(eci_filas[1], on="iso3", how="outer")
    eci.to_csv(RESULTADOS / "eci_paises.csv", index=False)
    if dens_peru is not None:
        dens_peru.drop(columns=["ya_exporta"]).to_csv(
            RESULTADOS / "peru_oportunidades.csv", index=False)

    print("\n=== ECI 2024 — top 15 ===")
    print(eci.sort_values("eci_2024", ascending=False).head(15).to_string(index=False))
    print("\n=== Perú ===")
    print(eci[eci["iso3"] == "PER"].to_string(index=False))
    print("\n=== PCI — top 10 productos más complejos (2024) ===")
    print(comp.sort_values("pci_2024", ascending=False).head(10).to_string(index=False))
    if dens_peru is not None:
        print("\n=== Oportunidades de Perú (mayor densidad, aún sin RCA>=1) ===")
        print(dens_peru.head(10).to_string(index=False))


if __name__ == "__main__":
    main()
