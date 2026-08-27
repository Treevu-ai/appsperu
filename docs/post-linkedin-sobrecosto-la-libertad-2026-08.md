# Post LinkedIn — Vigía del presupuesto: Sobrecosto en inversiones de La Libertad

**Fecha de publicación sugerida:** semana del 2026-08-27  
**Fuente de todos los números:** MEF / Invierte.pe (`DETALLE_INVERSIONES.csv`), consulta directa 2026-08-27. Metodología en `docs/informe-sobrecosto-inversiones-la-libertad-2026-08.md`.

---

## Post

Casi **4 de cada 10** proyectos de inversión pública activos en La Libertad ya cuestan más de lo que costaban cuando se declararon viables.

No es una estimación. Es lo que dice el propio Banco de Inversiones del MEF, cruzado fila por fila para **7,970 proyectos** del departamento:

→ Cartera viable: **S/ 45.9 mil millones**  
→ Costo actualizado hoy: **S/ 56.4 mil millones**  
→ Diferencia: **+S/ 10.5 mil millones (+22.8%)**

El dato que más me llamó la atención no es el promedio. Es la **concentración**:

Solo **452 proyectos** — el **5.7%** del total — tienen una variación de costo **superior al 100%**. Esos pocos proyectos explican **el 70% de todo el sobrecosto en soles** (S/ 7.3 mil millones).

¿Quién arrastra el peso?

→ **Chavimochic III** (Gobierno Regional): de S/ 1,847M a S/ 4,067M. Solo ese CUI suma **+S/ 2.2 mil millones** de variación.

→ **Tres proyectos de protección contra inundaciones** del GORE en Trujillo: más de **S/ 1.7 mil millones** de delta adicional entre los tres.

→ **Transporte** y **salud** concentran los mayores deltas por función: S/ 1,621M y S/ 1,396M respectivamente.

→ A nivel municipal, la **Municipalidad Provincial de Bolívar** tiene **67.9%** de sus proyectos activos con costo actualizado por encima del viable (+74.2% agregado en su cartera).

Aclaración importante: esto **no es una acusación**. En Invierte.pe, "costo actualizado superior al monto viable" es una **variación de registro** — puede reflejar ampliación de alcance, estudios adicionales, contingencias o, también, mala planificación. Lo que no puede hacerse es ignorarlo: son **S/ 10.5 mil millones** de diferencia publicada en datos abiertos.

Lo construí con ALSOL (Follow the Sol): descarga completa del CSV nacional del MEF en 5 rangos HTTP, filtrado por La Libertad, sin hojas de cálculo manuales ni cifras de prensa. Cualquiera puede repetirlo con el script documentado en el repo.

¿Qué megaproyecto de tu región quieres que audite así?

#DatosAbiertos #TransparenciaFiscal #LaLibertad #InversiónPública #GestiónPública #VigíaDelPresupuesto

---

## Primer comentario (publicar inmediatamente después del post)

Cómo se construyó esto, para quien quiera repetir el ejercicio:

1️⃣ **Fuente oficial** — `DETALLE_INVERSIONES.csv` del MEF (Invierte.pe / Banco de Inversiones). 246 MB, una fila por CUI. Última modificación de fuente: 2026-08-23.

2️⃣ **Definición de sobrecosto** — `COSTO_ACTUALIZADO > MONTO_VIABLE`, ambos publicados y con monto viable > 0. Es la señal que el propio diccionario del MEF permite comparar. No infiere corrupción.

3️⃣ **Universo** — 7,970 proyectos con `ESTADO = ACTIVO` y `DEPARTAMENTO = LA LIBERTAD`. Un memo anterior citaba 1,612 proyectos porque usaba solo el primer bloque del archivo; este análisis recorre el CSV completo.

4️⃣ **Concentración** — el 70% del delta en soles viene de 452 proyectos con variación >100%. Sin mirar la cola extrema, se subestima el problema.

5️⃣ **Lo que NO cruza** — variación de costo en Invierte.pe no se conecta automáticamente con avance físico (INFOBRAS) ni con devengado presupuestal (MEF mensual) sin CUI exacto. Son evidencias separadas.

Script reproducible: `scripts/analisis-sobrecosto-la-libertad.mjs`  
Informe completo: `docs/informe-sobrecosto-inversiones-la-libertad-2026-08.md`

---

## Nota de rigor (no publicar, es para revisión interna)

- Todos los montos son `MONTO_VIABLE` y `COSTO_ACTUALIZADO` tal como los reporta Invierte.pe a la fecha de corte — no son pagos realizados ni liquidaciones de obra.
- Evitar en comentarios o réplicas frases que impliquen corrupción o direccionamiento; la evidencia solo sostiene variación de registro publicada.
- Las intervenciones IRI del MINEDU muestran variaciones % extremas (hasta +16,000%) en montos viables residuales muy bajos; no incluir en el post principal para no distorsionar la lectura — el foco son los megaproyectos y la concentración en la cola.
- Chavimochic III (CUI 2077997) concentra >21% del delta regional; verificar que el post no lea como "Chavimochic es un fraude" — es el proyecto con mayor variación absoluta en la cartera activa.
- Paranday y otros casos del memo de turismo no aplican aquí; este post es exclusivamente inversión pública (Invierte.pe).
