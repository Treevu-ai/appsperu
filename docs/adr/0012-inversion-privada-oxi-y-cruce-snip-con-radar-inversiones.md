# ADR-0012: `inversion-privada` — OxI (Obras por Impuestos en promoción) y cruce por código con `radar-inversiones`

- Estado: Aceptado — implementado en `apps/inversion-privada`.
- Fecha: 2026-08-28
- Ámbito: segunda fuente PROINVERSIÓN/VERTIX dentro de `inversion-privada` — cartera OxI en
  promoción, con un cruce exacto (no fuzzy) contra `radar-inversiones` (Invierte.pe).

## Contexto

`ADR-0011` dejó OxI explícitamente fuera de alcance ("pendiente parseo del XLSX"). El data
contract (`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`) tenía el endpoint
`investmentpromotionExport.php` confirmado como contenedor válido (XLSX en base64), pero sin
columnas documentadas.

Un mensaje de producto del 2026-08-28 sobre `inversion-privada` afirmó, adelantándose al
código, que OxI "trae código SNIP" y permite un cruce confirmado con Invierte.pe. El memo
`docs/MEMO_LA_LIBERTAD_INVERSION_PUBLICA_PRIVADA_2026-08-28.md` señaló esa brecha entre el
mensaje y el estado real de la app. Este ADR cierra la brecha.

Investigación en vivo (2026-08-28): el POST a `investmentpromotionExport.php` con `Lan=es`
responde un XLSX real (~122 KB) sin autenticación. A diferencia del XLSX de INFOBRAS (streaming
por tamaño, sin shared strings, namespace `x:`), este archivo es pequeño (~760 filas), usa
shared strings, y no tiene prefijo de namespace. Cabecera real en la fila `r="10"`, columna L
(`CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA`) es el candidato de cruce. Corte verificado: 761
registros nacional, 55 en La Libertad — coincide con los números citados en el mensaje de
producto original.

## Decisión

### Modelo canónico

- `raw_oxi_batches` — lake de evidencia (checksum del XLSX + `records_total` leído de la celda
  de metadata `"Nº Registros: NNN"`, no hay campo estructurado para el total). Sin `payload`
  JSONB (el XLSX es binario, no JSON — distinto de `raw_vertix_batches`).
- `oxi_investment_promotions` — un registro por `oxi_id` (columna `N°`), upsert en cada
  ingesta. Guarda `codigo_referencia` tal cual viene en la fuente (sin renombrarlo a
  `codigo_snip`) porque la columna de origen mezcla tres sistemas de código — renombrarla
  implicaría afirmar algo que la fuente no garantiza.

**Tabla separada de `private_investment_projects`, misma app.** OxI y APP/PA comparten
plataforma VERTIX pero son universos de financiamiento distintos (impuestos con reembolso vs.
concesión/activo) — no hay razón para fusionarlos en una tabla, y el modelo separado deja claro
que la ausencia de OxI en `private_investment_projects` (o viceversa) no es un bug.

### Connector

`oxi-connector.ts`:

- POST multipart (`Lan=es`) a `investmentpromotionExport.php`, decodifica `Data` (base64) a
  `Buffer`.
- Parsea el XLSX completo en memoria vía `unzipper.Open.buffer()` (misma librería que
  `infobras`, ya dependencia del monorepo) — resuelve shared strings, a diferencia del parser
  de `infobras-connector.ts` que no las necesita para su archivo.
- `npm run ingest:oxi` — manual, snapshot completo. Verificado: `recordsTotal: 761`,
  `rowsUpserted: 761` (0 filas rechazadas en el corte de referencia).

### API

```
GET /api/oxi?departamento=LA+LIBERTAD&funcion=&fase=&entidad=
GET /api/oxi/:oxiId
GET /api/crossref/oxi?departamento=LA+LIBERTAD   (default LA LIBERTAD)
```

`GET /api/crossref/oxi` agrega OxI del departamento por `codigo_referencia`, cruza en capa de
aplicación (segundo pool de solo lectura hacia `radar-inversiones`, mismo patrón que
`infobras/src/routes/crossref.ts`) contra `investments.codigo_snip`, y devuelve un `resumen`
con `totalOxi`, `conCodigoReferencia` y `confirmadosEnInvierte` — para que cualquier cifra de
match citada en un memo venga de una tasa real, no estimada.

**Resultado verificado (La Libertad, 2026-08-28)**: 55 proyectos OxI, 52 con código en L, 45
matchean exactamente un `codigo_snip` de Invierte.pe — con nombres de proyecto casi idénticos
entre ambas fuentes, lo que corrobora que el match no es coincidencia numérica.

## Alternativas consideradas

**Asumir que toda la columna L es `codigo_snip`** — descartada. El nombre de columna de la
fuente (`CODIGO SNIP / INVIERTE.PE / CÓDIGO IDEA`) es explícito sobre mezclar tres sistemas;
tratar cualquier valor como SNIP sin verificar habría inflado artificialmente la tasa de match.

**Fusionar OxI en `private_investment_projects`** — descartada, ver "Modelo canónico" arriba.

**Usar ExcelJS/`xlsx` en vez de parseo manual** — descartada por consistencia: `infobras` ya
estableció el patrón de parseo manual por regex sobre el XML crudo con `unzipper` en este
monorepo (ver comentario en `infobras-connector.ts:144-154`); se mantiene el mismo enfoque acá,
extendido para resolver shared strings.

## Consecuencias

- Cierra la brecha entre el mensaje de producto del 2026-08-28 y el estado real del código.
- Habilita un cruce OxI ↔ Invierte.pe genuino (no por nombre) para el memo territorial y para
  el ecosistema MCP.
- El match no es 100% — 3 de 55 proyectos OxI de La Libertad no tienen código en L, y 7 de los
  52 con código no matchean ningún `codigo_snip` en la muestra actual de `radar-inversiones`
  (que además es PARCIAL — snapshot por ventana de bytes del CSV, no el 100% de Invierte.pe;
  ver el memo territorial, sección 6). Un "no match" no es evidencia de que el proyecto no
  exista en Invierte.pe.
- Sigue sin scheduler — ingesta manual, igual que el resto del proyecto.
- El GIS de VERTIX (`gis-vertix`) y la corrida de regresión periódica del spike original siguen
  pendientes; no se resuelven en este ADR.

## Referencias

- Spike: `docs/adr/0010-research-spike-proinversion-vertix-cartera-app-pa-oxi.md`
- ADR previo: `docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`
- Data contract: `docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`
- Memo que originó este trabajo: `docs/MEMO_LA_LIBERTAD_INVERSION_PUBLICA_PRIVADA_2026-08-28.md`
