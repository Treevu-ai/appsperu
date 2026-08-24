# Contrato de datos — Infraestructura que funciona

## Propósito

`/api/infraestructura` extiende ALSOL desde la obra hacia el activo y el servicio, sin presentar ejecución física o presupuesto como prueba de funcionamiento. Su unidad es el activo materializado y su cadena se lee como: identidad → cierre/recepción → operador → mantenimiento → disponibilidad → indicador de servicio.

## Identificadores y vínculos permitidos

| Eslabón | Clave mínima | Regla |
|---|---|---|
| Inversión/obra | CUI o código INFOBRAS exacto | Nunca por título parecido. |
| Obra/activo | CUI, código INFOBRAS, código sectorial o fuente que declare la ausencia de clave durable | La ausencia se publica; no se deduce. |
| Activo/cierre | Acta, resolución o transferencia con activo/clave y fecha | Inauguración no equivale a recepción. |
| Activo/operador | Acto o registro que nombre activo, entidad y rol | Ejecutora/financiadora no se usa como operador por defecto. |
| Activo/mantenimiento | Actividad, contrato o fuente que identifique el activo | Gasto agregado queda sin atribuir. |
| Activo/servicio | Registro sectorial con activo o código durable | Indicador agregado no se reparte entre activos/distritos. |

## Estados de evidencia

- `SIN_EVIDENCIA_DE_CIERRE`: ALSOL no materializó un acto de recepción/cierre; no prueba que no exista.
- `SIN_EVIDENCIA_DE_OPERADOR`: no hay fuente que asigne el rol de operación.
- `SIN_EVIDENCIA_DE_MANTENIMIENTO`: no se materializó evidencia atribuida al activo.
- `SIN_EVIDENCIA_DE_OPERACION`: no hay registro sectorial/operador que documente disponibilidad.
- `OPERATIVO_DOCUMENTADO`, `OPERACION_RESTRINGIDA_DOCUMENTADA`, `FUERA_DE_SERVICIO_DOCUMENTADO`: solo nacen de una observación fechada y fuente trazable.
- `AGREGADO_NO_ATRIBUIR`: presupuesto o indicador existe, pero no identifica el activo; nunca se redistribuye.
- `BLOQUEADO_POR_EVIDENCIA`: la consulta estricta impide presentar la cadena como completa.

## Cohorte inicial

La primera corrida materializa dos activos de La Libertad:

1. Drenaje pluvial urbano de Trujillo (CUI `2539202`).
2. Institución educativa de Casa Grande, cuya fuente actual no publica CUI ni código durable.

Ambos tienen identidad/fuente, pero **cero** actas de cierre, operadores, mantenimientos, disponibilidades o indicadores de servicio materializados. Esto es un piloto de estructura, no una certificación del universo de infraestructura regional ni una afirmación de que esos activos no funcionan.

Agua y saneamiento quedan fuera de la cohorte hasta que el piloto encuentre una fuente con activo/acto/operador reproducibles.

## Consultas terminales

```powershell
npm run infraestructura:activos -- --sector DRENAJE
npm run infraestructura:ficha -- --activo ACTIVO-DRENAJE-2539202
npm run infraestructura:operacion -- --activo ACTIVO-DRENAJE-2539202
npm run infraestructura:mantenimiento -- --activo ACTIVO-DRENAJE-2539202 --anio 2026
npm run infraestructura:integridad -- --estricto
npm run infraestructura:evidencia
```

La cola se revisa de modo append-only:

```powershell
npm run infraestructura:revision -- --accion list --estado PENDING
```

Ningún comando ingiere fuentes ni altera estados de infraestructura; la revisión solo documenta una decisión humana sobre evidencia pendiente.
