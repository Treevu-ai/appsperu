# Ingeniería inversa del bundle de OSCE — qué hicimos, qué aprendimos, y qué expone el Estado sin darse cuenta

> Fecha: 2026-09-03. Complementa
> `docs/COBERTURA_Y_CUMPLIMIENTO.md` — este documento es la narrativa técnica y las
> lecciones, aquel es la evaluación de riesgo formal.

## Qué hicimos

El conector `perfilprov-conformacion-connector.ts` (rama
`chore/dev-local-memory-constrained-subset`) consume dos endpoints JSON del backend interno
de OSCE que no aparecen en ningún catálogo de datos abiertos ni documentación pública —
uno de búsqueda de proveedor y otro de ficha completa por proveedor. Las rutas exactas
viven solo en el código del conector (`perfilprov-conformacion-connector.ts`), no se
repiten aquí deliberadamente, para que este documento no funcione como instructivo de
replicación.

Se descubrieron inspeccionando el bundle JavaScript compilado de la SPA Angular que sirve
el buscador público de proveedores de OSCE — específicamente el objeto `environment`
embebido en el bundle, que declara las URLs base de esos servicios. No hubo que romper
ninguna protección: los endpoints responden JSON sin autenticación, sin API key, sin
captcha, a cualquier request bien formado. La SPA los llama así porque el navegador del
usuario ya está "autenticado" simplemente por estar en la página — no hay sesión, no hay
token, el control de acceso completo vive en el hecho de que un humano llegó ahí clickeando
desde el buscador oficial.

## Qué aprendimos

**1. La mayoría del "control de acceso" en portales estatales peruanos con SPA es solo
disciplina de UI, no enforcement de servidor.** El patrón se repite: un frontend Angular/
React/Vue llama a un backend REST propio, ese backend no valida origen, no exige token, no
rate-limitea por defecto — confía en que "nadie va a llamar directamente al JSON". Es
seguridad por oscuridad, y se rompe con `view-source` o la pestaña Network del navegador en
minutos, sin herramientas especializadas.

**2. Esto es cualitativamente distinto de los otros 13 conectores de Rastro.** SEACE,
INFOBRAS, MEF Consulta Amigable, RNP — todos son portales de datos abiertos con vocación
explícita de difusión masiva, algunos incluso con API documentada. El endpoint de OSCE es
la fontanería interna de un formulario de búsqueda, expuesta accidentalmente al público
general por cómo está construida la SPA, no porque OSCE haya decidido publicarla.

**3. El dato final es el mismo que vería cualquier persona usando el buscador oficial —
pero el método de obtenerlo a escala no tiene el mismo respaldo normativo.** Ley 27806
legitima republicar lo que el Estado ya hace público; no dice nada sobre si automatizar
miles de consultas contra un endpoint no documentado es "uso previsto". Es una zona gris
real, no resuelta por la ley de transparencia.

## Cómo lo mitigamos en Rastro (decisiones tomadas hoy)

- **Minimizar campos expuestos**: se retiró `numeroAcciones`/`porcentajeAcciones` de la API
  pública — el caso de uso (detectar vínculos societarios repetidos entre RUCs) no requiere
  el detalle patrimonial exacto de una persona, solo la relación socio↔empresa.
- **Enmascarar identificadores**: el número de documento (DNI/CE) se sirve con solo los
  últimos 3 dígitos visibles; el valor completo se conserva en base de datos únicamente
  para deduplicación interna, nunca en la respuesta HTTP.
- **Cortesía operativa**: 300ms de espera entre requests por RUC (ya implementado desde el
  diseño original del conector) — evita que el patrón de tráfico luzca como un ataque o un
  scraping agresivo.
- **No buscar autorización formal de OSCE**: decisión explícita y deliberada. Pedir permiso
  convierte una zona gris hoy defendible ("el dato es público, el método no está
  expresamente prohibido") en una prohibición explícita si la respuesta es no — y una
  entidad pública, ante la duda, tiende a decir no por defecto antes que asumir el riesgo de
  autorizar algo que no entiende bien. El riesgo residual se gestiona con perfil operativo
  bajo, no con gestión documentaria.
- **Disposición a desactivar sin fricción**: el conector es aislado (una tabla, una ruta, un
  archivo de ingesta) — apagarlo si OSCE lo objeta directamente es una operación de minutos,
  no una migración de arquitectura.

Ninguna de estas mitigaciones elimina el riesgo de fondo (endpoint no documentado, consumo
automatizado sin autorización explícita). Lo que hacen es reducir el daño potencial si algo
sale mal, y evitar que Rastro sea el actor que convierte una ambigüedad en un conflicto.

## Extrapolación: qué más podría estar exponiendo el Estado sin darse cuenta

El patrón encontrado en OSCE (SPA que llama a un backend JSON sin auth real) no es
exclusivo de ese portal — es una consecuencia arquitectónica común a cualquier sistema
construido así. Sin haber verificado ninguno de los siguientes (esto es una hipótesis de
superficie de riesgo, no un hallazgo confirmado, y **no se debe validar probando contra
sistemas de terceros sin autorización** — eso ya no sería el mismo terreno defendible en el
que se apoya el conector actual):

- **Buscadores de expedientes/trámites de entidades públicas** (Poder Judicial, Ministerio
  Público, procedimientos administrativos) — si están construidos como SPA moderna, es
  plausible que tengan el mismo patrón: backend JSON sin protección real, solo "nadie mira
  el bundle".
- **Portales de verificación de identidad de bajo perfil** (constancias, certificados,
  registros de habilitación profesional) — el riesgo aquí es más alto que en OSCE porque
  suelen incluir campos como fecha de nacimiento o dirección, no solo nombre y DNI parcial.
- **Sistemas de mesa de partes virtual municipal/regional** — muchos gobiernos locales
  adoptaron plataformas genéricas (a veces el mismo proveedor para varias municipalidades)
  que podrían compartir la misma debilidad arquitectónica a escala, no solo en una entidad.
- **Buscadores de proveedores/contratistas de otras entidades reguladoras** (más allá de
  OSCE) que replican el mismo patrón de "ficha pública" respaldada por un API interno.

**El aprendizaje transferible para el Estado peruano, no solo para Rastro**: cualquier
entidad que construya una SPA debería tratar su propio backend JSON como una superficie
pública desde el diseño — con autenticación real, rate limiting server-side y, cuando el
dato incluye información personal, controles de acceso proporcionales — en vez de asumir
que "está bien porque nadie mira el bundle". Es el mismo error de fondo que llevó a que
Rastro pudiera construir este conector en un día sin credenciales de ningún tipo.

## Recomendación de postura para Rastro hacia adelante

Si el proyecto sigue encontrando este patrón en otras entidades, vale la pena una política
explícita del proyecto (no solo caso por caso): **usar el hallazgo para mejorar la
cobertura de Rastro cuando el dato es genuinamente de interés de transparencia y de bajo
riesgo personal — y no perseguir ni documentar públicamente el patrón de descubrimiento en
sí** (no publicar "cómo encontramos este endpoint" como contenido de marketing/LinkedIn,
por ejemplo), para no incentivar que terceros repliquen el método contra sistemas que sí
tengan datos sensibles reales detrás de la misma debilidad arquitectónica.
