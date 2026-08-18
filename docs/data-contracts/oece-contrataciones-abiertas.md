# Data contract — OECE: Contrataciones Abiertas (OCDS)

- Fuente oficial: Portal de Contrataciones Abiertas de la Compra Pública, OECE
  (Organismo Especializado para las Contrataciones Públicas Eficientes — antes OSCE).
- Confirmado en vivo el 2026-08-16 navegando el portal real.
- URL base de la API: `https://contratacionesabiertas.oece.gob.pe/api/v1`
- **El dominio antiguo `contratacionesabiertas.osce.gob.pe` ya no resuelve (DNS falla).**
  El correcto es `oece.gob.pe`, encontrado siguiendo el enlace oficial desde
  `gob.pe/52005-...` porque el nombre visible en el propio portal induce a error.

## Estado: CONFIRMADO (a diferencia del MEF, esto SÍ es una API REST/JSON real)

Documentado con OpenAPI 3.0, panel Swagger interactivo ("Try it out") en
`https://contratacionesabiertas.oece.gob.pe/api`. Probado en vivo con una llamada real.

### Endpoint usado

`GET /releases` — paginación tradicional (`from`/`size` conceptual, expuesto como `page`).

Parámetros confirmados:

| Parámetro | Tipo | Notas |
|---|---|---|
| `page` | integer | Default 1 |
| `order` | `desc`\|`asc` | Por fecha de publicación |
| `sourceId` | `seace_v3`\|`seace_v2` | SEACE v2 incluye también v1 |
| `startDate` / `endDate` | `YYYY-MM-DD` | Ventana del período de licitación |
| `dataSegmentationID` | `YYYY-MM` | Fecha de segmentación de archivos |
| `tenderId`, `ocid`, `tenderTitle` | string | Búsqueda puntual |
| `mainProcurementCategory` | `goods`\|`works`\|`services` | |

**No existe un filtro nativo por departamento/región del comprador.** El campo vive en
`parties[].address.department` de cada release, así que filtrar por región requiere
traer páginas y filtrar client-side (o buscar la entidad primero en la sección
"Entidades" del portal, no probado aún).

### Respuesta real (recortada, release de ejemplo)

```json
{
  "releases": [{
    "ocid": "ocds-dgv273-seacev3-1241737",
    "tag": ["planning", "tender"],
    "buyer": { "id": "PE-CONSUCODE-822", "name": "MUNICIPALIDAD DISTRITAL DE PICHARI" },
    "tender": {
      "id": "1241737", "title": "CP-ABR-37-2026-MDP/C-2",
      "mainProcurementCategory": "services",
      "value": { "amount": 0.0, "currency": "PEN" },
      "tenderPeriod": { "startDate": "2026-08-14", "endDate": "2026-08-14" }
    },
    "parties": [{
      "id": "PE-CONSUCODE-822", "name": "MUNICIPALIDAD DISTRITAL DE PICHARI",
      "address": {
        "streetAddress": "PLAZO PRINCIPAL S/N PICHARI",
        "locality": "PICHARI", "region": "LA CONVENCION",
        "department": "CUSCO", "countryName": "PERU"
      },
      "roles": ["buyer", "procuringEntity"]
    }]
  }],
  "links": { "next": "...?page=2&order=desc", "prev": null }
}
```

- 20 releases por página.
- `sourceId` (seace_v2/v3) **no viene como campo propio del release** — se infiere del
  propio `ocid` (patrón `seacev[23]`). Ver `inferSourceId()` en `normalize.ts`.
- **Limitación importante**: el release muestreado solo trae `tag: ["planning","tender"]`
  — no hay `awards` (proveedor adjudicado). Eso depende de en qué etapa esté el proceso
  de contratación. No se puede asumir que todo release tiene proveedor; se necesita un
  release con `tag` incluyendo `"award"` para modelar esa tabla — pendiente de confirmar
  con un ejemplo real antes de construirla.

## Escala

Página de inicio del portal reporta (año 2026, live): 46,195 procesos de contratación,
2,579 entidades compradoras, 23,639 proveedores adjudicados, 32,739 contratos — a nivel
nacional. A 20 releases/página eso son ~2,310 páginas solo para 2026. **No es razonable
traer el universo completo** para un MVP; la ingesta debe ser explícitamente acotada
(`maxPages`) y declarar `isPartial: true` siempre, igual que el conector del MEF.

## Licencia

`https://creativecommons.org/licenses/by/4.0/` (declarada en cada respuesta del API,
campo `license`).

## Cautelas

- Verificar si existe un endpoint de búsqueda de "Entidades" que permita encontrar IDs
  de comprador por departamento antes de paginar — no se probó todavía.
- El API está en "Versión en Beta" según el propio portal (banner visible) — puede
  cambiar sin aviso.
