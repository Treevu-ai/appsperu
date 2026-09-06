# Data contract — MTC/Provías Descentralizado (Intervenciones en Redes Viales Subnacionales)

> Ficha técnica del conector: [`docs/conectores.md#red-vial-subnacional`](../conectores.md#red-vial-subnacional).
> Fase 0 + construcción el mismo día (2026-09-06). **Resuelto con ayuda del usuario**: el fetch
> automático sobre la página del dataset no lograba renderizar el recurso real (contenido
> cargado dinámicamente); el usuario navegó la página en un browser normal y compartió el enlace
> directo, que sí resolvió.

## Fuente confirmada

- **Descarga directa real**: `https://www.datosabiertos.gob.pe/sites/default/files/1_Dataset_Intervenciones_PVD_30062026.csv`
  — confirmado 2026-09-06, 3 MB, CSV `;`-delimitado, **Latin-1** (no UTF-8 — mojibake confirmado
  en nombres de ruta con caracteres especiales, ej. "Ara�ane").
- El nombre de archivo trae la fecha de corte embebida (`_30062026` = 30/06/2026) — no
  confirmado si es 100% predecible entre cortes o si requeriría volver a navegar la página para
  descubrir el nombre real (mismo tipo de incertidumbre que RENAMU tenía antes de confirmarse).
- **Página del dataset (`datosabiertos.gob.pe/dataset/...`) no renderiza el recurso a un fetch
  automático** — a diferencia de MINEDU (donde decodificar entidades HTML fue suficiente), acá
  ni siquiera con esa técnica apareció el link; se resolvió con el enlace que el usuario obtuvo
  navegando manualmente.

## Schema real confirmado (27 columnas)

```
ID_INTERVENCION, CODIGO_UNICO_INVERSION, CODIGO_PROVISIONAL, JERARQUIA, CODIGO_RUTA,
TRAYECTORIA, INICIO, FINAL, IDDPTO, IDPROV, DEPARTAMENTO, PROVINCIA, NORMA,
PROCESO_JERARQUIZACION, TIPO_RECLASIFICACION, TIPO_MODIFICACION_JERARQUIA,
CODIGO_RUTA_RECLASIFICACION, ESTADO, SUPERFICIE, " CONVENIO" (con espacio inicial),
LONGITUD, RESPONSABLE, COMPONENTE, "CORREDOR VIAL ALIMENTADOR" (con espacios), NIVEL_INTERVENCION,
TRAMO, FECHA_CORTE
```

- **12,536 filas nacional**. Nivel de detalle: **ruta/tramo dentro de una provincia** (gestión
  de Provías Descentralizado — redes departamentales/vecinales) — no baja a distrito exacto, una
  ruta puede cruzar más de uno.
- **`(ID_INTERVENCION, CODIGO_RUTA, TRAMO)` no es clave única** (10,430 `ID_INTERVENCION`
  distintos de 12,536 filas — una intervención puede repetirse en más de un tramo/ruta) — se usa
  un hash de contenido como clave de upsert, mismo patrón que `infracciones-ambientales`.
- **Valores ausentes representados como `-`**, igual que RUIAS (OEFA).
- **`LONGITUD` con punto decimal** (a diferencia de RUIAS, que usa coma) — confirmado con filas
  reales, no asumido.
- **Nombres de provincia con tildes inconsistentes** entre filas del mismo departamento (ej.
  `"VIRU"` y `"VIRÚ"`, `"GRAN CHIMU"` y `"GRAN CHIMÚ"` aparecen como valores distintos en La
  Libertad) — **no normalizado en esta versión**; un `GROUP BY provincia` cuenta estas variantes
  por separado. Limitación conocida, documentada, no oculta.
- Sin dato de persona natural: es infraestructura (rutas, tramos, estado de conservación), no
  contratistas ni personal.

## Cobertura real para La Libertad (verificado en vivo, 2026-09-06)

**461 filas**, presencia en las 12 provincias (con la salvedad de la duplicación de tildes
arriba — el conteo real de provincias "limpias" sería menor a 12 combinando variantes).

## Pendiente / limitaciones conocidas

1. **Normalización de tildes en `PROVINCIA`** — no resuelta, documentada como limitación.
2. **Estabilidad del nombre de archivo entre cortes** — no confirmada; si el patrón cambia, el
   conector fallará con un 404 explícito (no falla en silencio).
3. Diccionario de datos (`.xlsx`, mencionado en el dataset) no decodificado — las columnas ya
   son suficientemente auto-descriptivas para esta versión.
