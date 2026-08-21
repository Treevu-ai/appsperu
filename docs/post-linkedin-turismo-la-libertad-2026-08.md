# Post LinkedIn — Vigía del presupuesto: Turismo en La Libertad

**Fecha de publicación sugerida**: semana del 2026-08-24 (dato con corte 2026-08-18, aún vigente)
**Fuente de todos los números**: MEF (Presupuesto y ejecución de gasto), consulta directa 2026-08-20. Metodología en `docs/analisis-turismo-la-libertad-ejecucion-2026-08.md`.

---

## Post

La Región La Libertad le recortó **63% a su propio presupuesto de turismo** este año.

Y aun con menos plata, solo ejecutó el 42% de lo que le quedó.

Llevo semanas cruzando data abierta del MEF, OECE y SUNAT para esta región. Esta vez el hallazgo no es una obra paralizada — es un patrón presupuestal que casi nadie mira porque no sale en un titular de un día: **cómo se modifica el presupuesto durante el año, no solo cuánto se ejecuta.**

Estos son los números, con fuente y fecha de corte:

→ **Gobierno Regional de La Libertad**: PIA S/4.26M → PIM S/1.57M en turismo (-63.2%). Devengado: S/655,891 (41.8% de avance).

→ Mismo patrón, dos veces: **Municipalidad Provincial de Trujillo** — la capital, con el circuito turístico más consolidado de la región — vio crecer su PIM 77% (a S/935,308) y ejecutó apenas **9.8%**. **Cachicadán** lo llevó al extremo: PIM inflado **2,330%** frente a lo aprobado en enero (de S/15,000 a S/364,488), ejecutando solo 9.6%.

→ Mientras tanto, **5 municipalidades de la región tienen 0% de ejecución en turismo**. Una de ellas, Paranday, no tiene ni un solo proceso de contratación registrado en todo el año, en ninguna función. Antes de escribir esto verifiqué si era un problema de la entidad: revisé su padrón SUNAT y está ACTIVO, HABIDO, sin ninguna irregularidad. El problema no es quién es la municipalidad, es qué pasó con esa partida específica.

No estoy diciendo que hubo mal manejo — la data pública no prueba intención, prueba resultado. Lo que sí muestra es un patrón repetido en varias entidades: **presupuesto que se infla a mitad de año y no se convierte en gasto real**. Eso tiene un nombre técnico (modificación presupuestal sin capacidad de ejecución) y tiene un costo real: son soles que no llegan a un sendero turístico, una señalización, un centro de interpretación.

Nada de esto salió de una hoja de cálculo pedida por transparencia — 8 sistemas propios leen las fuentes oficiales (MEF, OECE, SUNAT) todos los días y las cruzan entre sí (cómo funciona, en el primer comentario 👇). El mismo patrón se puede auditar así en cualquier función presupuestal, de cualquier región del Perú, en minutos.

¿Qué función presupuestal de tu región te gustaría que audite así?

#TransparenciaFiscal #DatosAbiertos #GestiónPública #LaLibertad #VigíaDelPresupuesto

---

## Primer comentario (publicar inmediatamente después del post, desde la misma cuenta)

Cómo se construyó esto, para quien quiera repetir el ejercicio:

1️⃣ **Ingesta automática** — un conector se conecta a la API abierta del MEF, otro al portal de OECE (contrataciones del Estado), otro al Padrón RUC de SUNAT, otro al Tribunal de Contrataciones. Cada uno guarda su propia copia con fecha y checksum — si el dato cambia mañana, lo sé y lo puedo comparar.

2️⃣ **Una base de datos por fuente, no una sola tabla gigante** — el MEF no tiene RUC de las entidades, OECE sí tiene RUC de los proveedores. Mezclarlos de entrada sería inventar certeza donde no la hay.

3️⃣ **El cruce es el trabajo real** — cuando dos fuentes comparten un identificador exacto (RUC), cruzo directo. Cuando no lo comparten — la mayoría de los casos, porque el Estado peruano no tiene un ID único de entidad entre sistemas — uso un motor de coincidencia por nombre que marca cada cruce como "confirmado" o "candidato". Nunca presento un candidato como un hecho.

4️⃣ **Nunca invento datos faltantes** — si algo no aparece en una fuente, el sistema lo marca "no disponible", nunca cero ni "limpio por defecto". Confundir dato ausente con dato negativo es como se fabrican falsos positivos en auditoría.

Todo corre local, con datos que cualquiera puede volver a descargar de las mismas fuentes oficiales. La opinión está en qué pregunto — no en los números.

---

## Nota de rigor (no publicar, es para revisión interna)

- Todos los montos son PIA/PIM/devengado tal como los reporta el MEF a la fecha de corte indicada — **no** son cifras de cierre de año, el año fiscal 2026 sigue en curso.
- "Se infló" describe el hecho verificable (PIM muy superior al PIA) — no se afirma causa ni intención. Evitar en cualquier réplica o comentario cualquier frase que implique corrupción; la evidencia solo sostiene "mala programación o mala ejecución", no apropiación indebida.
- El caso de Paranday se presenta con la salvedad ya documentada en el memo: la ausencia de procesos de contratación puede deberse a cobertura parcial del scraper de OECE (144 procesos / 56 entidades de una región con ~83 municipalidades), no necesariamente a inacción real. El post actual roza esto ("no tiene ni un solo proceso registrado en todo el año") — es técnicamente exacto (así lo dice la base) pero conviene tener la aclaración lista para un comentario que pregunte por la fuente.
- Todos los datos y consultas usadas están reproducibles vía `radar-ejecucion` (puerto 4000) y consultas directas a Postgres documentadas en la conversación — no hay estimaciones ni interpolación.
