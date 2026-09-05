# ADR-0021: Research spike — MTPE (empleo y formalización) para cruzar inversión con actividad económica formal

> Igual que ADR-0007, ADR-0010 y ADR-0018: esto es una **investigación**, no una decisión de
> construir. Se documenta lo que se pudo confirmar en vivo sobre cinco datasets candidatos del
> Ministerio de Trabajo y Promoción del Empleo (MTPE), con nivel de confianza explícito por
> hallazgo. **No se decide build/no-build todavía.**

## Contexto

Surgió como pregunta abierta durante el trabajo de `docs/PRD_Servicios_Salud_Programas_Sociales_v1.md`:
¿qué información del MTPE podría exponer API/JSON/documentos estructurados relevantes para
Rastro? El interés concreto es si existe una fuente que permita cruzar inversión pública contra
actividad económica formal real, en el mismo espíritu que el cruce salud/social ya construido
(§SS-02/PS-03 de ese PRD).

Se identificaron 5 datasets candidatos en el catálogo de `datosabiertos.gob.pe`
(`package_list` + `package_show`, mismo método que ADR-0018) y se verificó cada uno en vivo
descargando el recurso real, no por snippets de búsqueda.

## Hallazgo 1 — Empresas en el Sector Privado por distrito: confianza alta, el más prometedor

- Dataset: `empresas-en-el-sector-privado-por-mes-según-distritos-ministerio-de-trabajo-y-promoción-del`.
- Recurso confirmado y descargado: `Dataset__Empr_Sect_Privado_mes_ 2022_MTPE.csv` — **1,398
  distritos** (cobertura nacional), formato ancho: `FECHA_CORTE;CODIGO_DE_UBIGEO;DISTRITOS;ENERO`
  hasta `DICIEMBRE` (conteo de empresas activas por mes, un año calendario por archivo).
- Delimitador `;`. Gotcha confirmado: los valores numéricos traen un espacio final (`"546 "`,
  no `"546"`) — un `Number()` sin `trim()` puede fallar dependiendo del motor.
- **Existe un dataset gemelo más antiguo** (`empresas-en-el-sector-privado-por-meses-según-distritos`,
  nótese "meses" en plural, sin sufijo MTPE) con un recurso 2021 en CSV y otro 2021 en XLSX —
  mismo contenido, publicado dos veces bajo dos slugs distintos. Usar el dataset con sufijo MTPE
  (más reciente, con recurso 2022 confirmado) como fuente primaria.
- **Pendiente de confirmar**: si existen recursos de años posteriores a 2022 (no se buscó
  exhaustivamente más allá de confirmar la estructura), y si `CODIGO_DE_UBIGEO` usa el mismo
  formato de 6 dígitos que ya usan `investments`/`ipress`/`cobertura_social` (la muestra
  descargada sugiere que sí: `010101`, `010103`, etc., mismo patrón).
- **Por qué es el más prometedor**: es la única de las 5 fuentes con granularidad distrital,
  serie temporal mensual, y sin ningún riesgo de PII (conteo de empresas, no de personas).

## Hallazgo 2 — Generación de Empleo Temporal (Trabaja Perú): un recurso descartado por PII, otro viable

El dataset `generación-de-empleo-temporal-ministerio-de-trabajo-y-promoción-del-empleo` tiene
**dos recursos con perfiles de riesgo completamente distintos** — mismo patrón de alerta que
INFOMIDIS/Pensión 65 en ADR-0018, pero acá el resultado es el opuesto:

- **`Personas_Trabaja_Peru.xlsx` — DESCARTADO, PII confirmado en vivo.** Descargado y abierto:
  **123,519 filas con `DNI` individual** de beneficiarios del programa, más el monto pagado a
  cada persona. Esto es exactamente el tipo de dato que `docs/ABOUT_RASTRO.md` (§9.5, §11.4)
  prohíbe cruzar — nunca ingerir este recurso, sea cual sea el ángulo del cruce.
- **`Procesos_Seguimiento_Trabaja_Peru.xlsx` — viable, agregado por actividad/convenio.**
  Confirmado en vivo: **4,461 filas**, sin nombres ni DNI — columnas `Ubigeo_Ejecutor`,
  `Ubigeo_Obra`, `Nombre_Entidad`, `Nro_Empleos_Programados`, `Monto_Total`, fechas de proceso.
  Mismo nivel de agregación que `investments` (proyecto/convenio, no persona).
- **Limitación real, no de privacidad sino de vigencia**: las fechas confirmadas en el recurso
  viable van de **junio a agosto de 2020 únicamente** — es el registro histórico cerrado del
  programa de emergencia (Decreto de Urgencia 070-2020, respuesta a la pandemia), no una serie
  viva. El `Last-Modified` HTTP del archivo es 2024-07-17, pero es un re-alojamiento del mismo
  archivo estático, no una actualización de contenido — confirmado por el rango de fechas interno.
- **Conclusión**: útil solo como snapshot histórico de un programa ya cerrado, no como fuente
  recurrente para cruzar con inversión actual.

## Hallazgo 3 — Empleo Registro Administrativo: descartado, sin UBIGEO

- Dataset: `empleo-registro-administrativo-ministerio-de-trabajo-y-promoción-del-empleo-mtpe`.
  El más recientemente actualizado de los 5 (recurso subido el 2026-05-29).
- Descargado y confirmado: **61 filas**, una por "zona de trabajo" de una dirección/gerencia
  regional del MTPE (ej. "CHACHAPOYAS", "BAGUA GRANDE") — **sin columna de UBIGEO ni distrito**,
  agregado a nivel de oficina regional del MTPE, no de territorio administrativo.
- Encoding no confirmado con certeza (probable Windows-1252 o similar — los acentos no
  decodifican limpio ni como UTF-8 ni como Latin-1 en la inspección rápida de este spike).
- **Conclusión**: descartado para el patrón de cruce por UBIGEO que usa el resto del proyecto —
  la granularidad no es compatible sin un mapeo adicional zona-MTPE → distrito, no confirmado
  que exista públicamente.

## Hallazgo 4 — Puestos de trabajo registrados (PLAME/T-Registro): confianza baja, sin confirmar estructura interna

- Dataset: `puestos-de-trabajo-registrados-en-el-sector-formal-asalariado-privado-periodo-primer-...`.
- A diferencia de los otros 4, los recursos de datos (no el diccionario) están alojados en
  **`cuentadatosabiertos.blob.core.windows.net`** (Azure Blob Storage), no en
  `datosabiertos.gob.pe` — un dominio distinto, sin el WAF ya conocido, pero tampoco verificado
  en este spike si tiene sus propias restricciones de descarga.
- Recursos confirmados vía `package_show`: archivos `.zip` semestrales desde enero 2020 hasta
  julio-setiembre 2021 (`Puestos_Enero_2020_MPTE.zip`, etc.), fuente declarada como Planilla
  Electrónica (PLAME + T-Registro).
- **No se pudo confirmar la estructura interna en este spike**: el primer ZIP (`Puestos_Enero_2020_MPTE.zip`)
  pesa más de 110 MB y la descarga se truncó por el límite de tiempo de esta sesión antes de
  completarse — el archivo quedó corrupto para efectos de inspección, no se abrió ni una fila.
  **No se recomienda reintentar la descarga completa sin decidir primero si esta fuente vale la
  pena** (dado el hallazgo 1, que ya cubre la necesidad de "actividad económica formal por
  distrito" con un archivo ~800x más liviano).
- **Riesgo a verificar antes de cualquier decisión de construir**: no se sabe si el detalle es a
  nivel de empresa (RUC) o de trabajador individual — el nombre "puestos de trabajo" sugiere
  posiciones, pero la fuente (PLAME/T-Registro) es intrínsecamente un registro laboral que en
  otras publicaciones del Estado peruano sí ha expuesto RUC de empleador sin datos de la persona;
  no asumir sin abrir el archivo real.

## Addendum — fuente más fresca encontrada fuera de PNDA (2026-09-05)

A pedido explícito de revisar si había información más reciente en otro lugar antes de dar por
buena la vigencia de 2022 del Hallazgo 1: **sí existe, y es sustancialmente mejor.**

MTPE mantiene su propio portal operativo de estadísticas
(`www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/`), separado de la PNDA, con
**"Indicadores Laborales a Nivel Distrital"** publicados anualmente desde **2014 hasta 2025**
(el año más reciente confirmado, no un snapshot congelado). Cada año se publica como una
publicación en `gob.pe/institucion/mtpe/informes-publicaciones/...`, que enlaza un archivo
comprimido `.7z` alojado en `cdn.www.gob.pe`.

**Confirmado en vivo, descargado y abierto** (`8222238-indicadores-a-nivel-distrital-2025.7z`,
19.8 MB comprimido, un único archivo `INDICADORES A NIVEL DISTRITAL 2025.xlsx` de 23 MB
adentro): la hoja `EMPRESAS_25` es **el mismo dataset exacto** que el Hallazgo 1 de PNDA
("NÚMERO DE EMPRESAS EN EL SECTOR PRIVADO POR MESES, SEGÚN DISTRITOS"), mismas columnas
(`Código de Ubigeo`, `DISTRITOS`, `ENERO`...`DICIEMBRE`, con "SETIEMBRE" igual que en PNDA), pero
para **el año 2025** — 3 años más reciente que lo único disponible en PNDA. **1,515 distritos**
(más que los 1,398 de la versión 2022 de PNDA — probablemente distritos nuevos creados en el
intervalo, no verificado en este addendum).

El archivo Excel trae, además, **48 hojas más** con indicadores relacionados (tamaño de empresa,
remuneraciones, trabajadores por sexo/régimen laboral/tipo de contrato, pensionistas, etc.) — un
universo de datos mucho más rico que el CSV simple ya ingerido, sin explorar en este addendum más
allá de confirmar que `EMPRESAS_25` reproduce la misma estructura.

### Por qué esto no se encontró en el spike original

El spike original (package_list/package_show de `datosabiertos.gob.pe`) solo cubre lo que MTPE
publica *en la PNDA*. Este portal (`www2.trabajo.gob.pe` y las publicaciones en
`gob.pe/institucion/mtpe/informes-publicaciones/`) es una fuente completamente distinta que la
PNDA no indexa ni enlaza — el mismo patrón de "portal operacional vs. dataset en el catálogo
central" que ya se vio con MIDAGRI/SIEA en ADR-0007 y CEPLAN en ADR-0009, pero acá el resultado es
al revés: el portal operacional SÍ tiene el dato exportable (no es un dashboard sin descarga como
en esos casos), simplemente MTPE nunca lo republicó en la PNDA con el mismo nivel de vigencia.

### Riesgo de acceso confirmado, mismo patrón que el resto del proyecto

`gob.pe` devuelve **HTTP 418** al user-agent por defecto de herramientas de fetch automatizado
(confirmado con WebFetch) — mismo WAF que `datosabiertos.gob.pe`. Con un header `User-Agent` de
navegador real, la descarga funciona sin problema. El archivo requiere además descomprimir `.7z`
(no soportado nativamente por `Expand-Archive` de Windows ni por ninguna librería Node ya usada
en el proyecto) — se necesitaría `7-Zip` en el sistema o una librería JS de descompresión 7z
(ej. `7z-wasm` o invocar un binario `7z` externo), una dependencia nueva que ningún conector
existente del proyecto tiene todavía.

### Migrado (2026-09-05)

Decisión de producto tomada: migrar. El conector `actividad-empresarial` se reescribió por
completo (`mtpe-distrital-connector.ts` + `mtpe-distrital-parse.ts`) para apuntar a este portal
en vez de PNDA. Verificado en vivo de punta a punta: scraping del listado → resolución del año
2025 → descarga del `.7z` real → descompresión (`node-7z`+`7zip-bin`) → parseo del `.xlsx`
(`exceljs`) → 1,510 distritos, 18,120 filas insertadas en Postgres real. Detalle completo en
`docs/data-contracts/mtpe-empresas-sector-privado.md`.

**No se hizo backfill de 2014-2024** — cada corrida ingiere solo el año más reciente publicado;
extender a una serie histórica queda como trabajo futuro si se decide, verificando cada año
individualmente antes de asumir que comparte la misma estructura de hoja.

## Conclusión del spike

| Dataset | Confianza | Recomendación |
|---|---|---|
| Empresas Sector Privado por distrito | Alta | **Migrado (2026-09-05)** a la fuente de `www2.trabajo.gob.pe` (2014-2025, año más reciente ingerido: 2025). La versión 2022 de PNDA queda reemplazada por completo. |
| Trabaja Perú (seguimiento, agregado) | Alta | Válido pero histórico y cerrado (jun-ago 2020) — solo útil como snapshot puntual, no serie viva |
| Trabaja Perú (personas) | Alta (de descarte) | **Nunca ingerir** — DNI individual confirmado |
| Empleo Registro Administrativo | Alta (de descarte) | Sin UBIGEO — no compatible con el patrón de cruce del proyecto |
| Puestos de trabajo (PLAME/T-Registro) | Baja | Pendiente — requiere descargar y abrir el ZIP completo (fuera de esta sesión) antes de opinar |

Si se decide avanzar, el candidato natural para un PRD ejecutable es el Hallazgo 1 (Empresas en
el Sector Privado por distrito) — mismo nivel de rigor y verificación que RENIPRESS/INFOMIDIS en
ADR-0018, listo para diseñar un conector sin pasos de investigación adicionales pendientes salvo
confirmar si hay recursos más recientes que el corte 2022 ya descargado.

## Consecuencias

- No se crea ninguna app ni conector en este ADR — es investigación pura, igual que ADR-0018
  antes de su PRD ejecutable.
- Si se decide construir sobre el Hallazgo 1, el siguiente paso natural es un PRD ejecutable con
  el mismo formato que `docs/PRD_Servicios_Salud_Programas_Sociales_v1.md` (Decisión de
  producto, Alcance funcional por tickets, Requisitos no funcionales, Riesgos).
- El Hallazgo 2 (recurso "Personas") queda documentado explícitamente como **fuente prohibida**
  para cualquier trabajo futuro de Rastro, no solo "no prioritaria" — para que nadie la reconsidere
  sin releer esta cautela.
