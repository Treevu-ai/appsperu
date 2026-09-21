# Reporte de divulgación responsable — SENACE Datos Abiertos

**Fecha del hallazgo:** 2026-09-21
**Reportado por:** Ricardo Cuba (equipo Rastro, plataforma de datos cívicos)
**Sistema afectado:** `https://datosabiertos.senace.gob.pe/Api/` (API REST documentada en `/Api/Help`)
**Severidad estimada:** Alta — exposición de datos personales de terceros sin autenticación efectiva

## Resumen

La API de datos abiertos de SENACE expone varios "datastreams" bajo `/Api/datastreams/<nombre>`,
protegidos nominalmente por un parámetro `auth_key`. Al probar el datastream `CarteraProyectos`
con un valor de prueba (`auth_key=test`), la API respondió correctamente con `HTTP 400
{"Message":"Token Invalido."}`, indicando que sí valida el token.

Sin embargo, al probar el **mismo valor de prueba** (`auth_key=test`) contra el datastream
`Reclamos`, la API respondió con `HTTP 200` y devolvió el listado completo de reclamos
presentados por ciudadanos ante SENACE, incluyendo:

- Número de documento de identidad (DNI) del ciudadano reclamante.
- Nombre completo del ciudadano reclamante.
- Texto libre de la descripción del reclamo (puede contener información sensible adicional).
- Fecha del reclamo, número de expediente, estado de atención.

Esto indica que la validación de `auth_key` **no es consistente entre datastreams** — al menos
uno de ellos (`Reclamos`) no aplica un control de acceso real, permitiendo a cualquier persona sin
credenciales válidas acceder a datos personales de ciudadanos.

## Evidencia (reproducible)

```bash
# Datastream que SÍ valida (respuesta esperada, control funcionando):
curl "https://datosabiertos.senace.gob.pe/Api/datastreams/CarteraProyectos?auth_key=test"
# → HTTP 400 {"Message":"Token Invalido."}

# Datastream que NO valida (vulnerabilidad):
curl "https://datosabiertos.senace.gob.pe/Api/datastreams/Reclamos?auth_key=test"
# → HTTP 200, devuelve registros reales con DNI + nombre completo + texto del reclamo
```

No se realizaron más consultas a `Reclamos` tras confirmar el hallazgo, para minimizar la
exposición adicional de datos personales durante la investigación.

## Impacto

Cualquier persona con conocimiento del endpoint (documentado públicamente en `/Api/Help`) puede
extraer el historial completo de reclamos ciudadanos contra SENACE, incluyendo identificación
personal, sin necesidad de autenticarse legítimamente. Esto es una violación de la Ley de
Protección de Datos Personales (Ley N° 29733) y expone a los ciudadanos reclamantes a riesgos de
suplantación, hostigamiento o filtración de información sensible sobre trámites ambientales en
curso.

## Recomendación

1. Revisar la implementación de validación de `auth_key` en **todos** los datastreams de la API,
   no solo `CarteraProyectos` — el hallazgo sugiere que la validación se implementó de forma
   inconsistente por endpoint.
2. Rotar/invalidar cualquier token expuesto y auditar logs de acceso al datastream `Reclamos`
   para determinar si hubo accesos no autorizados previos.
3. Considerar remover el DNI y nombre completo de la respuesta pública de este datastream, o
   aplicar seudonimización, independientemente de la corrección del control de acceso.

## Canal sugerido de envío

- Mesa de ayuda de Gobierno Digital (PCM), que administra la Plataforma Nacional de Datos
  Abiertos: `mesadeayuda@gobiernodigital.gob.pe`.
- Oficina de Tecnologías de la Información de SENACE (verificar contacto en senace.gob.pe).
- Alternativamente, CERT-PE (Equipo de Respuesta ante Incidentes de Seguridad Digital del Perú)
  si existe un canal formal de reporte de vulnerabilidades del Estado.

---

*Este documento es un borrador para que el titular de Rastro lo envíe por el canal oficial que
corresponda. No fue enviado automáticamente por el agente.*
