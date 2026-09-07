# ROF — BCRP (Banco Central de Reserva del Perú)

**Fuente**: `bcrp-rof.pdf` — texto real extraído (313,191 caracteres), Resolución de Directorio
N° 0025-2026-BCRP-N, publicada en El Peruano el 18 de mayo de 2026 (versión vigente). Descargado
de `bcrp.gob.pe/docs/Transparencia/Organizacion/Organigrama/rof-bcrp.pdf` (2026-09-07).

## Naturaleza jurídica y autonomía (Artículos 1-2, texto real)

Persona jurídica de derecho público, con autonomía en el marco de su Ley Orgánica, patrimonio
propio, duración indefinida. Se rige exclusivamente por su Ley Orgánica y Estatuto (no por la
Ley Orgánica del Poder Ejecutivo como los ministerios). Gobernado por su Directorio.

## Funciones (Artículo 3, texto real completo)

> "La finalidad del Banco es preservar la estabilidad monetaria. Sus principales funciones son
> regular la moneda y el crédito, administrar las reservas internacionales, emitir billetes y
> monedas e informar sobre las finanzas nacionales."

## Jurisdicción (Artículo 4, texto real)

Las disposiciones del BCRP (Circulares) son de **obligatorio cumplimiento** para todas las
entidades del Sistema Financiero y demás personas naturales/jurídicas cuando corresponda.

## Régimen presupuestal (Artículo 5, texto real)

Autonomía presupuestal — **el Banco no emplea recursos del Presupuesto Público**. Relevante para
Rastro: los indicadores del BCRP nunca deben cruzarse contra `radar-ejecucion` (PIA/PIM/
Devengado del MEF) como si fueran la misma fuente de "gasto público" — son sistemas
presupuestales legalmente independientes.

## Relación con Rastro

- `bcrp-comercio-exterior`: los indicadores de comercio exterior agregado nacional (FOB
  exportaciones/importaciones/balanza comercial) que ingiere esta app son series que el BCRP
  publica por su función explícita de "informar sobre las finanzas nacionales" — series
  oficiales del banco central, no una estimación de terceros.
- `bcrp-la-libertad`: la síntesis de actividad económica regional (BCRP Sucursal Trujillo) es
  la misma función informativa del Artículo 3, ejercida a nivel de sucursal regional — el BCRP
  tiene sucursales regionales precisamente para cumplir este mandato de información
  descentralizada, no es una iniciativa local paralela a la sede central.
- La autonomía presupuestal (Artículo 5) confirma por qué **no existe** ni debería existir un
  cruce "ejecución presupuestal del BCRP" contra `radar-ejecucion` — el BCRP está, por diseño
  constitucional, fuera del universo de Presupuesto Público que esa app mide.
