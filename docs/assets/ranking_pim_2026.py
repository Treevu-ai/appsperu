# -*- coding: utf-8 -*-
"""Genera docs/assets/ranking_pim_2026.png — PIM 2026 por departamento (top 15)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np

# Datos: (departamento, PIM en millones S/, zona geográfica)
data = [
    ("Lima",         25_900, "costa"),
    ("La Libertad",   6_200,  "costa"),
    ("Piura",         5_100,  "costa"),
    ("Cusco",         4_700,  "selva"),
    ("Arequipa",      4_500,  "sierra"),
    ("Cajamarca",     4_100,  "sierra"),
    ("Lambayeque",    3_400,  "costa"),
    ("Junín",         3_200,  "sierra"),
    ("Puno",          3_100,  "sierra"),
    ("Áncash",        3_000,  "sierra"),
    ("Loreto",        2_900,  "selva"),
    ("Ica",           2_700,  "costa"),
    ("San Martín",    2_600,  "selva"),
    ("Ayacucho",      2_400,  "sierra"),
    ("Huánuco",       2_100,  "selva"),
]

departments, pims, zones = zip(*data)

# Paleta por zona
ZONE_COLORS = {
    "costa":  "#10b981",   # verde — Rastro accent
    "sierra": "#3b82f6",   # azul
    "selva":  "#f59e0b",   # ámbar
}

colors = [ZONE_COLORS[z] for z in zones]

# Figura horizontal bars — 900×520
fig, ax = plt.subplots(figsize=(9, 5.2), facecolor="#0d1117")
ax.set_facecolor("#0d1117")

y = np.arange(len(departments))
bars = ax.barh(y, pims, color=colors, height=0.62, edgecolor="none")

# Números dentro de la barra (o al lado si es corto)
for bar, val in zip(bars, pims):
    x_end = bar.get_width()
    label = f"S/ {val:,.0f}M"
    if x_end > 3_500:
        ax.text(x_end - 200, bar.get_y() + bar.get_height() / 2,
                label, va="center", ha="right",
                color="#0d1117", fontsize=7.8, fontweight="bold", fontfamily="monospace")
    else:
        ax.text(x_end + 80, bar.get_y() + bar.get_height() / 2,
                label, va="center", ha="left",
                color="#9ca3af", fontsize=7.5, fontfamily="monospace")

ax.set_yticks(y)
ax.set_yticklabels(departments, color="#e6edf3", fontsize=8.5)
ax.tick_params(axis="y", length=0)
ax.invert_yaxis()

ax.xaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}M"))
ax.tick_params(axis="x", colors="#6b7280", labelsize=7.5)
ax.set_xlim(0, 30_500)
ax.spines[["top", "right", "left"]].set_visible(False)
ax.spines["bottom"].set_color("#21262d")
ax.tick_params(axis="x", pad=6)

# Leyenda
from matplotlib.patches import Patch
legend_elems = [
    Patch(facecolor="#10b981", label="Costa"),
    Patch(facecolor="#3b82f6", label="Sierra"),
    Patch(facecolor="#f59e0b", label="Selva"),
]
ax.legend(handles=legend_elems, loc="lower right",
          frameon=False, labelcolor="#9ca3af",
          fontsize=7.5, handlelength=1.2, handleheight=0.8)

# Título y fuente
ax.text(0.5, 1.04, "PIM 2026 — Inversión pública por departamento",
        transform=ax.transAxes, ha="center", va="bottom",
        color="#e6edf3", fontsize=10.5, fontweight="bold")
ax.text(0.5, 1.01, "Millones de soles | Fuente: MEF Consulta Amigable, corte ago 2026",
        transform=ax.transAxes, ha="center", va="bottom",
        color="#6b7280", fontsize=7)

# Grid sutil
ax.xaxis.grid(True, color="#1f2937", linewidth=0.6, alpha=0.8)
ax.set_axisbelow(True)

plt.tight_layout(rect=[0, 0, 1, 0.93])
out = "C:/Users/acuba/appsperu/docs/assets/ranking_pim_2026.png"
fig.savefig(out, dpi=180, bbox_inches="tight",
            facecolor="#0d1117", edgecolor="none")
print(f"OK: {out}")
