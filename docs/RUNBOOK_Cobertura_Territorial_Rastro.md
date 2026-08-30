# Runbook — corte territorial verificable de Rastro

**Propósito:** producir y revisar un corte reproducible desde terminal. No actualiza interfaces ni convierte una descarga en una certificación del universo público.

## 1. Punto de control obligatorio

Antes y después de una corrida, ejecutar desde `apps/radar-ejecucion/api`:

```powershell
npm run cobertura:territorial -- --todas --require-complete
```

- El JSON enumera las nueve aplicaciones y sus restricciones.
- El código de salida `2` significa que una o más capas no pueden declararse completas; es el resultado esperado hasta cerrar su evidencia.
- `COMPLETA_VERIFICADA` requiere lote, corte, conteos persistidos y fuente recorrida hasta su límite declarado.

Consulta acotada:

```powershell
npm run cobertura:territorial -- --app compras-publicas --jurisdiccion PIURA
```

## 2. Corridas fuente por fuente

Usar siempre una lista explícita de jurisdicciones y conservar en el log: fecha, parámetros, URL/recurso, lote, filas fuente, filas normalizadas, persistidas, rechazadas y restricción.

| Fuente | Conector | Regla de publicación |
|---|---|---|
| INFOBRAS | `apps/infobras/api` | El XLSX puede ser nacional, pero una región solo queda completa después de una corrida persistente con sus conteos. Valores porcentuales se conservan sin reescalarlos. |
| Invierte.pe | `apps/radar-inversiones/api` | Una ventana `Range` es parcial. Solo la continuidad comprobada desde byte 0 hasta `Content-Length` habilita completitud. |
| OECE OCDS | `apps/compras-publicas/api` | Registrar página inicial/final, filtros y `links.next`. Solo una ruta sin filtros desde la página 1 hasta terminal puede marcarse completa. |
| SEACE menores 8 UIT | `apps/compras-publicas/api` | Registrar código departamental, todas las páginas expuestas y fallas de detalle. La interfaz observada no equivale a una API documentada ni certifica el universo no expuesto. |
| MEF | `apps/radar-ejecucion/api` | No reutilizar offsets de La Libertad. Validar sección, `MES_EJE=0`, nivel de gobierno, bytes y devengado antes de comparar regiones. |

Para Invierte, la corrida completa usa cinco rangos aproximados con el tamaño actualmente expuesto por la fuente y solo inserta el corte verificable después del último rango:

```powershell
Set-Location C:\Users\acuba\appsperu
.\scripts\run-invierte-full.ps1
```

Si la fuente cambia el `Content-Length`, el ejecutor vuelve a calcular los rangos; ante una falla no publica una fila `COMPLETA_VERIFICADA`.

Al terminar, verificar antes de publicar o versionar el corte:

```powershell
Set-Location C:\Users\acuba\appsperu
.\scripts\verify-invierte-full.ps1
```

## 3. Fallas, pausas y reanudación

1. No borrar lotes ni sustituir una fila parcial por una fila completa manualmente.
2. Registrar la fuente y el parámetro que falló; si el conector no alcanzó `COMMIT`, el reporte seguirá en `BLOQUEADA` y ello es correcto.
3. Reanudar solamente desde el rango, página o jurisdicción que quedó pendiente; después volver a ejecutar el punto de control.
4. Si cambió el esquema, checksum o columnas de origen, detener la publicación y abrir una corrección del normalizador.

## 4. Condiciones para comunicar resultados

- Usar “según el corte expuesto por la fuente” para `PARCIAL` y `SIN_DATOS_EN_FUENTE`.
- No inferir actividad, incumplimiento o irregularidad por una fila ausente.
- Distinguir presupuesto, adjudicación, proveedor, obra y resultado físico; solo enlazar con CUI, RUC, OCID, UBIGEO, código SEACE o un método de concordancia con confianza declarada.
