# Análisis avanzados (scripts 20-28)

Extienden el núcleo del proyecto (scripts 16-18) con las mejoras metodológicas y de
identificación que habilita la muestra grande (184 socios × 2016-2024) y los insumos
de producto/acuerdos ya disponibles en `data/raw/`.

## Resumen

| Script | Análisis | Resultado clave |
|---|---|---|
| `20_ppml_gravedad.py` | PPML (Poisson), Gamma PML, márgenes, con/sin ceros | El efecto de OLS (0.667***) y Gamma PML (0.696***) **no se sostiene en PPML** (0.157 ns / 0.381 ns); margen extensivo nulo |
| `21_export_baci_producto.py` | Extrae Perú→socios por HS4 y matriz país×HS4 (2015/2024) desde BACI | 226,269 filas de exportaciones; matriz país↔producto |
| `22_gravedad_producto.py` | Gravedad por producto (PPML, FE socio+año+HS2) | Sin efecto positivo dentro de producto; interacción WGI×PCI negativa (-0.58*) |
| `23_did_cptpp_fta.py` | Acuerdos comerciales (RTA) + DiD/event study CPTPP (sep-2021) | El WGI sobrevive al control de acuerdo (0.655***); DiD CPTPP ≈ 0 (p=0.90) |
| `24_iv_gravedad.py` | 2SLS con instrumentos: \|latitud\| y gobernanza regional (LOO) | F 1ª etapa 39-67; 2SLS 0.70-0.96**; Sargan p=0.021 (validez discutible) |
| `25_panel_dinamico.py` | Panel dinámico Anderson-Hsiao (2SLS en diferencias) | Persistencia ρ≈0.52; β(WGI) no significativo dentro del país |
| `26_dml_oster.py` | Double ML (Robinson) + curva de especificaciones + Oster | DML θ=0.705***; 32/32 especificaciones positivas y significativas; Oster δ=2.58 |
| `27_complejidad_producto.py` | ECI/PCI (Hidalgo-Hausmann) y densidad de productos | Perú ECI = -0.72 (2024); oportunidades adyacentes a recursos |
| `28_libro_resultados_avanzados.py` | Compila todo en `../analisis_avanzados_wgi.xlsx` | — |

## Veredicto

La asociación gobernanza–exportaciones es **fuerte y estable en niveles entre países**
(OLS, DML, IV, curva de especificaciones, Oster: todos positivos y significativos), pero
**desaparece en la variación dentro del país o dentro de producto** (PPML, gravedad por
producto, panel dinámico, primeras diferencias). Conclusión: **asociación robusta, no
efecto causal** — consistente con la literatura y con el diagnóstico de los scripts 16-18.

## Cómo correr

```bash
cd scripts
python _comun_gravedad.py            # smoke test del módulo común
python 20_ppml_gravedad.py
python 21_export_baci_producto.py --zip ../data/raw/BACI_HS92_V202601.zip   # ~min
python 22_gravedad_producto.py       # requiere 21_ y 27_ corridos
python 23_did_cptpp_fta.py
python 24_iv_gravedad.py
python 25_panel_dinamico.py
python 26_dml_oster.py
python 27_complejidad_producto.py    # requiere 21_ corrido
python 28_libro_resultados_avanzados.py
```

## Salidas

- `../results_avanzados/*.csv` — una tabla por análisis.
- `../analisis_avanzados_wgi.xlsx` — libro con hoja `Resumen` + 10 hojas de resultados.
- `../data/processed/panel_gravedad_con_ceros.csv` — panel balanceado con ceros (margen extensivo).
- `../data/processed/panel_gravedad_producto_hs4.csv` — panel Perú→socio × HS4 (198k filas).

## Insumos nuevos usados de `data/raw/`

- `wb_countries_raw.json` — región, nivel de ingreso y **latitud** por país (Banco Mundial).
- `rta_20260111_csv.zip` — acuerdos comerciales bilaterales CEPII (variable `rta`).
- `BACI_HS92_V202601.zip` — comercio por producto HS6→HS4 (CEPII).

## Caveats

- El panel "con ceros" solo incorpora socios que comercian al menos un año; no captura
  socios con cero en todos los años. El margen extensivo es, por tanto, parcial.
- Los instrumentos IV son plausibles pero no incuestionables (Sargan rechaza la
  sobreidentificación con dos instrumentos; la gobernanza regional puede tener reflexión).
- La curva de especificaciones varía muestra/controles/rezago/FE, no el diseño (todos son
  modelos en niveles entre países), por lo que su estabilidad no resuelve la causalidad.
- `pci_2015` es una característica predeterminada del producto, no la exposición causal
  exacta (la literatura usa Rauch/Nunn; el PCI es un proxy computado desde BACI).
