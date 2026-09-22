# Spike CFM-01 — Conflicto de uso de suelo (forestal × minero)

Verificado en vivo 2026-09-21 contra Postgres real (`catastro-forestal`, `catastro-minero`,
`ceplan-geo`), no muestra ni estimación.

## 1. `nom_dep`/`nom_pro`/`nom_dis` son códigos UBIGEO, no nombres

Confirmado en `docs/data-contracts/serfor-catastro-forestal.md`: en 9 de las 10 capas de SERFOR
(incluida `modalidad_concesiones_forestales`, la usada aquí), estos campos son códigos UBIGEO como
texto (ej. `nom_dep: "17"` = Madre de Dios), no nombres reales. **Decisión:** traducir vía
`territories` de `ceplan-geo` (1,874 distritos, `ubigeo` único, join exacto) en vez de comparar
texto contra `catastro_minero_derechos.departamento`/`distrito` (que sí trae nombres reales).

## 2. `SITUAC` no tiene significado documentado — no se usa para vigencia

El diccionario de datos de SERFOR no documenta los valores de `SITUAC` (0/1/2 observados en vivo,
distribución distinta por capa). No se adivina su significado. **Decisión:** vigencia real se
calcula con `fec_ter` (`IS NULL OR > CURRENT_DATE`), mismo criterio temporal que
`inhabilitaciones` en `proveedores-sancionados`. En `modalidad_concesiones_forestales` (1,793
filas nacional): 1,164 vigentes por fecha, 621 sin fecha de término (indefinidas), 8 vencidas.

## 3. Distribución nacional de concesiones forestales vigentes por departamento (vía UBIGEO)

| Departamento (código UBIGEO) | Concesiones |
|---|---|
| Madre de Dios (17) | 1,214 |
| Loreto (16) | 242 |
| Ucayali (25) | 148 |
| San Martín (22) | 95 |
| Huánuco (10) | 37 |

**Decisión:** departamento default = MADRE DE DIOS (mayor volumen de datos, y coincide con la zona
de mayor conflicto forestal-minero documentado públicamente en Perú — La Pampa/Huepetuhe).

## 4. `catastro_minero_derechos.estado` — valor usado para "derecho activo"

14 valores reales, nacional (66,870 filas). `estado = 'T'` ("D.M. Titulado D.L. 708", 38,239
filas) es el más cercano a "derecho minero activo/titulado". `P` (en trámite, 17,939) se excluye
deliberadamente -- no es un derecho otorgado todavía.

## 5. Cruce real — Madre de Dios, primer resultado

11 distritos con concesión forestal vigente en Madre de Dios; 6 tienen al menos un derecho minero
titulado en el mismo distrito:

| Distrito | Concesiones forestales (ha) | Derechos mineros titulados (ha) |
|---|---|---|
| Huepetuhe | 5 (32,957) | 190 (32,105) |
| Madre de Dios (Manu) | 34 (248,957) | 305 (63,993) |
| Laberinto | 52 (26,876) | 154 (30,798) |
| Inambari | 199 (104,235) | 146 (40,988) |
| Tambopata | 276 (62,509) | 41 (6,279) |
| Las Piedras | 402 (90,956) | 4 (900) |

**Hallazgo real, no buscado:** en Huepetuhe y en el distrito Madre de Dios (Manu), la superficie de
derechos mineros titulados es comparable o mayor a la superficie de concesión forestal vigente en
el mismo distrito. Huepetuhe es zona de minería informal/ilegal ampliamente documentada
públicamente (cuenca del Malinowski/La Pampa) -- esto es consistente con esa realidad conocida,
no un hallazgo nuevo de corrupción, pero sí la primera vez que Rastro lo expone como dato
consultable.

## 6. Limitación real — sin geometría

Ni `catastro_forestal_titulos` ni `catastro_minero_derechos` traen geometría en este conector
(confirmado en sus schemas reales). El cruce es por **coincidencia de distrito**, no superposición
de polígonos -- dos derechos en el mismo distrito pueden no superponerse físicamente. Documentado
explícitamente en la respuesta del endpoint (`restriccion`).

## Decisión

`AUTOMATIZABLE` con el alcance de distrito (no polígono). CFM-01 procede con:
- Capa `modalidad_concesiones_forestales`, vigencia por `fec_ter`.
- Traducción UBIGEO vía `territories` de ceplan-geo.
- `catastro_minero_derechos.estado = 'T'`.
- Default MADRE DE DIOS, `departamento` como query param.
- Metadata obligatoria: `matcher`, `restriccion` (sin geometría, sin causalidad).
