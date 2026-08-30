# Contrato de datos — Seguimiento sectorial de La Libertad

## Propósito

Describe la ficha terminal que compara entidades del Gobierno Nacional y del Gobierno Regional La Libertad sin confundir destino de gasto, sede ejecutora, CUI, obra o contratación.

## Fuentes y llaves permitidas

| Dominio | Fuente | Llave | Regla |
|---|---|---|---|
| Presupuesto nacional | MEF gasto mensual | `entity_code` + `META_DEPARTAMENTO` | Incluye solo `LA LIBERTAD`; la sede nacional no prueba beneficio distrital. |
| Presupuesto regional | MEF gasto mensual | `entity_code` + sede/territorio de entidad | Incluye unidades regionales ubicadas en La Libertad. |
| Sector | `sector_entity_registry` | código MEF y literal publicados | Requiere estado `VERIFICADO`. |
| Inversión | evidencia CUI / Invierte.pe | CUI exacto | No se asigna CUI a una actividad por nombre. |
| Obra | INFOBRAS | CUI exacto | Solo se consulta si `INFOBRAS_DATABASE_URL` está configurada. |
| Compra | OECE/SEACE | vínculo MEF–entidad compradora verificado | Sin vínculo exacto se devuelve `SIN_VINCULO_MEF_COMPRAS_VERIFICADO`. |

## Cobertura y temporalidad

Todo resultado presupuestal incluye `reglaTerritorial`, `cortesUsados`, `recursos` y el estado de `budget_coverage_snapshots`. `NO_VERIFICADA` significa que Rastro conoce el alcance materializado, pero no certifica el universo externo total.

## Estados importantes

- `VERIFICADO`: vínculo con código y evidencia registrada.
- `CANDIDATO`: solo apto para revisión humana; no se agrega.
- `SIN_VINCULO_OFICIAL`: existe evidencia de proyecto, pero no un puente oficial hacia la entidad/actividad solicitada.
- `INFOBRAS_NO_CONFIGURADO` / `COMPRAS_NO_CONFIGURADO`: fuente opcional no conectada en esa ejecución.
- `DISTRITO_NO_PUBLICADO`: no se sustituye con sede ni domicilio.

## Comandos

```powershell
npm run sectors:seed
npm run sectors:inventory -- --anio 2026 --limite 50
npm run ficha:sector -- --sector TRANSPORTE --anio 2026
npm run ficha:entidad -- --entity-code 831 --anio 2026
npm run comparativo:sectores -- --sectores SALUD,TRANSPORTE,VIVIENDA --anio 2026
npm run movimiento:presupuesto -- --anio 2026
npm run links:sector -- --accion list --estado PENDING
```

`movimiento:presupuesto` redacta una lectura determinística de PIA→PIM→devengado por universo nacional dirigido y regional ejecutado. No describe pagos, avance físico, impacto ni calidad; tampoco suma ambos universos.
