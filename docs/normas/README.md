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

## Índice (20/20 entidades)

| Entidad | Apps que la usan | Archivo |
|---|---|---|
| MEF (Ministerio de Economía y Finanzas) | `radar-ejecucion`, `radar-inversiones` | [`mef-rof.md`](mef-rof.md) |
| OECE (Organismo Especializado para las Contrataciones Públicas Eficientes, ex-OSCE) | `compras-publicas`, `proveedores-sancionados` | [`oece-rof.md`](oece-rof.md) |
| SUNAT (Superintendencia Nacional de Aduanas y de Administración Tributaria) | `identidad-fiscal` | [`sunat-rof.md`](sunat-rof.md) |
| Contraloría General de la República | `infobras`, `informes-control` | [`contraloria-rof.md`](contraloria-rof.md) |
| MINEDU (Ministerio de Educación) | `instituciones-educativas` | [`minedu-rof.md`](minedu-rof.md) |
| MIDAGRI (Ministerio de Desarrollo Agrario y Riego) | `actividad-agraria` | [`midagri-rof.md`](midagri-rof.md) |
| BCRP (Banco Central de Reserva del Perú) | `bcrp-comercio-exterior`, `bcrp-la-libertad` | [`bcrp-rof.md`](bcrp-rof.md) |
| MININTER (Ministerio del Interior) | `seguridad-ciudadana` | [`mininter-rof.md`](mininter-rof.md) |
| PROINVERSIÓN (Agencia de Promoción de la Inversión Privada) | `inversion-privada` | [`proinversion-rof.md`](proinversion-rof.md) |
| SUSALUD (Superintendencia Nacional de Salud) | `servicios-salud` | [`susalud-rof.md`](susalud-rof.md) |
| MIDIS (Ministerio de Desarrollo e Inclusión Social) | `programas-sociales` | [`midis-rof.md`](midis-rof.md) |
| MTPE (Ministerio de Trabajo y Promoción del Empleo) | `actividad-empresarial` | [`mtpe-rof.md`](mtpe-rof.md) |
| MINDEF (Ministerio de Defensa) | `mindef` | [`mindef-rof.md`](mindef-rof.md) |
| MIMP (Ministerio de la Mujer y Poblaciones Vulnerables) | `mimp` | [`mimp-rof.md`](mimp-rof.md) |
| INEI (Instituto Nacional de Estadística e Informática) | `renamu` | [`inei-rof.md`](inei-rof.md) |
| JNE (Jurado Nacional de Elecciones) | `autoridades-electas` | [`jne-rof.md`](jne-rof.md) |
| OEFA (Organismo de Evaluación y Fiscalización Ambiental) | `infracciones-ambientales` | [`oefa-rof.md`](oefa-rof.md) |
| MTC (Ministerio de Transportes y Comunicaciones) | `red-vial-subnacional`, `infraestructura-mtc` | [`mtc-rof.md`](mtc-rof.md) |
| MINAM (Ministerio del Ambiente) | `residuos-solidos`, (rectoría de `infracciones-ambientales`/OEFA) | [`minam-rof.md`](minam-rof.md) |
| CEPLAN (Centro Nacional de Planeamiento Estratégico) | `ceplan-estrategico`, `ceplan-geo` | [`ceplan-rof.md`](ceplan-rof.md) |

## Limitaciones por entidad (PDF sin capa de texto real)

Estos ROF se descargaron de la fuente oficial vigente pero resultaron ser escaneos sin texto
extraíble — su resumen `.md` se basa en conocimiento institucional público, anotado
explícitamente en cada archivo: **MEF**, **PROINVERSIÓN**, **MTPE**, **MINDEF**. El resto (16 de
20) tiene texto real citado literalmente del PDF.

## Otros documentos de esta carpeta (no ROF)

- [`marco-legal-gobierno-subnacional.md`](marco-legal-gobierno-subnacional.md) — Ley Orgánica de
  Gobiernos Regionales (Ley 27867) y Ley Orgánica de Municipalidades (Ley 27972): el marco legal
  que rige a los gobiernos regional/provincial/distrital en sí (nivel distinto a las 20 entidades
  nacionales de arriba), más los instrumentos propios del Gobierno Regional de La Libertad.
- [`inventario-pesem-pei-poi-2025-2026.md`](inventario-pesem-pei-poi-2025-2026.md) — inventario de
  Planes Estratégicos Sectoriales Multianuales (PESEM), Planes Estratégicos Institucionales (PEI) y
  Planes Operativos Institucionales (POI) vigentes para 2025/2026, de las 20 entidades de arriba +
  el Gobierno Regional de La Libertad. Varios quedaron como vacío de evidencia explícito (no
  localizados en esa pasada) — ver el propio documento para el detalle.
