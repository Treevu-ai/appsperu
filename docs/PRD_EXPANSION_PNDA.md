# PRD: Expansión de Rastro - Módulo de Servicios Públicos (PNDA)

**Estado:** Borrador / Para Revisión
**Fecha:** 2026-09-04
**Responsable:** Equipo Rastro / Treevu

---

## 1. Resumen Ejecutivo

Rastro actualmente cruza datos de presupuesto, contrataciones y obras. Sin embargo, existe un "punto ciego": no sabemos si la inversión en una obra (ej. un colegio o un puesto de salud) se traduce en una mejora real del servicio.

Este proyecto expande Rastro integrando datos de la **Plataforma Nacional de Datos Abiertos (PNDA)**, específicamente de los sectores de **Educación (MINEDU)**, **Salud (MINSA)** y **Desarrollo Social (MIDIS)**. El objetivo es cerrar el círculo de fiscalización: **Presupuesto $\rightarrow$ Obra $\rightarrow$ Servicio entregado**.

## 2. Objetivos

### 2.1 Objetivo Principal
Integrar datos estructurados de servicios públicos para permitir el cruce entre la inversión ejecutada (CUI/Invierte.pe) y la situación real de la infraestructura y cobertura de servicios en el territorio.

### 2.2 Objetivos Específicos
- **Educación:** Mapear la infraestructura escolar y su estado frente a las inversiones en infraestructura educativa.
- **Salud:** Vincular las IPRESS (Instituciones Prestadoras de Servicios de Salud) con las obras de salud ejecutadas.
- **Social:** Cruzar la ubicación de beneficiarios de programas sociales con la inversión en servicios básicos de la zona.
- **Técnico:** Implementar un conector genérico para la API de CKAN (PNDA) para reducir el tiempo de integración de nuevas fuentes.

## 3. Audiencias y Casos de Uso

| Audiencia | Caso de Uso | Pregunta que Rastro responderá |
|---|---|---|
| **Ciudadano / Periodista** | Fiscalización de servicios | "El gobierno dice que invirtió en salud en mi distrito, pero ¿está el puesto de salud operativo y equipado según el MINSA?" |
| **Gestor Público** | Planificación basada en evidencia | "¿En qué distritos hay mayor brecha entre la inversión ejecutada en colegios y la calidad de la infraestructura reportada?" |
| **Agente de IA (MCP)** | Análisis de brechas | "Compara la inversión en salud de La Libertad contra el número de IPRESS operativas por habitante." |

## 4. Requerimientos Funcionales

### 4.1 Ingesta de Datos (Backend)
- **Módulo PNDA Connector:** Capacidad de consultar, descargar y cachear datasets de CKAN en formato JSON/CSV.
- **App adar-educacion:** Ingesta de el padrón de locales escolares y estado de infraestructura.
- **App adar-salud:** Ingesta del registro de IPRESS y equipamiento básico.
- **App adar-social:** Ingesta de cobertura de programas sociales (Juntos, Pensión 65, etc.).

### 4.2 Cruces de Datos (Crossref)
- **Cruce Geográfico:** Vinculación de locales escolares/IPRESS $\rightarrow$ UBIGEO $\rightarrow$ Distrito.
- **Cruce de Inversión:** Vinculación de CUI (Invierte.pe) $\rightarrow$ Ubicación $\rightarrow$ Local Específico (donde aplique).
- **Cálculo de Brecha:** Generar un score de "Efectividad de Inversión" (Inversión realizada vs. Estado del servicio).

### 4.3 Capa de Lectura (Frontend & MCP)
- **Fichas de Sector:** Nuevas vistas en astro.fyi para Salud y Educación.
- **Visualización de Brechas:** Indicador visual que muestre si una zona con alta inversión tiene servicios deficientes.
- **Tools MCP:** Nuevos endpoints para que la IA pueda consultar el estado de servicios públicos.

## 5. Requerimientos Técnicos

### 5.1 Arquitectura de Ingesta
- **API Endpoint:** https://datosabiertos.gob.pe/api/3/action/
- **Flujo:** Connector $\rightarrow$ Package Search $\rightarrow$ Resource Download $\rightarrow$ Postgres Storage.
- **Frecuencia:** Mensual (los datos de infraestructura no cambian diariamente).

### 5.2 Modelo de Datos (Sugerido)
- **Locales/IPRESS:** ID_Entidad, Nombre, UBIGEO, Estado_Operativo, Capacidad, Ultima_Actualizacion.
- **Cruces:** Tabla de relación UBIGEO $\leftrightarrow$ CUI.

## 6. Matriz de Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Datos desactualizados en PNDA** | Medio | Mostrar claramente la fecha de corte del dataset en la UI. |
| **Inconsistencia en UBIGEO** | Alto | Implementar un normalizador de nombres de distritos y códigos UBIGEO. |
| **Cambio en API de CKAN** | Bajo | Centralizar toda la lógica de acceso en el PndaConnector en packages/. |

## 7. Roadmap de Implementación

- **Fase 1 (Semanas 1-2):** Desarrollo del PndaConnector y setup de las 3 nuevas apps backend.
- **Fase 2 (Semanas 3-4):** Ingesta de datos y desarrollo de los matchers de cruce (UBIGEO $\rightarrow$ CUI).
- **Fase 3 (Semanas 5-6):** Implementación de vistas en astro.fyi y herramientas en el servidor MCP.