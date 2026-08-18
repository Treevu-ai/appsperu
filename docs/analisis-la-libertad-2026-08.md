# Análisis — La Libertad: brechas y competitividad (2026-08)

Primer análisis de contenido construido con las 5 apps de Follow the Sol, con datos reales
verificados en vivo contra cada base (no cifras de prensa ni estimaciones). Pensado como
insumo para contenido público (LinkedIn); documentado acá para no perderlo en el chat y para
que sea reproducible.

## Hallazgos verificados (2026-08-18)

### 1. Presupuesto y ejecución (`radar-ejecucion`, año fiscal 2026 a julio)

| Nivel de gobierno | PIM (presupuesto) | Devengado (ejecutado) | Avance |
|---|---|---|---|
| Gobiernos Regionales | S/ 4,558.8M | S/ 2,242.1M | **49.2%** |
| Gobiernos Locales (84 municipios) | S/ 2,738.0M | S/ 1,092.5M | **39.9%** |

Con ~58% del año calendario transcurrido a julio, ambos niveles van rezagados frente al
calendario — los gobiernos locales, más que el regional (~10 puntos de diferencia).

**Nota de calidad de dato**: esta cifra requirió un fix de ingesta el 2026-08-18 — el MEF no
puebla `MONTO_PIA`/`MONTO_PIM` en las filas de movimiento mensual del CSV, solo en filas
separadas `MES_EJE=0` (presupuesto de apertura/modificado). Ver
`docs/data-contracts/mef-presupuesto-ejecucion.md` para el detalle completo y
`ingestMefFullYearForDepartamento` en `mef-connector.ts` para la ingesta que lo corrige.
Gasto nacional dirigido a la región (programas con sede en Lima que ejecutan metas ahí) queda
fuera de esta tabla — es un concepto aparte (`meta_departamento`), no ejecución propia.

### 2. Obras públicas (`infobras`)

- 10,134 obras trazadas, **252 paralizadas (2.5%)**.
- Causales más frecuentes: "incumplimiento de contrato" (31 casos) y "no pago de
  valorizaciones" (25) — **superan a "conflictos sociales" (20)** como causa de parálisis.
  Fenómenos climatológicos + eventos climáticos suman 33 casos combinados.
- Caso extremo: una obra de AGRO RURAL (canal de irrigación) lleva **2,312 días
  paralizada** (más de 6 años).

### 3. Inversiones (`radar-inversiones`)

- 1,612 proyectos activos, **658 (40.8%) con sobrecosto** (costo actualizado > monto viable).
- Total viable S/ 8.84 mil millones → costo actualizado S/ 9.90 mil millones (+12% agregado).
- Sobrecosto más extremo: saneamiento en Bolívar (Municipalidad Provincial de Bolívar), de
  S/ 8.9M a S/ 45M (**+405%**).

### 4. Compras públicas (`compras-publicas`)

- 144 procesos, 56 entidades compradoras, S/ 248.1M adjudicados a 196 proveedores.
- Un solo proveedor (CAM SERVICIOS DEL PERÚ S.A.) concentra **26.9% del valor adjudicado**
  con solo 2 contratos.
- **Caveat importante**: muestra parcial (144 procesos), no el universo — no usar como cifra
  de concentración de mercado sin ese disclaimer explícito.

### 5. Contexto nacional (`ceplan-estrategico`, ObservaPerú — agregado, no específico de
   La Libertad)

- A nivel país, los Gobiernos Regionales ejecutan en promedio 95.1% del presupuesto (CUMP03,
  2024) pero solo logran 73.7% de avance físico (CUMP02, 2024) — brecha de ~21 puntos.
- Sirve como marco de comparación, no como dato de La Libertad — el cruce por nivel de
  gobierno con `radar-ejecucion` (`GET /api/crossref` en `ceplan-estrategico/api`) da SEG y
  Execution Efficiency reales una vez que ambas fuentes compartan el mismo año fiscal
  (CEPLAN llega a 2024/2025, `radar-ejecucion` solo tiene 2026 ingerido).

## Draft del post (LinkedIn)

> **La Libertad ya gastó más de la mitad del año fiscal 2026. Su presupuesto no.**
>
> Con datos abiertos del MEF, cruzados y verificados en vivo (no cifras oficiales de prensa,
> sino la data cruda de "Consulta Amigable" reconstruida fila por fila):
>
> 📊 **Gobierno Regional La Libertad**: S/ 4,558.8M asignados → S/ 2,242.1M ejecutados =
> **49.2% de avance**
> 📊 **Gobiernos locales de la región** (84 municipios): S/ 2,738.0M asignados →
> S/ 1,092.5M ejecutados = **39.9% de avance**
>
> A julio, ya pasó el 58% del año calendario. Ninguno de los dos niveles va al ritmo del
> calendario — y los municipios van casi 10 puntos más atrás que el gobierno regional.
>
> ¿Por qué importa esto más allá del número? Porque el rezago en ejecución no es abstracto —
> tiene una cara: 252 obras públicas paralizadas en la región, y no son mayormente por "mala
> suerte" climática. Las causales más frecuentes son **incumplimiento de contrato** y **falta
> de pago de valorizaciones** — es decir, gestión, no clima. Una obra de infraestructura
> agraria lleva **2,312 días paralizada**. Más de seis años.
>
> El gasto público no se mide solo en cuánto se asigna. Se mide en cuánto llega a convertirse
> en resultado.
>
> ---
>
> *Metodología: datos abiertos del MEF (presupuesto/ejecución) e INFOBRAS (Contraloría),
> descargados y cruzados directamente desde sus fuentes oficiales. Cifras a julio 2026, año
> fiscal en curso — no son un corte oficial de cierre. Trabajo de código abierto en
> construcción.*
>
> #DatosAbiertos #LaLibertad #GestiónPública #TransparenciaFiscal #OpenData

## Ángulos pendientes para próximos posts

1. **Sobrecosto silencioso de la inversión pública** — 40.8% de proyectos activos con
   variación al alza, caso Bolívar (+405%) como gancho.
2. **Concentración de compras públicas** — con el caveat de muestra parcial explícito en el
   mismo post, no como letra chica.
3. **La brecha gasto vs. resultado físico** (SEG/Execution Efficiency) — pendiente de que
   `ceplan-estrategico` y `radar-ejecucion` compartan el mismo año fiscal ingerido para
   calcularlo con datos reales de La Libertad, no solo el promedio nacional de CEPLAN.

## Reproducibilidad

Todas las cifras de este documento vienen de queries SQL directas contra las 5 bases locales
(Postgres, `docker compose up -d` por app — ver `docs/ESTADO.md`), corridas el 2026-08-18.
No hay endpoint único que devuelva este análisis consolidado todavía — es trabajo manual de
síntesis sobre datos ya ingeridos por cada app.
