# Protocolo de alta de un ministerio, organismo o unidad regional en ALSOL

No se incorpora una entidad por reconocimiento de nombre. El alta termina solo cuando se cumplen los pasos siguientes.

1. Identificar el `SEC_EJEC` y literal de `entities` en la ingesta MEF, con año, partición y corte reproducibles.
2. Definir una regla territorial: `META_DEPARTAMENTO` para Gobierno Nacional o `SEDE_EJECUTORA` para Gobierno Regional. Si no aplica, no ingresar al comparativo.
3. Registrar sector, tipo institucional, código, literal, fuente, campo y fecha de revisión en `sector_entity_registry`.
4. Verificar que el código y literal coincidan exactamente; un cambio de nombre genera revisión, no actualización silenciosa.
5. Ejecutar `integrity:budget` e `integrity:report`; confirmar corte y cobertura antes de difundir un monto.
6. Para CUI, obra o compra, exigir CUI/OCID/RUC/código institucional exacto o fuente oficial que describa la relación.
7. Si hay una hipótesis razonable pero falta clave, crear un candidato con `links:sector -- --accion add`; no publicarlo como vínculo.
8. Registrar la revisión humana, evidencia y decisión. Solo una fuente oficial permite crear el vínculo operativo correspondiente.

La revisión debe terminar con uno de estos estados: `VERIFICADO`, `CANDIDATO`, `RECHAZADO` o `SIN_VINCULO_OFICIAL`. Ninguno constituye una evaluación de legalidad o desempeño de la entidad.
