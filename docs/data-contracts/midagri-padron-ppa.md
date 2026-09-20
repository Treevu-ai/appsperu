# Data contract — MIDAGRI: Padrón de Productores Agrarios (PPA)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-20.

## Por qué existe esta fuente

Se buscaba un dato de formalidad complementario a SUNAT/Aduanas: si una cooperativa está
registrada formalmente como productor agrario ante MIDAGRI. Se encontró
`consultapadron.midagri.gob.pe`, un buscador público por RUC/DNI del Padrón de Productores
Agrarios (PPA).

## Fuente

- Frontend: `https://consultapadron.midagri.gob.pe/app/identidad/consulta-reporte/consulta-empadronamiento/consulta-emp-filtro`
- API real (encontrada por ingeniería inversa del bundle Angular, `main.<hash>.js`):
  `https://gateway.midagri.gob.pe/sisppa/api/services/app/Consulta/GetNombreConsulta`
- Backend ABP Framework (`.NET`) — respuesta siempre envuelta en el sobre estándar de ABP:
  `{ result, targetUrl, success, error, unAuthorizedRequest, __abp }`.
- **A diferencia de `*.sunat.gob.pe`, este dominio NO está bloqueado para fetch directo desde
  este entorno** — confirmado en vivo con `curl` simple. Sin captcha, sin sesión, sin headers
  especiales. Conector 100% automatizado.

## Parámetros

```
GET /api/services/app/Consulta/GetNombreConsulta?codDocumento=<tipo>&Documento=<numero>
```

- `codDocumento=6` → RUC (confirmado en vivo).
- `codDocumento=1` → DNI (confirmado en vivo con un DNI real, representante legal de una
  cooperativa del seed).

## Cómo se infiere si está registrado — no hay un campo booleano explícito

El campo `result` trae:
- El **nombre/razón social real** si el documento está registrado en el PPA.
- El literal `"-"` si no está registrado — mismo sentinel de "vacío" que usa SUNAT en el resto
  del catálogo (`ruc_consulta_masiva`).

El parser (`padron-ppa-normalize.ts::parseGetNombreConsulta`) infiere `registrado` comparando
contra ese sentinel — no existe un campo `registrado: true/false` propio de la fuente.

## Hallazgo real — `GetDatosProductor` (el endpoint que prometía más) no sirve

El bundle JS también expone `Consulta/verificarEmpadronamiento` y `Consulta/GetDatosProductor`
(mismos parámetros `codDocumento`/`Documento`). Investigados en vivo:

- `verificarEmpadronamiento` devuelve `{"result": 0}` tanto para RUC/DNI reales registrados
  como para un RUC inventado — no se determinó qué distingue sus posibles valores, y no aporta
  nada que `GetNombreConsulta` no diga ya de forma más clara.
- `GetDatosProductor` (el que prometía cultivo/hectáreas/ubicación) **devuelve `{"result":
  null}` incluso para un RUC y un DNI confirmados como registrados** (probado con ACOPAGRO y con
  un DNI real de representante legal). Se buscó en el bundle dónde se invoca este método desde
  algún componente de la UI — **no se encontró ningún punto de llamada real**, solo existe
  definido en la clase de servicio API. Conclusión: o es un endpoint sin terminar de
  implementar en esta build, o requiere autenticación como el propio titular (no consulta
  pública anónima) — no es un dato accesible por esta vía para ningún tipo de documento.

## Verificado en vivo (2026-09-20)

- RUC `20404057805` (ACOPAGRO) → registrado, nombre `COOPERATIVA AGRARIA ACOPAGRO LTDA`.
- RUC `20132489824` (Chancamayo) → registrado.
- DNI `28703600` (representante legal, `ficha_ruc_representantes`) → registrado, nombre
  `TIMOTEO OCHOA RUA`.
- RUC inventado `20000000001` → NO registrado (`result: "-"`).
- **Corrida completa contra las 596 cooperativas del seed: 596/596 registradas, 0 errores** —
  el registro PPA parece ser prácticamente universal para organizaciones agrarias formales de
  este universo (tiene sentido: el seed viene del directorio de cooperativas de PRODUCE).

## Pendiente / fuera de alcance de este contrato

1. **`GetDatosProductor` no resuelto** — si en el futuro se encuentra la forma correcta de
   invocarlo (headers de sesión, otro parámetro), podría traer cultivo/hectáreas/ubicación.
2. **`Download/descargarConstancia`** — endpoint de descarga de la constancia PDF de registro,
   encontrado en el bundle pero no probado (probablemente requiere sesión del titular).
3. **Significado real de `verificarEmpadronamiento`** no determinado — no se investigó más allá
   de confirmar que no aporta nada nuevo frente a `GetNombreConsulta`.
