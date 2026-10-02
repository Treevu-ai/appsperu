# Linter de metadata — `scripts/lint-meta.mjs`

Este linter implementa el ticket **AL3-13**: impide que la UI de Rastro
renderice un número sin su metadata (`fuente`, `cobertura`, `corte`).

## Por qué existe

El principio rector del proyecto es **"vacío de evidencia, no conclusión"**
(ver `docs/PRD_Rastro_Capa_Lectura_No_Tecnicos_v1.md`). Si una
vista muestra un número sin su fuente, cobertura y corte, el lector no
puede distinguir una cifra oficial de un placeholder. Este linter rompe
el build antes de que eso llegue a producción.

## Qué detecta

El linter escanea todos los `.tsx`/`.jsx` bajo `src/` y reporta líneas
que renderizan un número vía:

| Patrón | Ejemplo |
|---|---|
| `.toLocaleString(` | `${value.toLocaleString()}` |
| `Intl.NumberFormat(` | `new Intl.NumberFormat("es-PE").format(value)` |
| `formatNumber(` | `formatNumber(value)` (helper de `NumberWithMetadata.tsx`) |

Si la línea no está envuelta en `<NumberWithMetadata>` ni contiene
`@alsol-meta` en las 5 líneas anteriores, se reporta como infracción.

## Cómo escribir un número válido

### Opción A — usar el componente `NumberWithMetadata`

```tsx
import { NumberWithMetadata, metaNumber } from "@/components/NumberWithMetadata";

<NumberWithMetadata
  data={metaNumber(
    data.pim,
    "radar-ejecucion / radar_ejecucion_sector_ficha",
    data.corte,
    data.cobertura,
    data.matcher,
  )}
  suffix="S/"
/>
```

`metaNumber` devuelve un `WithMetadata<number>`, así que el tipo en
tiempo de compilación ya exige `fuente`, `corte`, `cobertura`. El
linter no marca esto como infracción.

### Opción B — declarar metadata adyacente con un comentario

Si por alguna razón no puedes usar el componente, agrega un comentario
`@alsol-meta` en las 5 líneas anteriores:

```tsx
// @alsol-meta { fuente: "radar-ejecucion", cobertura: data.cobertura, corte: data.corte }
const formatted = value.toLocaleString("es-PE");
```

El linter lo acepta.

## Ejemplo de violación

```tsx
// MAL: el linter rompe el build
<p>{value.toLocaleString()}</p>
```

Mensaje del linter:

```
❌ src/routes/MiVista.tsx
  L42: <p>{value.toLocaleString()}</p>

[lint-meta] 1 infracción(es). Regla: cada número debe tener metadata adyacente o pasar por <NumberWithMetadata>.
```

## Cómo correrlo

```bash
npm run lint:meta
```

Exit code `0` = OK, `1` = infracciones, `2` = error de entorno.

## Limitaciones conocidas (Sprint 11)

- El linter es regex-based, no AST. No detecta patrones exóticos como
  render de números dentro de `dangerouslySetInnerHTML` o dentro de
  strings templados complejos. En Sprint 12 se puede migrar a `ts-morph`
  si hace falta más precisión.
- El comentario `@alsol-meta` es libre; el linter no valida que los
  campos sean correctos. La validación de tipos sigue siendo trabajo del
  compilador de TypeScript.
