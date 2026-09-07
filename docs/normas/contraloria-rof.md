# ROF — Contraloría General de la República (CGR)

**Fuente**: `contraloria-rof.pdf` — texto real extraído vía `pdf-parse` (78 páginas), aprobado
por Resolución de Contraloría N° 274-2025-CG (10 de julio de 2025), con modificatorias
posteriores conocidas (RC N° 320-2025-CG, RC N° 376-2025-CG) no descargadas en esta pasada.
Descargado de `gob.pe/institucion/contraloria/normas-legales/6947844-274-2025-cg` (2026-09-07).

## Naturaleza jurídica (Artículo 1, texto real)

Entidad descentralizada de derecho público, autonomía administrativa, funcional, económica y
financiera. **Ente técnico rector del Sistema Nacional de Control** (Ley N° 27785).

## Competencia y jurisdicción (Artículo 2, texto real)

Dirigir, normar, ejecutar y supervisar el control gubernamental a cargo de los órganos del
Sistema Nacional de Control. Responsable de planificar y dirigir los servicios de control
gubernamental vía el Plan Nacional de Control y los planes anuales de control por entidad.

## Funciones generales (Artículo 3, texto real — selección relevante para Rastro)

a) Ejercer la rectoría del Sistema Nacional de Control.
b) Planificar, ejecutar y supervisar los servicios de control gubernamental.
d) **Emitir pronunciamientos institucionales e interpretar la normativa de control
   gubernamental con carácter vinculante** — base de por qué un informe de control tiene peso
   legal, no es solo un reporte técnico.
e) Supervisar el cumplimiento de recomendaciones derivadas de informes de control.
g) Elaborar y presentar al Congreso el Informe de Auditoría a la Cuenta General de la República.
h) **Dirigir, ejecutar y supervisar acciones de control ambiental** y sobre bienes del
   Patrimonio Cultural de la Nación.
l) **Recibir, registrar, examinar y fiscalizar las Declaraciones Juradas de Ingresos, Bienes y
   Rentas** de funcionarios/servidores públicos.
m) Ejercer la potestad sancionadora en materia de responsabilidad administrativa funcional.
r) Ejercer el control de desempeño de la ejecución presupuestal.

## Relación con Rastro

- `infobras`: el sistema INFOBRAS (obras públicas) es administrado por la Contraloría **como
  parte de su mandato de control gubernamental**, no como un registro estadístico neutral — un
  campo como "Existe Paralización" es un dato que la propia entidad ejecutora reporta bajo
  responsabilidad de control, no una etiqueta descriptiva sin consecuencia legal. Esto refuerza
  el criterio ya aplicado en `docs/data-contracts/infobras-obras-publicas.md`: la ausencia de un
  campo (ej. `costo_actualizado`, ver `docs/adr/0020-umbral-sobrecosto-unificado.md`) no puede
  tratarse como "sin sobrecosto" — es, en el peor caso, una omisión que el propio sistema de
  control debería perseguir, no un hecho a favor de la entidad reportante.
- `informes-control`: los informes de servicios de control (buscadorinformes.contraloria.gob.pe)
  que ingiere esta app son, por el Artículo 3.d, **pronunciamientos con carácter vinculante** —
  `esConResponsabilidad` no es una opinión editorial de la Contraloría, es la conclusión formal
  de un proceso de control con base legal (Ley N° 27785).
- El Artículo 3.h (control ambiental) es relevante como contexto para entender por qué existe
  superposición conceptual entre lo que reporta Contraloría/INFOBRAS y lo que reporta
  OEFA/RUIAS (`infracciones-ambientales`) — son mandatos distintos (control de la ejecución de
  obra vs. fiscalización ambiental de un administrado), no la misma competencia duplicada.
