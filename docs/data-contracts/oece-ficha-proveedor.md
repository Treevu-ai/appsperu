# Data contract — OECE: Ficha Única del Proveedor (Buscador de Proveedores del Estado)

> Ficha técnica del conector: [`docs/conectores.md#identidad-fiscal`](../conectores.md#identidad-fiscal)

Investigación en vivo: 2026-09-20.

## Por qué existe esta fuente

Se buscaba una fuente en bulk con **representante legal (DNI)** para complementar
`ficha_ruc_representantes` (solo 1 registro cargado, por el bloqueo de reCAPTCHA de la ficha
individual de SUNAT). Se encontró el "Buscador de Proveedores del Estado" de OECE (ex-OSCE,
renombrado por la Ley 32069) — mucho más rico de lo esperado: además de representante legal,
trae **toda la junta directiva** (Consejo de Administración: presidente, vicepresidente,
secretario, vocales) con DNI de cada persona, más un snapshot fresco de datos SUNAT y contacto
(teléfono/email).

## Fuente

- Frontend: `https://apps.oece.gob.pe/perfilprov-ui/ficha/<RUC>`
- API real (encontrada inspeccionando las llamadas de red del frontend):
  - `https://eap.oece.gob.pe/ficha-proveedor-cns/1.0/ficha/<RUC>/resumen` — ficha completa,
    conformación societaria/directiva, antecedentes (sanciones/inhabilitaciones).
  - `https://eap.oece.gob.pe/perfilprov-bus/1.0/ficha/<RUC>` — datos de contacto (teléfono,
    email), no incluidos en el endpoint anterior.
- **GET plano, sin captcha, sin sesión, dominio no bloqueado para este entorno** — confirmado
  en vivo con `curl` simple.

## Cobertura por tipo de RUC — `datosSunat` responde para cualquier RUC, la conformación NO

**Corrección real sobre una lectura inicial equivocada de este mismo contrato**: la respuesta de
`resumen` trae dos partes independientes con cobertura muy distinta:

- `datosSunat` — responde para **cualquier RUC válido**, esté o no inscrito en el RNP. Es un eco
  de SUNAT, no una confirmación de registro. El conector marca `rucsEncontrados` en base a este
  campo — **eso mide "SUNAT reconoce el RUC", no "está en el RNP"**, y la primera versión de este
  contrato interpretó mal esa métrica (decía "596/596 SÍ están en el RNP", que es falso).
- `conformacion.proveedor.codigoRegistro` — **solo viene poblado si el RUC está realmente
  inscrito en el Registro Nacional de Proveedores**. Si es `null`, ese RUC nunca se registró como
  proveedor del Estado y por lo tanto tampoco tiene `representantes`/`organosAdm`/`socios`
  (vienen `[]`, no un error).

**Cifra real verificada en vivo (2026-09-20) contra las 597 filas de `ruc_oece_ficha`**: solo
**155 (26%) tienen `codigo_registro` no nulo** (sí están en el RNP). De esas 155, **139 tienen
al menos 1 persona** en `ruc_oece_personas` — las 16 restantes están inscritas en el RNP pero
nunca llenaron la sección de conformación societaria/directiva (aparentemente opcional al
registrarse).

**Conclusión práctica**: si se usa `ruc_oece_ficha` para inferir "¿esta cooperativa vendió/podría
vender al Estado?", filtrar por `codigo_registro IS NOT NULL`, no por la sola presencia de la
fila (todas las 596-597 tienen fila, casi todas con `codigo_registro` nulo).

## Schema real confirmado — `ficha-proveedor-cns/1.0/ficha/{ruc}/resumen`

```jsonc
{
  "datosSunat": {
    "ruc": "...", "razon": "...", "tipoEmpresa": "...",
    "estado": "ACTIVO", "condicion": "HABIDO",
    "departamento": "...", "provincia": "...", "distrito": "..."
  },
  "conformacion": {
    "proveedor": { "codigoRegistro": "S0631562" /* código de inscripción RNP */ },
    "socios": [ /* mismo shape que representantes/organosAdm — ver nota abajo */ ],
    "representantes": [
      { "idRepresentante": 2885791, "nroDocumento": "22999374",
        "razonSocial": "RIOS NUÑEZ SEGUNDO GONZALO", "descCargo": null,
        "fechaIngreso": "22/07/1997" }
    ],
    "organosAdm": [
      { "idOrgano": 2579230, "nroDocumento": "01004225",
        "apellidosNomb": "PINCHI TAFUR PAULO SANTIAGO",
        "descTipoOrgano": "CONSEJO DE ADMINISTRACION", "descCargo": "Secretario",
        "fechaIngreso": "25/03/2023" }
    ]
  },
  "antecedentes": { "sanciones": [], "medidasCautelares": [], "inhsJudicial": [], "inhsAdministrativa": [], "penalidades": [] }
}
```

- `representantes` usa el campo `razonSocial` para el nombre de la persona (nombre confuso,
  heredado del modelo genérico proveedor — no es una razón social real).
- `organosAdm` usa `apellidosNomb` en cambio.
- Fechas vienen `DD/MM/YYYY` — se convierten a `YYYY-MM-DD` en el parser.
- `antecedentes` (sanciones TCE, inhabilitaciones, penalidades) **no se ingiere** — el proyecto
  ya tiene la app `proveedores-sancionados` cubriendo exactamente ese dato desde la fuente
  primaria (Tribunal de Contrataciones); ingerir esto también sería duplicar sin necesidad.

## Anomalía / pendiente real — `socios` nunca se observó poblado

Para las 596 cooperativas del seed, `conformacion.socios` vino **siempre vacío**. Es esperable:
el modelo de "socios/accionistas" corresponde a personería societaria (S.A.C., S.R.L.), no a
cooperativas (que tienen "asociados", modelados aquí como `organosAdm`/`representantes`). El
parser (`oece-ficha-normalize.ts`) sí soporta `socios` con el mismo shape que `representantes`
(por simetría de nombres de campo vistos en la respuesta), **pero ese shape nunca se confirmó
en vivo con datos reales** — si en el futuro se usa este conector contra RUC no-cooperativos y
`socios` viene poblado con una estructura distinta, revisar `parseOecePersonas` antes de confiar
en el resultado.

## Verificado en vivo (2026-09-20)

- ACOPAGRO (20404057805): 1 representante + 6 miembros de Consejo de Administración (Presidente,
  Vicepresidente, Secretario, 3 Vocales/Otros), teléfono y email de contacto.
- Chancamayo (20132489824): ficha encontrada, 0 personas (representantes/organosAdm vacíos para
  este RUC — resultado válido, no error).
- Corrida completa: 596/596 RUC responden `datosSunat` (no implica RNP), **155/596 (26%) están
  realmente inscritos en el RNP** (`codigo_registro` no nulo), **139/596 tienen al menos 1
  persona registrada**, 815 filas en `ruc_oece_personas` en total, 0 errores.

## Pendiente / fuera de alcance de este contrato

1. **Estructura real de `socios` no confirmada** — ver anomalía arriba.
2. **`antecedentes` no se ingiere** — deliberado, ya cubierto por `proveedores-sancionados`.
3. **No se investigó qué pasa con un RUC que no está en el RNP** — todas las 596 cooperativas
   del seed sí lo estaban, así que no se observó el caso "no encontrado" en vivo.
