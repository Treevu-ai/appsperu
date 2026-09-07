# Normas — base de conocimiento de Reglamentos de Organización y Funciones (ROF)

Carpeta con el ROF vigente (o la versión más reciente localizada) de cada entidad que ya es
fuente de datos de una app de este monorepo, más un resumen `.md` con sus funciones/competencias
clave y cómo se relacionan con lo que Rastro ingiere de esa entidad.

**Propósito**: dar contexto normativo a las señales y cruces que el proyecto ya genera — ej. si
una app mide "ejecución presupuestal" de una entidad, este folder documenta si esa entidad tiene
formalmente la función de ejecutar ese tipo de gasto, o si un cruce está comparando competencias
que en realidad no son equivalentes.

**Alcance**: entidades "dueñas" de una fuente de datos ya integrada (nacional), no gobiernos
regionales/municipales individuales de La Libertad — ver `docs/ESTADO.md` para el detalle de esa
decisión de alcance.

**Formato por entidad**: `<entidad>-rof.pdf` (fuente primaria, tal cual se descargó de la fuente
oficial) + `<entidad>-rof.md` (resumen: naturaleza jurídica, funciones generales relevantes,
relación con la(s) app(s) de Rastro que usan esta fuente).

**Limitación conocida**: algunos ROF publicados en `gob.pe`/portales institucionales son escaneos
sin capa de texto (ej. MEF) — en esos casos el resumen se basa en conocimiento institucional
público verificable, no en extracción literal del PDF, y se anota explícitamente.

## Índice

| Entidad | Apps que la usan | Archivo |
|---|---|---|
| MEF (Ministerio de Economía y Finanzas) | `radar-ejecucion`, `radar-inversiones` | [`mef-rof.md`](mef-rof.md) |
| OECE (Organismo Especializado para las Contrataciones Públicas Eficientes, ex-OSCE) | `compras-publicas`, `proveedores-sancionados` | [`oece-rof.md`](oece-rof.md) |
| SUNAT (Superintendencia Nacional de Aduanas y de Administración Tributaria) | `identidad-fiscal` | [`sunat-rof.md`](sunat-rof.md) |
| Contraloría General de la República | `infobras`, `informes-control` | [`contraloria-rof.md`](contraloria-rof.md) |
| MINEDU (Ministerio de Educación) | `instituciones-educativas` | [`minedu-rof.md`](minedu-rof.md) |
