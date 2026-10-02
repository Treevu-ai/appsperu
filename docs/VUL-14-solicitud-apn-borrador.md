# Borrador — Solicitud de Acceso a la Información Pública (Ley N° 27806)

**Ticket:** VUL-14 (ver `docs/backlog/backlog-rastro-proyectos.md`, Épica 4 · Índice de
Vulnerabilidad Portuaria, Historia 4.4)
**Estado:** BORRADOR — no enviado. El envío por el formulario de la APN (ver Destinatario) y el
seguimiento posterior (VUL-15/16) son acciones del usuario, no de este asistente.

---

## Destinatario

Autoridad Portuaria Nacional (APN)
Oficina de Acceso a la Información Pública
Vía formulario de solicitud de la APN: https://portalweb.apn.gob.pe/formulario-solicitud/

## Asunto

Solicitud de acceso a la información pública — Anuarios estadísticos de movimiento de carga
portuaria, periodo 2018-2025

## Texto sugerido

> De mi consideración:
>
> Al amparo del derecho de acceso a la información pública reconocido en el artículo 2, inciso 5
> de la Constitución Política del Perú y regulado por el Texto Único Ordenado de la Ley N° 27806,
> Ley de Transparencia y Acceso a la Información Pública (Decreto Supremo N° 021-2019-JUS), y su
> Reglamento (Decreto Supremo N° 007-2024-JUS), solicito a la Autoridad Portuaria Nacional (APN)
> se sirva proporcionar la siguiente información:
>
> 1. Volumen de carga movilizada (en toneladas métricas, TM) por terminal portuario a nivel
>    nacional, desagregado por año y por tipo de carga (contenedorizada, granel sólido, granel
>    líquido, otros), para el periodo comprendido entre el año 2018 y el año 2025.
> 2. De existir, el detalle por mes dentro de cada año, en el mismo formato que el "Anuario
>    Estadístico Portuario" publicado previamente por la APN para el periodo 2010-2017 (disponible
>    en datosabiertos.gob.pe).
> 3. Indicar si dicha información se encuentra disponible en formato de datos abiertos (CSV, XLSX
>    u otro formato estructurado) y, de ser el caso, el enlace de descarga directo.
>
> La presente solicitud se enmarca en un proyecto de análisis de datos abiertos sobre
> infraestructura de transporte ("Rastro"), orientado a construir un índice público de
> vulnerabilidad de terminales portuarios que incorpore el volumen histórico de carga como
> variable de exposición — hoy el índice solo usa variables de inventario (MTC), sin datos de
> tráfico real.
>
> Solicito que la respuesta sea remitida por esta misma vía o, alternativamente, al correo
> electrónico [COMPLETAR], dentro del plazo de diez (10) días hábiles establecido para este
> trámite, prorrogable de forma justificada cuando exista imposibilidad material de cumplirlo en
> dicho plazo.
>
> Quedo atento a su respuesta.
>
> Atentamente,
> [NOMBRE COMPLETO]
> DNI [COMPLETAR]

---

## Notas para quien envíe esto (no parte de la carta)

- Completar nombre, DNI y correo antes de enviar.
- El plazo del trámite vigente es de **10 días hábiles** desde la presentación. Si la entidad no
  puede cumplirlo por imposibilidad material (caso excepcional), debe comunicar dentro de 2 días
  hábiles de recibida la solicitud la fecha en la que sí entregará la información, debidamente
  justificada — no es una prórroga automática.
  **Nota de verificación:** esta sesión primero citó 7+5 días hábiles tomados del texto del TUO de
  la Ley N° 27806 (artículo 11), pero el trámite oficial vigente publicado en la Plataforma del
  Estado Peruano indica 10 días hábiles — corregido tras encontrar la discrepancia (señalada por
  revisión de CodeRabbit en PR #224) y verificarla con una segunda fuente independiente. Fuente:
  [Solicitar acceso a la información pública — trámite 20399, gob.pe](https://www.gob.pe/20399-solicitar-acceso-a-la-informacion-publica).
  No se investigó a fondo la causa de la discrepancia (podría deberse a una modificación
  normativa posterior al TUO consultado, o a una variación de la propia APN) — si esto importa,
  verificar directamente con la APN antes de enviar.
- **Nota de verificación (reglamento y canal de envío):** esta sesión citó inicialmente el
  Decreto Supremo N° 093-2003-PCM como Reglamento de la Ley N° 27806 — cita incorrecta, ese
  decreto no guarda relación con la Ley de Transparencia. El Reglamento vigente es el Decreto
  Supremo N° 007-2024-JUS (hallazgo de CodeRabbit en PR #224, corregido). También se reemplazó
  el enlace genérico al portal de transparencia por el formulario específico de la APN
  (https://portalweb.apn.gob.pe/formulario-solicitud/), que es el canal real de presentación. Ese
  cambio dejó una inconsistencia que CodeRabbit señaló en una segunda revisión: el resto del
  documento seguía hablando de "la Plataforma Nacional" y de un "número de expediente" como si el
  formulario de la APN fuera esa misma plataforma — corregido para no asumir esa equivalencia sin
  confirmarla.
- Guardar cualquier constancia, comprobante o correo de confirmación que entregue el formulario de
  la APN al enviarlo — no está confirmado en esta sesión si ese formulario asigna un número de
  expediente formal (eso sí ocurre en la Plataforma Nacional de Transparencia Estándar, un canal
  distinto que este borrador ya no usa). Verificar al momento de enviar qué comprobante entrega
  realmente y conservarlo; es lo que se necesita para reclamar si no hay respuesta dentro del
  plazo.
- Si la APN no responde o deniega sin motivación legal, cabe un recurso de apelación ante el
  Tribunal de Transparencia y Acceso a la Información Pública (TTAIP) — verificar el plazo y
  procedimiento vigente en gob.pe antes de usarlo; no confirmado en esta sesión con la misma
  rigurosidad que el plazo de respuesta.
- Si la respuesta trae datos nuevos: el siguiente paso es VUL-17 (ingest del dataset nuevo y
  actualización del índice de vulnerabilidad portuaria a v3) — no implementado todavía, queda
  pendiente de que la solicitud reciba respuesta.
