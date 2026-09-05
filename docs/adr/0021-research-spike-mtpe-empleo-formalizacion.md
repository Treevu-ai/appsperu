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

## Conclusión del spike

| Dataset | Confianza | Recomendación |
|---|---|---|
| Empresas Sector Privado por distrito | Alta | Candidato real para un futuro PRD ejecutable — único con UBIGEO + serie temporal + sin PII |
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
