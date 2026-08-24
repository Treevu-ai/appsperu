# Contrato de datos — Servicios que cuidan

## Propósito

`GET /api/servicios-cuidados` y `npm run servicios:cuidados` materializan una cadena de evidencia para infraestructura y alimentación escolar. El contrato no califica entidades ni proveedores: muestra qué es verificable y qué falta documentar.

## Modelo de trazabilidad

| Dominio | Identificador permitido | Qué se publica | Qué queda explícitamente vacío |
|---|---|---|---|
| Infraestructura | CUI publicado | Proyecto, fuentes, territorios publicados y obra INFOBRAS solo por CUI exacto. | Código INFOBRAS inexistente o CUI no publicado; jamás se completa por título parecido. |
| Alimentación escolar | Lote/contrato y RUC publicados | Cobertura, comité, lotes y adjudicación agregada cuando la fuente los publica. | Proveedor, colegio, distrito o entrega sin documento oficial que los enlace. |
| Cumplimiento de proveedor | RUC de 11 dígitos | Condición SUNAT y sanciones, si se configuran las bases opcionales. | Domicilio como territorio beneficiado; ausencia de sanción como certificado de idoneidad. |

## Estados de evidencia

- `CUI_PUBLICADO` / `CUI_NO_PUBLICADO_EN_FUENTE`: diferencia una clave oficial de una ausencia documental.
- `CUI_EXACTO`: existe al menos una obra INFOBRAS con el mismo CUI.
- `SIN_OBRA_INFOBRAS_PARA_CUI`: INFOBRAS está conectado pero no devolvió una obra para ese CUI; no significa que no exista obra fuera de su cobertura.
- `SIN_RUC_OFICIALMENTE_VINCULADO`: no se ha ingresado un documento que una proveedor, lote y servicio; ALSOL no busca un nombre parecido en compras generales.
- `SIN_EVIDENCIA_DE_ENTREGA_INGRESADA`: no se ha ingresado un acta, guía, control sanitario u otra fuente que ligue la entrega a un colegio/territorio.

## Semillas iniciales

1. Drenaje pluvial de Trujillo (CUI `2539202`), con documentos MEF/ANIN/Congreso y seis distritos publicados.
2. Institución educativa de Casa Grande (ANIN, 2026): población beneficiaria e infraestructura publicada; sin CUI ni código INFOBRAS atribuido.
3. Servicio alimentario Wasi Mikuna La Libertad (2025): cobertura planificada, cinco comités, 35 ítems y 27 adjudicados; sin RUC, lote, colegio ni entrega atribuidos hasta registrar fuente oficial adicional.

## Ingreso de nueva evidencia

Un registro nuevo debe llevar URL oficial, detalle de la evidencia, fecha de observación y una clave. Para proveedores: RUC, servicio, lote o referencia contractual. Para entregas: servicio, colegio o código modular cuando exista, territorio y evidencia. Los registros `CANDIDATO_NO_USADO` no se devuelven como vínculo verificable.

## Consultas terminales

```powershell
npm run servicios:cuidados
npm run servicios:cuidados -- --tipo INFRAESTRUCTURA
npm run servicios:cuidados -- --tipo ALIMENTACION
npm run servicios:cuidados -- --servicio ALIM-WASI-MIKUNA-LA-LIBERTAD-2025 --json
```

Las conexiones a INFOBRAS, identidad fiscal y sanciones son opcionales. Si faltan, la respuesta declara `*_NO_CONFIGURADO`; nunca simula un cruce.
