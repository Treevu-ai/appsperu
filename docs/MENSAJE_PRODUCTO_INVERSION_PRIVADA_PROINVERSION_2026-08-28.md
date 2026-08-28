# Mensaje para equipo de producto — Inversión privada (PROINVERSIÓN / VERTIX)

**Fecha:** 28 de agosto de 2026  
**Estado:** Entregado en `master` (PRs #34 y #35)  
**Scope territorial de producto:** La Libertad (datos nacionales, filtro en consulta)

---

## Qué ganamos

Hasta ahora el ecosistema cubría **inversión pública** (Invierte.pe / MEF) y **obras en ejecución**
(INFOBRAS), pero no la cartera que promueve **PROINVERSIÓN**: concesiones **APP**, proyectos en activos
**PA** y obras por impuestos **OxI** en etapa de promoción.

Con la nueva app **`inversion-privada`** podemos responder, con evidencia trazable:

1. **¿Qué megaproyectos privados hay en La Libertad?** (~22 APP/PA + ~55 OxI en el corte actual).
2. **¿En qué sector y fase están?** (Transporte, Energía, Ejecución contractual, etc.).
3. **¿Qué OxI ya están en Invierte.pe?** Cruce **confirmado por código SNIP** — no por nombre ni por intuición.

Esto no reemplaza a Invierte.pe: **complementa** el mapa de inversión con el universo que gestiona
PROINVERSIÓN y que antes no estaba en ALSOL.

---

## Qué NO podemos afirmar (límites honestos)

| Pregunta | Respuesta |
|---|---|
| ¿Podemos cruzar APP/PA con Invierte por CUI? | **No.** VERTIX no publica CUI en ninguno de los 340 proyectos nacionales verificados. |
| ¿Tenemos mapa / coordenadas de los proyectos? | **No.** El GIS público es un iframe con login; no hay geometría descargable. |
| ¿Los datos se actualizan solos? | **No.** Igual que MEF o INFOBRAS: corrida manual periódica (`ingest:vertix`, `ingest:oxi`). |
| ¿OxI y APP/PA son la misma lista? | **No.** Son universos distintos (~761 OxI vs ~340 APP/PA). |

Estos límites están documentados en el data contract y en la API (`/api/gis/status`, `/api/crossref`
con campo `restriccion`).

---

## Números de referencia (corte 28-ago-2026)

| Fuente | Perú | La Libertad |
|---|---:|---:|
| APP + PA (VERTIX) | 340 | ~22 |
| OxI en promoción | 761 | ~55 |
| OxI con código SNIP (cruce posible con Invierte) | 761 | 55 |

---

## Cómo usarlo en producto / análisis

### Narrativa recomendada

> "La inversión **pública** la vemos en Invierte.pe; la **privada promovida por PROINVERSIÓN** la
> vemos en VERTIX. Son capas distintas. Donde OxI trae código SNIP, podemos enlazar con Invierte
> de forma verificable. Las concesiones APP/PA se leen por sector, titular y monto — no por CUI."

### Consultas útiles (API local o MCP)

- Cartera APP/PA en La Libertad: `GET /api/projects?departamento=LA+LIBERTAD`
- OxI en La Libertad: `GET /api/oxi/projects?departamento=LA+LIBERTAD`
- Cruce con inversión pública: `GET /api/crossref?departamento=LA+LIBERTAD` (requiere Invierte cargado)

### Corrida operativa

Incluido en `scripts/corrida-operativa-la-libertad.ps1` y `scripts/ingest-la-libertad-completo.sh`.

---

## Próximos pasos sugeridos (producto)

1. **Memo La Libertad** — brecha entre inversión pública (Invierte), privada (VERTIX) y OxI con SNIP
   enlazado; sectores con mayor peso (ej. Transporte, Energía).
2. **Certificación territorial** — registrar la app en el ledger `territorial_coverage` cuando
   definan el ritual de verificación (ingesta + smoke en La Libertad).
3. **No priorizar GIS VERTIX** — sin datos públicos; usar `ceplan-geo` + filtros departamentales.

---

## Contacto técnico

- Sesión reproducible: [`docs/SESION_INVERSION_PRIVADA_PROINVERSION_2026-08-28.md`](SESION_INVERSION_PRIVADA_PROINVERSION_2026-08-28.md)
- ADR decisión de arquitectura: [`docs/adr/0011-inversion-privada-app-standalone-y-connector-vertix.md`](adr/0011-inversion-privada-app-standalone-y-connector-vertix.md)
- Ficha de fuente: [`docs/data-contracts/proinversion-vertix-cartera-app-pa-oxi.md`](data-contracts/proinversion-vertix-cartera-app-pa-oxi.md)

---

## Texto listo para copiar (Slack / correo)

> **Nueva capacidad en ALSOL — inversión privada PROINVERSIÓN (VERTIX)**
>
> Ya está en master la app `inversion-privada`: cartera nacional de proyectos APP/PA (~340) y OxI en
> promoción (~761), consultable por departamento. En La Libertad: ~22 APP/PA y ~55 OxI.
>
> **Valor:** completamos el mapa de inversión más allá de Invierte.pe (pública). OxI se puede cruzar
> con Invierte por código SNIP de forma confirmada. APP/PA no tienen CUI — no inventamos cruces.
>
> **Límite:** sin mapa descargable (GIS detrás de login). Datos se refrescan con corrida manual, como
> el resto de fuentes.
>
> Doc producto: `docs/MENSAJE_PRODUCTO_INVERSION_PRIVADA_PROINVERSION_2026-08-28.md`
