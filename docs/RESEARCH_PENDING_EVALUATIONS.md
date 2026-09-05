# Investigación: Sectores y Entidades Pendientes de Evaluación para Rastro

Este documento detalla los sectores, programas, niveles de gobierno y entidades públicas que aún no han sido integrados o evaluados exhaustivamente dentro de la plataforma Rastro, basándose en el catálogo actual de 14 fuentes y la Plataforma Nacional de Datos Abiertos del Perú.

## 1. Análisis de Factibilidad Técnica (Datos Estructurados)

Una de las preguntas clave es si estos datos existen en formatos estructurados (JSON, CSV) o si cuentan con APIs.

### A. La "Super-API": Plataforma Nacional de Datos Abiertos (PNDA)
La gran mayoría de los ministerios y programas (MINEDU, MINSA, MIDIS, etc.) publican sus datos en la PNDA (datosabiertos.gob.pe).
- **Tecnología:** La PNDA utiliza **CKAN**, que es un estándar global para portales de datos abiertos.
- **Acceso Estructurado:** CKAN expone una **API REST pública** (/api/3/action/...) que permite:
    - Listar datasets y recursos en formato **JSON**.
    - Descargar archivos en **CSV** o **JSON**.
    - Consultar metadatos de frescura y cobertura.
- **Conclusión:** Para los sectores de Educación, Salud y Desarrollo Social, la ingesta es **altamente factible** mediante un conector genérico para CKAN.

### B. Fuentes de "Integridad" (Sistemas Cerrados)
Para entidades como el Poder Judicial, Ministerio Público y SUNARP, el panorama es distinto:
- **Sin APIs Públicas:** No existen APIs REST abiertas para consulta masiva de expedientes o predios.
- **Portales de Consulta:** Utilizan portales web con formularios (ej. el CEJ del Poder Judicial o la Consulta de Propiedad de SUNARP).
- **Estrategia de Ingesta:** La integración requeriría la creación de **Connectors/Scrapers** (similar a como se implementó infobras), transformando la respuesta HTML en JSON estructurado.
- **Riesgo:** Mayor fragilidad ante cambios en la interfaz web y riesgo de bloqueos por rate-limit.

### C. Gobiernos Locales y Regionales
- **Híbrido:** Algunas municipalidades publican en PNDA (fácil), otras tienen portales propios basados en CMS (difícil).

---

## 2. Sectores Prioritarios (Ministerios)
Sectores que tienen un alto impacto en la inversión pública y el bienestar ciudadano, pero que no cuentan con una app de datos crudos en Rastro:

- **Educación (MINEDU):**
  - *Gaps:* Infraestructura educativa, ejecución de presupuestos específicos por colegio.
  - *Fuente:* PNDA (Muy viable vía CKAN API).
- **Salud (MINSA):**
  - *Gaps:* Equipamiento hospitalario, cobertura real de servicios.
  - *Fuente:* PNDA (Muy viable vía CKAN API).
- **Desarrollo e Inclusión Social (MIDIS):**
  - *Gaps:* Focalización de pobreza, impacto de transferencias.
  - *Fuente:* PNDA (Muy viable vía CKAN API).
- **Transportes y Comunicaciones (MTC):**
  - *Gaps:* Estado de carreteras, concesiones viales.
  - *Fuente:* PNDA y portales de Provías.

## 3. Programas Públicos Específicos
Programas con presupuestos propios y ejecución territorial:

- **Programas Sociales:** Juntos, Pensión 65, Cuna Más, Qali Warma. (Viables vía PNDA).
- **Infraestructura:** PRONIED (Colegios), PRONIS (Hospitales). (Viables vía PNDA).
- **Empleo:** Llamkasun Perú. (Viable vía PNDA).

## 4. Niveles de Gobierno y Entidades No Evaluadas
- **Gobierno Local (Municipalidades):** Integración de portales de datos abiertos locales.
- **Sector Justicia y Legal:**
  - **Poder Judicial / Ministerio Público:** Casos contra proveedores. (Requiere Scraper).
  - **Tribunal Constitucional:** Resoluciones. (Requiere Scraper).
- **Organismos Reguladores:**
  - **SUNEDU:** Calidad de universidades. (Viable vía PNDA).
  - **SUNARP:** Titularidad de terrenos. (Requiere Scraper).

## Matriz de Priorización y Esfuerzo Técnico

| Prioridad | Entidad/Sector | Valor | Formato | Dificultad Técnica |
|---|---|---|---|---|
| **Alta** | MINEDU / PRONIED | Alta | JSON/CSV (PNDA) | Baja (CKAN API) |
| **Alta** | MINSA / SUSALUD | Alta | JSON/CSV (PNDA) | Baja (CKAN API) |
| **Media** | MIDIS / Programas | Media | JSON/CSV (PNDA) | Baja (CKAN API) |
| **Media** | Poder Judicial | Alta | HTML $\rightarrow$ JSON | Alta (Scraper) |
| **Baja** | SUNARP | Media | HTML $\rightarrow$ JSON | Alta (Scraper) |

---
*Actualizado el 2026-09-04 con análisis de APIs.*
