# Backlog: Expansión de Rastro - Módulo PNDA

## Épica A: Infraestructura Core (Connector)
- [ ] TICKET-01: Desarrollar PndaConnector en packages/ para consumo de API CKAN (REST).
- [ ] TICKET-02: Implementar lógica de descarga, validación y cache de archivos CSV/JSON desde PNDA.
- [ ] TICKET-03: Crear tests unitarios para el conector utilizando mocks de la API de CKAN.

## Épica B: Ingesta y Datos (Backend)
- [ ] TICKET-04: Setup de adar-educacion: Definir esquema de BD e ingesta de locales escolares y presupuestos MINEDU.
- [ ] TICKET-05: Setup de adar-salud: Definir esquema de BD e ingesta de IPRESS y equipamiento MINSA.
- [ ] TICKET-06: Setup de adar-social: Definir esquema de BD e ingesta de cobertura de programas sociales MIDIS.
- [ ] TICKET-07: Configurar pipelines de ingesta mensual para las 3 nuevas apps.

## Épica C: Inteligencia y Cruces (Crossref)
- [ ] TICKET-08: Desarrollar matcher UBIGEO $\rightarrow$ Local Escolar $\rightarrow$ CUI (Invierte.pe).
- [ ] TICKET-09: Desarrollar matcher UBIGEO $\rightarrow$ IPRESS $\rightarrow$ CUI (Invierte.pe).
- [ ] TICKET-10: Implementar lógica de cálculo de "Score de Brecha de Servicio" (Inversión vs. Estado Real).
- [ ] TICKET-11: Validar calidad de los cruces mediante muestreo manual en La Libertad.

## Épica D: Capa de Lectura (Frontend & MCP)
- [ ] TICKET-12: Crear vistas de "Ficha de Sector" para Educación y Salud en astro.fyi.
- [ ] TICKET-13: Implementar componentes de visualización de brechas (indicadores visuales) en las fichas de distrito.
- [ ] TICKET-14: Exponer los nuevos endpoints de salud, educación y social en el servidor MCP.
- [ ] TICKET-15: Actualizar la documentación de la API en astro.fyi/docs/api.