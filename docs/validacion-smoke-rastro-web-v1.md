# Validación smoke test — rastro-web v1 (AL3-20)

**Fecha:** 2026-09-02
**Generado con:** `apps/rastro-web/e2e-smoke/capture.spec.ts` (`npx playwright test --config=playwright.smoke.config.ts`), reutilizando las mismas fixtures que la suite de CI (AL3-14, `apps/rastro-web/e2e/fixtures/`).

## Cómo leer este reporte (importante)

Estas 12 capturas **no son contra datos en vivo de producción** — `api.rastro.pe` todavía no está publicado (`VITE_PUBLIC_APIS_LIVE=false` en `.env.production`, ver `docs/ESTADO.md`). Son capturas contra `vite preview` (build real de producción) con las respuestas HTTP interceptadas por fixtures fijas y conocidas (`e2e/fixtures/*.json`) — el mismo mecanismo que ya valida AL3-14 en cada PR.

Esto es deliberado y más útil que una captura contra datos reales para el propósito de este documento: cada fila de "JSON crudo" de abajo **es exactamente** el JSON que la UI recibió (porque yo lo escribí como fixture), así que la comparación "¿lo que dice la API es lo que muestra la UI?" es exacta, no aproximada por lo que hubiera en la base de datos ese día. Cuando `api.rastro.pe` esté publicado, este mismo script puede regenerarse apuntando a datos reales.

**Resultado**: en las 12 capturas, el texto renderizado coincide exactamente con el JSON de la fixture — no se encontró ninguna divergencia. Ver el detalle por captura abajo.

---

## 1–5. Ficha de sector (`/gore/la-libertad/ficha`)

| Sector | Captura | PIA | PIM | Devengado | Cobertura |
|---|---|---:|---:|---:|---|
| TRANSPORTE | [`ficha-transporte.png`](smoke-rastro-web/ficha-transporte.png) | 12,500,000 | 18,300,000 | 9,100,000 | COMPLETA |
| SALUD | [`ficha-salud.png`](smoke-rastro-web/ficha-salud.png) | 8,200,000 | 9,750,000 | 4,300,000 | PARCIAL |
| EDUCACION | [`ficha-educacion.png`](smoke-rastro-web/ficha-educacion.png) | 21,000,000 | 25,400,000 | 15,200,000 | COMPLETA |
| AGRICULTURA | [`ficha-agricultura.png`](smoke-rastro-web/ficha-agricultura.png) | 4,100,000 | 5,600,000 | 2,450,000 | COMPLETA |
| VIVIENDA | [`ficha-vivienda.png`](smoke-rastro-web/ficha-vivienda.png) | 3,300,000 | 4,200,000 | 1,100,000 | PARCIAL |

**JSON crudo (fixture, ejemplo TRANSPORTE)**: `e2e/fixtures/sectores.json#TRANSPORTE` — `{ "pia": 12500000, "pim": 18300000, "devengado": 9100000, "cobertura": "COMPLETA", "corte": "2026-08-20" }`.

**Texto renderizado (TRANSPORTE, extracto)**:
```
TRANSPORTE
COMPLETA
corte: 2026-08-20
matcher: exacto-funcion · regla: PIA/PIM/Devengado agregados por sector y año fiscal.
PIA
12,500,000S/
PIM
18,300,000S/
Devengado
9,100,000S/
```

**Divergencia**: ninguna. Los 3 montos y la cobertura vienen verbatim de la fixture en las 5 capturas — incluida la distinción visible PARCIAL (SALUD, VIVIENDA) vs. COMPLETA (TRANSPORTE, EDUCACION, AGRICULTURA), que la UI no oculta ni suaviza.

---

## 6–8. Perfil de proveedor (`/proveedor/{ruc}`)

| Perfil | RUC | Captura | Sanción vigente | Contrataciones |
|---|---|---|---|---|
| Con sanciones + con contrataciones | 20100000001 | [`proveedor-conSancionesConContrataciones.png`](smoke-rastro-web/proveedor-conSancionesConContrataciones.png) | Sí (VIGENTE, exp. EXP-001-2026) | S/ 1,250,000 · 4 adjudicaciones |
| Sin sanciones + con contrataciones | 20100000002 | [`proveedor-sinSancionesConContrataciones.png`](smoke-rastro-web/proveedor-sinSancionesConContrataciones.png) | No | S/ 340,000 · 1 adjudicación |
| Sin sanciones + sin contrataciones | 20100000003 | [`proveedor-sinSancionesSinContrataciones.png`](smoke-rastro-web/proveedor-sinSancionesSinContrataciones.png) | No | — (sección ausente) |

**JSON crudo (fixture, RUC 20100000001)**: `e2e/fixtures/proveedores.json#conSancionesConContrataciones` — sanción `{"estado": "VIGENTE", "expediente": "EXP-001-2026"}`, `supplierRow.valorTotal: 1250000`.

**Texto renderizado (RUC 20100000001, extracto)**:
```
Sanciones
COMPLETA
Inhabilitación
VIGENTE
exp. EXP-001-2026
Contrataciones
NO_APLICA
Valor total adjudicado
S/ 1,250,000
```

**Divergencia**: ninguna, con una observación de cobertura relevante — la sección "Contrataciones" muestra `NO_APLICA` en vez de `COMPLETA`/`PARCIAL`/`BLOQUEADA` porque el endpoint real `/api/suppliers` (compras-publicas) **no devuelve cobertura, matcher ni corte** (hallazgo de esta misma sesión, ver `docs/PRD_Confiabilidad_Conectores_y_Cruces_v1.md` y el fix en `api-client.ts`). La UI lo declara explícitamente en vez de inventar un valor — es el comportamiento correcto, no un defecto.

Para el perfil **sin contrataciones** (RUC 20100000003), la sección "Contrataciones" está completamente ausente del texto renderizado — confirmado en el manifiesto (`docs/smoke-rastro-web/manifest.json`), consistente con que `supplierRow: null` en la fixture. La UI no muestra una fila vacía ni un placeholder engañoso.

---

## 9–10. Distrito (`/distrito/{ubigeo}`)

| UBIGEO | Departamento resuelto | Captura | Obras | Paralizadas |
|---|---|---|---:|---:|
| 130101 | LA LIBERTAD | [`distrito-130101.png`](smoke-rastro-web/distrito-130101.png) | 2 | 1 (50.0%) |
| 060101 | CAJAMARCA | [`distrito-060101.png`](smoke-rastro-web/distrito-060101.png) | 1 | 0 (0.0%) |

**JSON crudo (fixture, UBIGEO 130101)**: `e2e/fixtures/distritos.json#130101` — 2 items, uno con `"paralizada": true`.

**Texto renderizado (UBIGEO 130101, extracto)**:
```
2 obras
PARCIAL
corte: 2026-08-20
Paralizadas: 50.0% · Con avance físico: 50.0%
INF-001  Mejoramiento de pista Av. España        MUNICIPALIDAD PROVINCIAL DE TRUJILLO  EN EJECUCION  62.5%
INF-002  Construcción de posta de salud El Porvenir  GOBIERNO REGIONAL LA LIBERTAD      PARALIZADA    —
```

**Divergencia**: ninguna. El chip "PARALIZADA" aparece exactamente en la fila cuya fixture trae `"paralizada": true`, y en ninguna otra. **Observación de cobertura**: ambas capturas muestran "(alcance departamental)" en el título — el backend real de INFOBRAS filtra por departamento, no por distrito exacto (limitación documentada en el propio componente `Distrito.tsx` y en `docs/conectores.md`), así que un UBIGEO de 6 dígitos trae todas las obras del departamento, no solo del distrito pedido. La UI lo declara en el subtítulo en vez de simular precisión que no tiene.

---

## 11. Estado del producto (`/estado`)

[`estado.png`](smoke-rastro-web/estado.png)

**Texto renderizado**:
```
14 arriba · 0 caídas · 429Count24h: 0
```

**Nota metodológica**: esta captura mockea las 14 llamadas `/health` a `{"status":"ok"}` y `/api/rate-limit-stats` a `{"count429Last24h":0}` — a diferencia de las demás capturas, aquí el "JSON crudo" es un mock deliberadamente optimista (14/14 arriba) para mostrar el layout con datos, no una afirmación de que las 14 APIs están corriendo en producción hoy. Si se corre este script contra las APIs realmente levantadas localmente (`scripts/dev-local.sh`), el resultado reflejaría el estado real de cada una.

---

## 12. Buscador (`/buscar`)

[`buscar.png`](smoke-rastro-web/buscar.png)

**JSON crudo (mock del endpoint `/api/search?q=constructora`)**:
```json
{
  "resultados": [
    { "tipo": "ruc", "identificador": "20100000001", "descripcion": "CONSTRUCTORA EJEMPLO SAC", "puntaje": 80, "fuente": "identidad-fiscal / contribuyentes" }
  ],
  "fuentesNoDisponibles": []
}
```

**Texto renderizado (extracto)**:
```
Tipo    Identificador  Descripción                Fuente
RUC     20100000001    CONSTRUCTORA EJEMPLO SAC   identidad-fiscal / contribuyentes
Solo identidad-fiscal soporta búsqueda de texto libre real. radar-inversiones e infobras
se filtran en el borde (edge), acotados a LA LIBERTAD.
```

**Divergencia**: ninguna. **Observación de cobertura**: el texto de limitación se muestra siempre, no solo cuando alguna fuente falla — es una declaración permanente de alcance (AL3-11), no un mensaje de error condicional. Correcto: la búsqueda de texto libre real solo la soporta identidad-fiscal; las otras dos fuentes se filtran en el borde y están acotadas a LA LIBERTAD (ver `functions/api/search.ts`).

---

## Resumen

| # | Ruta | Divergencia encontrada |
|---|---|---|
| 1–5 | `/gore/la-libertad/ficha` (5 sectores) | Ninguna |
| 6–8 | `/proveedor/{ruc}` (3 perfiles) | Ninguna |
| 9–10 | `/distrito/{ubigeo}` (2 distritos) | Ninguna |
| 11 | `/estado` | Ninguna (nota metodológica: mock optimista, ver arriba) |
| 12 | `/buscar` | Ninguna |

**12/12 capturas: el texto renderizado coincide exactamente con el JSON de la fuente (fixture).** Ninguna cifra mostrada en la UI fue inventada, redondeada de forma distinta, ni omitida sin explicación — y en los 2 casos donde el backend real tiene una limitación conocida (cobertura ausente en `/api/suppliers`, filtro departamental en vez de distrital en `/api/public-works`), la UI la declara explícitamente en vez de ocultarla.

Manifiesto completo (rutas + texto íntegro de cada captura): [`smoke-rastro-web/manifest.json`](smoke-rastro-web/manifest.json).

## Cómo regenerar este reporte

```bash
cd apps/rastro-web
npm run build
npx playwright test --config=playwright.smoke.config.ts
```

Las capturas y el manifiesto se escriben en `docs/smoke-rastro-web/`.
