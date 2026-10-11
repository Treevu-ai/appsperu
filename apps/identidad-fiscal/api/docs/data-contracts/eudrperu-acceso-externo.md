# Contrato de acceso: proyecto externo `eudrperu`

**Estado:** vigente desde 2026-10-11.
**Fecha:** 11 de octubre de 2026.

---

## 1. Qué es esto

`eudrperu` (`C:\Users\acuba\eudrperu\`) es un proyecto **separado** de Rastro, sobre
cumplimiento del Reglamento (UE) 2023/1115 para organizaciones cafetaleras y
cacaoteras peruanas. No es una app de este monorepo y no debe convertirse en una.

Usa la base `identidad_fiscal` de Rastro (Neon, proyecto `appsperu`) como backend
de datos, porque las tablas `eudr_*` (migración `013_eudr_trazabilidad.sql`) se
diseñaron para enlazar por `ruc` contra `contribuyentes` y `ruc_exportaciones_fob`,
que ya existen ahí. Ese es el único motivo de la relación entre ambos proyectos:
no hay ninguna otra dependencia de código ni de infraestructura.

Antecedente: el 2026-10-11 esta misma migración se aplicó por error en la base
`neondb` (default del proyecto Neon) en vez de `identidad_fiscal`, por un script
de `eudrperu` que usó el `DATABASE_URL` del `.env.local` de la raíz de `appsperu`.
Se revirtió y se reaplicó bien. Este contrato existe para que no se repita.

## 2. Qué puede hacer `eudrperu` contra esta base

- **Leer** `contribuyentes`, `ruc_exportaciones_fob`, `ficha_ruc` y cualquier otra
  tabla existente de `identidad_fiscal`, para cruzar RUC y datos de exportación.
- **Leer y escribir** las tablas `eudr_*` y las vistas `v_eudr_cobertura_org` /
  `v_eudr_trazabilidad` — son el espacio propio de `eudrperu` dentro de esta base.

## 3. Qué NO puede hacer

- No escribir en ninguna tabla que no empiece con `eudr_` (`contribuyentes`,
  `ruc_exportaciones_fob`, `ficha_ruc`, `cooperativas`, etc. son de Rastro,
  solo lectura para `eudrperu`).
- No cambiar el esquema de `eudr_*` fuera de una migración versionada en
  `apps/identidad-fiscal/api/src/db/migrations/` de **este** repo. Si `eudrperu`
  necesita una columna o tabla nueva, se pide aquí, no se agrega con un
  `ALTER TABLE` suelto desde un script de `eudrperu`.
- No usar el `.env.local` de la raíz de `appsperu` para nada. Ese archivo no
  especifica base de datos y cae en el default (`neondb`) del proyecto Neon,
  que no es la base de ninguna app — es precisamente el error que causó el
  incidente del punto 1.
- No vivir código de `eudrperu` (scripts de reportes, triaje, plantillas) dentro
  de este repo. Si aparece un script de `eudrperu` suelto en la raíz de
  `appsperu`, es una señal de que se debe mover a `eudrperu`, no de que
  pertenece aquí.

## 4. Cómo conectar correctamente

El `DATABASE_URL` correcto es el de `apps/identidad-fiscal/api/.env` (o el que
`eudrperu` guarde en su propio `.env`, copiado de ahí), que apunta explícitamente
a la base `identidad_fiscal` dentro del proyecto Neon `appsperu`. Antes de correr
cualquier script de `eudrperu` contra esta base, confirmar con una consulta de
solo lectura (`SELECT current_database()`) que el nombre es `identidad_fiscal`,
no `neondb`.
