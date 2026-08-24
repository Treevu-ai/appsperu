# Contrato de datos — Servicios que cuidan

## Propósito

`GET /api/servicios-cuidados` y `npm run servicios:cuidados` materializan una cadena de evidencia para infraestructura y alimentación escolar. Para alimentación, `GET /api/servicios-cuidados/alimentacion/*` y los comandos `npm run alimentacion:*` hacen visible la cadena lote → RUC → colegio → entrega. El contrato no califica entidades ni proveedores: muestra qué es verificable y qué falta documentar.

## Modelo de trazabilidad

| Dominio | Identificador permitido | Qué se publica | Qué queda explícitamente vacío |
|---|---|---|---|
| Infraestructura | CUI publicado | Proyecto, fuentes, territorios publicados y obra INFOBRAS solo por CUI exacto. | Código INFOBRAS inexistente o CUI no publicado; jamás se completa por título parecido. |
| Alimentación escolar | Lote/contrato, RUC exacto, código modular y acta publicados | Cobertura, comité, lotes, adjudicación y entregas cuando la fuente los publica. | RUC derivado de un nombre, colegio/distrito sin código modular y entrega inferida desde una referencia contractual. |
| Cumplimiento de proveedor | RUC de 11 dígitos | Condición SUNAT y sanciones, si se configuran las bases opcionales. | Domicilio como territorio beneficiado; ausencia de sanción como certificado de idoneidad. |

## Estados de evidencia

- `CUI_PUBLICADO` / `CUI_NO_PUBLICADO_EN_FUENTE`: diferencia una clave oficial de una ausencia documental.
- `CUI_EXACTO`: existe al menos una obra INFOBRAS con el mismo CUI.
- `SIN_OBRA_INFOBRAS_PARA_CUI`: INFOBRAS está conectado pero no devolvió una obra para ese CUI; no significa que no exista obra fuera de su cobertura.
- `SIN_RUC_OFICIALMENTE_VINCULADO`: no se ha ingresado un documento que una proveedor, lote y servicio; ALSOL no busca un nombre parecido en compras generales.
- `SIN_EVIDENCIA_DE_ENTREGA_INGRESADA`: no se ha ingresado un acta, guía, control sanitario u otra fuente que ligue la entrega a un colegio/territorio.
- `RUC_NO_PUBLICADO_EN_EVIDENCIA`: el expediente puede nombrar a un consorcio, pero no publica una clave de 11 dígitos que permita consultar su cumplimiento.
- `PUBLICADO_AGREGADO_SIN_PADRON`: existe una cifra agregada de cobertura, no una lista materializada de instituciones educativas con código modular.
- `BLOQUEADO_POR_EVIDENCIA`: impide calcular cobertura distrital, cumplimiento de entrega o perfil de proveedor cuando falta una clave esencial; no es una alerta de irregularidad.

## Semillas iniciales

1. Drenaje pluvial de Trujillo (CUI `2539202`), con documentos MEF/ANIN/Congreso y seis distritos publicados.
2. Institución educativa de Casa Grande (ANIN, 2026): población beneficiaria e infraestructura publicada; sin CUI ni código INFOBRAS atribuido.
3. Servicio alimentario Wasi Mikuna La Libertad (2025): cobertura planificada de 276,812 estudiantes y 3,692 instituciones, cinco comités, 35 ítems y 27 adjudicados. El piloto materializa tres lotes de Comité La Libertad 5 (Guadalupe, Paiján y Casa Grande) a partir de expedientes públicos. Los tres conservan el proveedor como literal publicado, sin RUC exacto, colegio receptor ni acta de recepción.

El expediente de Casa Grande incluye una causal de penalidad vinculada al expediente de conformidad de entrega. ALSOL la conserva como `OBSERVACION_CONTRACTUAL_DOCUMENTADA`: no la convierte en prueba de que un alimento no llegó a un colegio ni en una conclusión sobre el proveedor.

## Ingreso de nueva evidencia

Un registro nuevo debe llevar URL oficial, detalle de la evidencia, fecha de observación y una clave. Para proveedores: RUC, servicio, lote o referencia contractual. Para entregas: servicio, colegio o código modular cuando exista, territorio y evidencia. Los registros `CANDIDATO_NO_USADO` no se devuelven como vínculo verificable.

## Consultas terminales

```powershell
npm run servicios:cuidados
npm run servicios:cuidados -- --tipo INFRAESTRUCTURA
npm run servicios:cuidados -- --tipo ALIMENTACION
npm run servicios:cuidados -- --servicio ALIM-WASI-MIKUNA-LA-LIBERTAD-2025 --json
npm run alimentacion:lotes -- --periodo 2025
npm run alimentacion:cobertura -- --periodo 2025 --distrito "Casa Grande"
npm run alimentacion:integridad -- --periodo 2025 --estricto
npm run alimentacion:evidencia -- --periodo 2025
npm run alimentacion:revision -- --accion list --estado PENDING
```

Las conexiones a INFOBRAS, identidad fiscal y sanciones son opcionales. Si faltan, la respuesta declara `*_NO_CONFIGURADO`; nunca simula un cruce.

## Límite de cobertura actual

Las fuentes materializadas son páginas y documentos públicos manual-asistidos; no se identificó una API oficial documentada ni un export estructurado que publique de forma integral lote, RUC, colegio y entrega. Por eso los tres lotes no representan los 35 ítems publicados, y la consulta de cobertura devuelve cero colegios documentados hasta que ingrese un padrón oficial con clave modular. Antes de automatizar esa fuente se debe guardar descarga, checksum, fecha de extracción y condiciones de uso.

## Observaciones sobre proveedores

Las observaciones no cambian el estado de un lote ni de una entrega. ALSOL conserva cinco tipos: `SANCION_FORMAL`, `DENUNCIA_CON_EXPEDIENTE`, `PROCESO_EN_CURSO`, `ANTIGUEDAD_RUC` y `REFERENCIA_EXTERNA`.

| Tipo | Requisito mínimo | Lectura permitida |
|---|---|---|
| Sanción formal | RUC, autoridad, resolución/expediente, fuente y fecha. | Hecho administrativo o legal según el acto publicado; la vigencia debe contrastarse con la fecha contractual. |
| Denuncia/proceso | RUC, autoridad, expediente, estado, fuente y fecha. | “Denuncia presentada” o “proceso en investigación”; nunca responsabilidad acreditada. |
| Antigüedad del RUC | RUC, fuente oficial de fecha de inicio y fecha de contrato. | Días de antigüedad al contratar; es contexto y no una presunción de direccionamiento. |
| Referencia externa | URL, fecha y literal publicado. | Se puede preservar sin RUC, pero queda `SIN_RUC_NO_VINCULAR`: no se atribuye a proveedor, lote, contrato ni ranking. |

Consultas y registro controlado:

```powershell
npm run proveedores:observaciones -- --accion list --ruc 20100027021
npm run proveedores:observaciones -- --accion registrar --ruc 20100027021 --tipo DENUNCIA_CON_EXPEDIENTE --estado EN_INVESTIGACION --autoridad "Entidad competente" --expediente "EXP-123" --fuente "https://fuente-oficial.example/exp-123" --detalle "Descripción literal verificable" --fecha-observada 2026-08-24
```

El padrón SUNAT conectado actualmente no publica fecha de inicio de actividades; por ello no se debe registrar una observación `ANTIGUEDAD_RUC` hasta incorporar una fuente oficial que sí la contenga.
