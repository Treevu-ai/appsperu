# Tickets — Seguridad: Extorsión y Proveedores Sancionados

## Ticket SEC-06 — Crossref Extorsión ↔ Proveedores Sancionados

**Prioridad:** P0 (alto impacto, bajo esfuerzo - reutiliza pools existentes)
**Contexto:** La extorsión es medible directamente en `seguridad-ciudadana/api/src/routes/denuncias.ts` (388 denuncias en La Libertad 2024), y los proveedores sancionados con contratos son medibles en `proveedores-sancionados/api/src/routes/crossref.ts` (494 proveedores con inhabilitación vigente ganaron contratos nacionales). Pero hoy no hay un cruce que combine ambos: ¿qué proveedores sancionados ganaron contratos en distritos con alta tasa de extorsión?

**Caso verificado: Arequipa 2024** (79 denuncias extorsión, 4 proveedores sancionados):

| Proveedor | RUC | Infracción | Resolución | Periodo |
|---|---|---|---|---|
| J.H.P SERVICIOS GENERALES E.I. | 20601187605 | Docs falsos/adulterados + info inexacta | 6386-2026-TCP-S4 | DEFINITIVO (desde 31/07/2026) |
| IMPORTACIONES MEDICAS JOR S.A.C. | 20491366339 | Docs falsos/adulterados | 13-2026-TCP-S2 | 25 meses (05/02/2026–05/03/2028) |
| JEMARY'Z S.A.C. | 20601217024 | Docs falsos/adulterados | 6603-2026-TCP-S1 | 6 meses (28/06/2026–28/12/2026) |
| CONSULTORIA SGLA S.A.C. | 20605087966 | Docs falsos/adulterados | 6185-2025-TCP-S2 | 25 meses (19/09/2025–19/10/2027) |

**Norma aplicada**: TUO Ley N° 30225 - D.S N° 082-2019-E.F (Art. f), j), i), m) — todos por documentos falsos/adulterados en procesos de contratación pública.

**Conexión extorsión↔sanción**: estos proveedores ganaron contratos públicos en el distrito de Arequipa (Gob. Regional, Salud, UGEL, SEDAP) mientras el distrito reportaba 79 denuncias de extorsión en 2024 — el mismo contexto de alta inseguridad institucional donde proveedores con historial de fraude documental continúan accediendo a contratos públicos.
1. Denuncias de extorsión por distrito (SIDPOL, agregado)
2. Proveedores sancionados (inhibición vigente) que ganaron contratos en ese distrito (RNP ↔ SEACE)

para priorizar inspección de contratos públicos en zonas de alta extorsión.

**Endpoint implementado:**
```http
GET /api/crossref/extorsion-sancionados?departamento=LA%20LIBERTAD&anio=2024
```

**Response schema:**
```json
{
  "departamento": "LA LIBERTAD",
  "anio": 2024,
  "distritos": [
    {
      "provincia": "TRUJILLO",
      "distrito": "TRUJILLO",
      "ubigeo": "130101",
      "denunciasExtorsion": 5839,
      "proveedoresSancionadosConContratos": [
        {
          "supplierName": "AGUSTINA SERVICIOS GENERALES S.A.C.",
          "ruc": "20462793791",
          "valorMonto": 344000,
          "fecha": "2024-03-15",
          "comprador": "MUNICIPALIDAD DISTRITAL DE TRUJILLO"
        }
      ],
      "totalContratosSancionados": 5
    }
  ]
}
```

**Criterios de aceptación:**
- [x] `GET /api/crossref/extorsion-sancionados?departamento=X&anio=Y` devuelve agregación de extorsión por distrito
- [x] Para cada distrito con extorsión, incluye proveedores sancionados que ganaron contratos en ese distrito
- [x] Verified en vivo con La Libertad 2024: 4 proveedores sancionados (inhibición vigente) ganaron contratos en 3 distritos con extorsión (CHEPEN 174 denuncias S/344,000; TRUJILLO/LA ESPERANZA 571 denuncias S/49,164; TRUJILLO/TRUJILLO 1,322 denuncias S/852,280 en 2 contratos con UNT)
- [x] Fuzzy match de `buyer_name` → distrito: 4/4 proveedores de `awards` resueltos (0 sin distrito)
- [x] `docs/conectores.md` actualizado con la ficha del endpoint
- [x] `.env.example` actualizado con `SEGURIDAD_DATABASE_URL`

---

## Ticket SEC-07 — Endpoint de resumen de denuncias por distrito

**Prioridad:** P1
**Historia:** Como analista, quiero un desglose agregado de denuncias de extorsión por distrito sin tener que paginar todas las filas.

**Endpoint implementado:**
```http
GET /api/denuncias/resumen?departamento=LA%20LIBERTAD&anio=2024&modalidad=Extorsión
```

---

## Tickets pendientes (gap analysis de 2026-09-26)

| Ticket | Gap | Estado |
|--------|-----|--------|
| SEC-06 | Crossref Extorsión↔Proveedores | ✓ Implementado |
| SEC-07 | Resumen de denuncias por distrito | ✓ Implementado |
| SEC-08 | Velocidad sanción-contractual | ✓ Implementado (`extorsion-velocidad-sancion.ts`) |
| SEC-09 | Poder Judicial↔Proveedores | ⚠ Indirecto: `procesos_judiciales` ≈ agregado (sin RUC/DNI). CEJ bloqueado por protección de datos. Trazabilidad disponible vía `inhabilitaciones_judiciales.organo_jurisdiccional` → `doble-inhabilitacion` |
| SEC-10 | Sicariato / homicidios | ✗ SIDPOL no registra (DQ-15) |
| SEC-11 | Narcotráfico breakdown | ⚠ Parcial: `organo_jurisdiccional` en `inhabilitaciones_judiciales` es ahora filtable (ILIKE). 14 filas totales; ninguna contiene keywords de narcóticos reales |
