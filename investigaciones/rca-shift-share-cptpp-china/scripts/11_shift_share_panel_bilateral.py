"""
Construye el panel socio-año de shift-share BILATERAL que pide
06_panel_regresion.py: para cada socio CPTPP+China y cada año consecutivo
(t-1 -> t, 2016-2024), descompone el crecimiento de las exportaciones de
Perú HACIA ESE SOCIO en:

  - efecto de crecimiento de la demanda de importaciones del socio (no la
    demanda mundial agregada — aquí el "mercado" relevante es el socio)
  - efecto de estructura (mezcla de capítulos que Perú le vende)
  - efecto de competitividad real (residual, ganancia/pérdida de cuota de
    mercado de Perú dentro de las importaciones del socio, por capítulo)

Entradas:
  ../data/raw/baci_peru_bilateral_hs2.csv        (Perú -> socio, por capítulo)
  ../data/raw/baci_importaciones_socios_hs2.csv  (importaciones totales del socio, por capítulo)

Salida:
  ../data/processed/shift_share_panel.csv  (pais_iso3, anio, efecto_competitividad, ...)
  — este es el archivo que 06_panel_regresion.py espera.

Uso:
    python 11_shift_share_panel_bilateral.py
"""
from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / ".." / "data" / "raw"
OUT = Path(__file__).parent / ".." / "data" / "processed"

ISO3 = {
    36: "AUS", 96: "BRN", 124: "CAN", 152: "CHL", 156: "CHN", 392: "JPN",
    458: "MYS", 484: "MEX", 554: "NZL", 702: "SGP", 704: "VNM", 826: "GBR",
}
ANIOS = list(range(2015, 2025))


def main() -> None:
    peru_bilateral = pd.read_csv(RAW / "baci_peru_bilateral_hs2.csv", dtype={"hs2": str})
    import_socios = pd.read_csv(RAW / "baci_importaciones_socios_hs2.csv", dtype={"hs2": str})

    filas = []
    for codigo, iso3 in ISO3.items():
        pb = peru_bilateral[peru_bilateral["partner_codigo"] == codigo]
        imp = import_socios[import_socios["partner_codigo"] == codigo]

        for i in range(1, len(ANIOS)):
            t0, t1 = ANIOS[i - 1], ANIOS[i]
            p0 = pb[pb["anio"] == t0].set_index("hs2")["v_miles_usd"]
            p1 = pb[pb["anio"] == t1].set_index("hs2")["v_miles_usd"]
            m0 = imp[imp["anio"] == t0].set_index("hs2")["importaciones_miles_usd"]
            m1 = imp[imp["anio"] == t1].set_index("hs2")["importaciones_miles_usd"]

            if p0.empty or m0.empty or m0.sum() == 0:
                continue

            g_mercado = m1.sum() / m0.sum() - 1 if m0.sum() else None
            if g_mercado is None:
                continue

            efecto_competitividad_total = 0.0
            efecto_estructura_total = 0.0
            efecto_demanda_total = 0.0
            for hs2 in p0.index:
                if hs2 not in m0.index or hs2 not in m1.index:
                    continue
                x0 = p0[hs2]
                x1 = p1.get(hs2, 0.0)
                g_c = m1[hs2] / m0[hs2] - 1 if m0[hs2] else 0.0
                efecto_demanda_total += x0 * g_mercado
                efecto_estructura_total += x0 * (g_c - g_mercado)
                efecto_competitividad_total += x1 - x0 * (1 + g_c)

            filas.append({
                "pais_iso3": iso3,
                "anio": t1,
                "efecto_demanda_mercado": round(efecto_demanda_total, 2),
                "efecto_estructura": round(efecto_estructura_total, 2),
                "efecto_competitividad": round(efecto_competitividad_total, 2),
            })

    df = pd.DataFrame(filas)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT / "shift_share_panel.csv", index=False)
    print(f"Escrito {OUT / 'shift_share_panel.csv'} ({len(df)} filas, "
          f"{df['pais_iso3'].nunique()} socios, años {df['anio'].min()}-{df['anio'].max()})")


if __name__ == "__main__":
    main()
