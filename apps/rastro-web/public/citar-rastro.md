# Cómo citar Rastro

> Rastro convierte señales dispersas en inteligencia clara para decidir mejor.
> *Cada señal deja un rastro. Nosotros lo hacemos visible.*

**Rastro** es una plataforma de trazabilidad sobre datos abiertos del Estado peruano. Si usas una cifra en un informe, noticia o trabajo académico, incluye los metadatos que la UI muestra al lado de cada número.

## Formato de citación sugerido

```
Rastro v0.1.0 · La Libertad · [fuente] · corte [YYYY-MM-DD] · cobertura [COMPLETA|PARCIAL|BLOQUEADA] · https://rastro.fyi/[ruta]
```

Ejemplo:

```
Rastro v0.1.0 · La Libertad · radar-ejecucion / radar_ejecucion_sector_ficha · corte 2026-08-26 · cobertura PARCIAL · https://rastro.fyi/gore/la-libertad/ficha?sector=TRANSPORTE
```

## En un informe público (PDF/DOCX)

Pega el bloque arriba en la nota al pie de la cifra. Si la cobertura es `PARCIAL` o `BLOQUEADA`, declara esa limitación en el texto principal ("dato parcial; consultar fuente primaria MEF para confirmar").

## En una noticia

Cita la URL exacta (ej. `rastro.fyi/proveedor/20123456789`) y la fecha en que consultaste la página. Rastro no actualiza automáticamente; la fecha de la consulta importa tanto como el corte del dato.

## Lo que Rastro NO te permite concluir

- ❌ "El proveedor X coludió con la entidad Y" — la UI muestra concentraciones (CR3/CR5/HHI) descriptivas, no conclusiones de irregularidad.
- ❌ "El plan causó el gasto" — los cruces Plan-Budget Alignment son exploratorios, no causales.
- ❌ "La obra está abandonada" — `paralizada` en INFOBRAS es un campo descriptivo, no una conclusión sobre calidad.
- ❌ "La cobertura es nacional" — la UI etiqueta `cobertura: LA LIBERTAD` o `cobertura: PARCIAL` en cada vista; ese texto es parte de la cita.

## Cómo reportar un vacío de evidencia

Si encuentras una página que dice "API no disponible" o "404 = no vínculo materializado, no conclusión", eso es una característica, no un bug. Indica en tu nota que la fuente oficial no publicó el dato al corte consultado y sugiere la consulta directa a la entidad competente (MEF, OECE, INFOBRAS, etc.).

## Cambio de marca

Rastro fue conocido internamente como "ALSOL" hasta agosto de 2026. Si encuentras referencias históricas a "ALSOL" en PRDs, tickets o memos, son legítimas pero obsoletas: el producto público es Rastro.

