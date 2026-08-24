# Data contract — Proveedores sancionados (RNP/OECE, Tribunal de Contrataciones)

> Ficha técnica del conector: [`docs/conectores.md#proveedores-sancionados`](../conectores.md#proveedores-sancionados)

Investigado y construido en vivo: 2026-08-20.

## Fuente confirmada

- **Portal de consulta**: `https://www.rnp.gob.pe/consultasenlinea/inhabilitados/busqueda_vnv.asp`
  — "Relación de proveedores sancionados por el Tribunal de Contrataciones Públicas de los
  últimos cinco años". El dominio antiguo `osce.gob.pe` ahora redirige a `gob.pe/oece`
  (OSCE → OECE, cambio de nombre del organismo) — el portal de consulta real vive en `rnp.gob.pe`.
- **Descartado explícitamente**: el dataset homónimo en `datosabiertos.gob.pe`
  ("Proveedores sancionados con inhabilitación — OECE") está **abandonado desde marzo de 2018**
  — confirmado navegando hasta el final del archivo real (2845 registros, el último con fecha
  `2018-03-26`). La ficha del dataset decía "Fecha modificada: 2026-06-17", pero era solo un
  toque de metadata, no una actualización real. **No usar esta fuente.**

## Descarga confirmada — vía HTTP simple, sin navegador, sin captcha

El botón "Exportar Excel" del portal dispara `f_exportar_vnv()`
(`assets/js/fnc_buscadores.js`), que hace un `POST` de formulario a
`Reporte_Sancionados_Tribunal_vnv_xls.asp?action=enviar&valor=0` con los campos vacíos (todos
los proveedores, sin filtro). **Esta función NO valida captcha, ni en JS ni en el servidor**
(a diferencia de `f_buscarTodos_vnv()`, el botón "Listar todos", que sí lo valida en JS) — es
una debilidad real y pública del sitio, no algo evadido por este proyecto.

**Verificado en vivo**: réplica del flujo con `curl` puro —

1. `GET busqueda_vnv.asp` → cookie de sesión ASP clásica (`ASPSESSIONID...`).
2. `POST Reporte_Sancionados_Tribunal_vnv_xls.asp?action=enviar&valor=0` con
   `rz=&ruc=&tipSanc=&estVgt=&captchacode=&txtRuc1=&hSolicitaToken=ok&valor=0`, reusando la
   cookie del paso 1.
3. Resultado: **200 OK, 20,188,994 bytes, `Content-Type: application/vnd.ms-excel`**.
4. **MD5 idéntico** al archivo descargado manualmente haciendo clic en la interfaz real
   (`9699a58aaa162f92590792c978b5a483`) — confirma que la réplica por HTTP es exacta, no una
   aproximación.

## Formato real — HTML disfrazado de `.xls`, con DOS secciones distintas

Mismo patrón que otros exports ASP clásicos de este proyecto: el archivo es HTML plano
(generado por Visual Studio 6.0, según el `<META NAME="GENERATOR">`), no XLS binario ni XML.
Contiene **dos tablas con columnas distintas** dentro del mismo archivo:

**Sección "Definitivo/Temporal" (inhabilitaciones) — 11 columnas:**
`# | Razón Social | RUC | Resolución | Periodo de Inhabilitación | Desde | Hasta | Infracción |
Otra Infracción | Norma | Estado`

**Sección "Multa" — 14 columnas:**
`# | Razón Social | RUC | Resolución | Fecha de Resolución | Monto de Multa (Soles) |
Infracción | Periodo de Suspensión(medida cautelar) | Desde | Hasta | Otra Infracción | Norma |
Verificación de pago | Estado`

El parser (`src/ingest/html-table.ts`) extrae filas por regex tolerante (`<tr>...</tr>`, celdas
de texto dentro de `<font>...</font>`) — no es XML bien formado, mismo criterio que ya se usó
para el sheet de INFOBRAS. `src/ingest/normalize.ts` detecta el cambio de sección por la fila de
encabezado (contiene "Periodo de Inhabilitación" vs. "Monto de Multa") antes de normalizar cada
fila de datos con el esquema de columnas correcto.

## Muestra real verificada (2026-08-20)

- Registro más reciente encontrado: **31/07/2026** — dataset genuinamente vivo, a diferencia del
  abandonado en `datosabiertos.gob.pe`.
- ~11,000 RUC únicos en el archivo completo (nacional, no filtrado por región — el reporte no
  ofrece filtro geográfico, solo por RUC/razón social/tipo de sanción/vigencia).
- Caso real confirmado end-to-end: `GEOMATICA CONSULTORES Y EJECUTORES S.A.C.` (RUC
  `20571603579`), inhabilitación `DEFINITIVO` desde `2026-07-31`, resolución `6386-2026-TCP-S4`,
  estado `VIGENTE`.
- Caso real de multa: `PUMA ASOCIADOS ... S.R.L.` (RUC `20527848246`), multa de
  `S/3,611,558.19`, resolución `1992-2026-TCP-S5`, con periodo de suspensión cautelar de 3 meses.

## Lo que esto habilita

Cruce por RUC exacto (mismo patrón que `identidad-fiscal`) contra `compras-publicas` — pero con
una señal **legalmente más fuerte** que el estatus tributario: una inhabilitación `VIGENTE`
significa que el proveedor tiene prohibido contratar con el Estado. Si aparece con una
adjudicación real en `compras-publicas`, es un hallazgo directo, no una inferencia de estatus
tributario.

## Limitaciones explícitas

- **Sin filtro geográfico en el origen** — se ingiere el universo nacional completo; el filtro a
  La Libertad ocurre en el cruce (`compras-publicas.awards.departamento`), no en la ingesta.
- **Sin PK natural única del origen** — se usa `(ruc, resolución, desde/fecha_resolución)` como
  llave de upsert; una misma resolución puede aplicar a varios RUC (sanción a un consorcio
  completo) y un mismo RUC puede tener varias resoluciones distintas — ambos casos confirmados
  en la muestra real.
- **La ausencia de un RUC en este dataset no prueba que esté limpio** — solo prueba que no fue
  sancionado en los últimos 5 años según este reporte específico; sanciones más antiguas no
  aparecen aquí (el título del reporte lo declara explícito: "de los últimos cinco años").
- **El flujo HTTP replicado depende de que RNP no valide captcha en `f_exportar_vnv()`** — si el
  sitio cierra esa debilidad en el futuro, el conector empezaría a fallar con una respuesta de
  error en vez de el archivo — no asumir que este acceso es permanente.
