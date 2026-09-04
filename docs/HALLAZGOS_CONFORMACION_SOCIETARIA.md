# Hallazgos reales — conector de conformación societaria (OSCE)

> Fecha: 2026-09-04 (redactado 2026-09-04 antes de comitear — nombres de
> personas naturales reemplazados por identificadores genéricos, ver sección
> 2). Datos extraídos en vivo de
> `compras-publicas-postgres-1` (Docker local, puerto 5433), tablas
> `supplier_conformacion` y `supplier_conformacion_lookup`. Complementa
> `docs/APRENDIZAJES_INGENIERIA_INVERSA_OSCE.md` (la narrativa/lecciones) y
> `docs/COBERTURA_Y_CUMPLIMIENTO.md` (la evaluación de riesgo) con los
> resultados concretos que produjo correr el conector contra datos reales.

## 1. Alcance de lo ingerido hasta ahora

**Actualizado 2026-09-04, tras ampliar la muestra a nivel nacional — ingesta
completa confirmada**: **3,818/3,818 RUCs consultados (100%)**, **1,353 (35%)
con socios registrados**. La proporción se mantiene consistente con la
muestra piloto de La Libertad (33%), señal sana de que el 33-35% "con socios"
es representativo, no un artefacto de la muestra chica.

**Hallazgo clave de la ampliación nacional**: cruzar la muestra ampliada
contra `awards`/`minor_contracts` **no sumó ningún caso nuevo** más allá del
de Persona D (sección 2) — porque `awards` en sí mismo solo tiene
cobertura de La Libertad (confirmado: `SELECT DISTINCT departamento FROM
awards` devuelve únicamente 'LA LIBERTAD'). Ampliar conformación societaria a
nivel nacional sin ampliar también la cobertura geográfica de adjudicaciones
no genera más señales de cruce — son dos ejes de cobertura independientes;
el siguiente paso para encontrar más casos como Persona D no es más
RUCs de conformación, es más cobertura geográfica de `awards`.

Desglose de personas identificadas por rol (universo completo, 3,818 RUCs):

| Rol | Registros |
|---|---|
| SOCIO | 2,583 |
| ORGANO_ADMINISTRACION (directores/gerentes) | 1,684 |
| REPRESENTANTE (apoderados) | 1,600 |

Universo: proveedores del Estado peruano con al menos un contrato u orden
registrada en OECE/SEACE, cruzados contra este conector.

## 2. El hallazgo más potente: personas vinculadas a múltiples RUCs

El caso de uso central del conector — detectar cuándo la misma persona
natural aparece como socio, representante o director en **más de una empresa
proveedora del Estado** — ya produce señales reales con esta muestra parcial
(1,442 RUCs, lejos del universo completo de proveedores activos). 10 personas
distintas aparecen vinculadas a exactamente 2 RUCs cada una en esta primera
corrida:

| Persona | RUCs vinculados |
|---|---|
| Persona A | 2 |
| Persona B | 2 |
| Persona C | 2 |
| Persona D (caso detallado abajo) | 2 |
| Persona E | 2 |
| Persona F | 2 |
| Persona G | 2 |
| Persona H | 2 |
| Persona I | 2 |
| Persona J | 2 |

(Nombres y números de documento omitidos de este archivo por el mismo
criterio que se aplicó a la API pública — el hallazgo es la relación
persona↔múltiples empresas, no la identidad de la persona en sí. Los
nombres reales quedan disponibles en la base de datos local para quien
necesite investigar un caso específico, no en este documento versionado.)

**Lectura**: esto no prueba irregularidad por sí solo — es completamente
legal que una persona sea socia o directora de dos empresas. El valor está en
que Rastro puede ahora **cruzar esta relación contra las adjudicaciones de
`awards`/`minor_contracts`**: si dos RUCs con el mismo socio/representante
ganaron procesos de la misma entidad convocante, o compitieron entre sí en el
mismo proceso, eso sí es una señal de interés genuino para control ciudadano
(convergencia de intereses no declarada, simulación de competencia). Ese
cruce todavía no está implementado como endpoint — pero se validó manualmente
(2026-09-04) contra `awards`, y **ya produjo un caso real** con solo 1,442
RUCs de muestra:

> **Persona D** aparece como socia/representante en dos
> RUCs distintos (`20610375708` y `20481623392`). Ambas empresas ganaron
> procesos de **municipalidades diferentes** con 14 días de diferencia:
> Municipalidad Distrital de Salaverry (S/ 760,691.50, adjudicado
> 2024-03-13) y Municipalidad Distrital de Usquil (S/ 611,800.00, adjudicado
> 2024-03-27). Total combinado: S/ 1,372,491.50.
>
> **Esto no es evidencia de irregularidad** — es perfectamente legal que una
> persona controle o represente a dos empresas que ganen contratos en
> paralelo en entidades distintas. Es una hipótesis que amerita mirar con más
> contexto (¿son empresas del mismo rubro? ¿participaron ambas en el mismo
> tipo de proceso? ¿hay más casos así al ampliar la muestra?), no una
> afirmación. Se documenta aquí como validación de que el cruce funciona y
> produce señales reales, no como acusación contra la persona nombrada.

También se validó contra `minor_contracts` (contratos menores a 8 UIT): sin
coincidencias en esta muestra. Un caso adicional (dos personas distintas del
listado piloto) resultó ser dos personas ligadas al **mismo** RUC ganador,
no a RUCs distintos — confirma que la relación persona→empresa→adjudicación
se resuelve bien, pero no es el patrón de interés (una sola empresa con
varios directores no es señal de nada por sí sola).

## 3. Caso ilustrativo completo: RIMAC Seguros y Reaseguros (RUC 20100041953)

Usado como ejemplo en la sesión anterior para mostrar la capacidad del
conector. Ficha completa extraída:

**Órgano de administración (12 directores/gerentes)**: incluye a miembros de
la familia Brescia Moreyra (accionista histórico del grupo Breca) y de la
familia Fort Brescia — visible directamente en los apellidos de los
directores, sin necesidad de fuentes externas. Un director identificado por
Pasaporte y otro por Carnet de Extranjería (directores no peruanos, consistente
con un grupo empresarial con presencia internacional).

**Representantes (5 apoderados)**, con fechas de ingreso que van desde 2019
hasta 2025 — permite reconstruir cuándo cambió cada apoderado legal de la
empresa a lo largo del tiempo.

**Socios (2 registrados)**:
- `BRECA SEGUROS Y SALUD S.A.C.` (identificado por RUC, no por DNI — es una
  persona jurídica, no natural) — confirma que RIMAC es controlada por el
  holding Breca del mismo grupo económico.
- `HELFER REYNAFARJE JESSY MARCELA Y OTROS ACCIONISTAS MINORITARIOS` —
  registro agregado de accionistas minoritarios desde 1998, sin desagregar.

**Por qué es un buen caso de referencia**: RIMAC es una empresa grande,
conocida, sin ninguna controversia — sirve para demostrar la profundidad del
dato (llega a nivel de director individual con fecha de ingreso al cargo) sin
usar un ejemplo sensible. Para comunicación pública (LinkedIn, demos), este
tipo de caso es preferible a usar una empresa pequeña o con sanciones, que sí
tocaría el terreno de riesgo medio descrito en `COBERTURA_Y_CUMPLIMIENTO.md`.

## 4. Qué falta para que esto sea información accionable, no solo un dataset

1. **Cruce con adjudicaciones**: unir `supplier_conformacion` contra
   `awards.supplier_id` y `minor_contracts.winning_supplier_id` por RUC, para
   que la relación persona↔RUCs múltiples se traduzca en "¿estos RUCs
   compitieron o ganaron en el mismo proceso/entidad?".
2. **Ampliar la muestra**: 1,442 RUCs es una fracción del universo de
   proveedores activos en La Libertad — correr `run-conformacion.ts` contra
   el universo completo de `supplier_profiles`/`awards.supplier_id` filtrado
   por departamento, no solo la muestra piloto.
3. **Resolver el enmascarado antes de cualquier exposición pública** de este
   cruce — el hallazgo de vínculos múltiples es más potente mientras más
   grande la muestra, y con más muestra crece también la exposición de datos
   personales si no se aplican las mitigaciones ya decididas (DNI enmascarado,
   sin % accionario) de forma consistente en cualquier endpoint nuevo que
   exponga este cruce.
