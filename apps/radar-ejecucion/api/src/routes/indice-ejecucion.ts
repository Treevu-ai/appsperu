import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { LATEST_BUDGET_CTE } from "../db/budget-coverage.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const indiceEjecucionRouter = Router();

/**
 * Índice de calidad de ejecución presupuestal.
 *
 * Devuelve para cada entidad en el alcance:
 *   - tasa_ejecucion = devengado / pim  (%, null si pim = 0)
 *   - ranking        = posición dentro de su cohorte (mismo nivel de gobierno)
 *   - total_cohorte  = cuántas entidades tiene la cohorte
 *   - mediana_cohorte = mediana de tasas de la cohorte (excluye pim = 0)
 *
 * La cohorte es el grupo de entidades del mismo nivel_gobierno que la entidad
 * evaluada, filtradas al mismo departamento y año. Si la cohorte tiene menos
 * de 5 entidades, el ranking se devuelve como null (cohorte insuficiente para
 * comparabilidad — no se infla con datos no significativos).
 *
 * Metodología: percentil de la tasa de ejecución dentro de la distribución
 * de tasas de la cohorte. Null cuando pim = 0 (no es ejecución 0%, es
 * "sin dato de presupuesto").
 *
 * Limitaciones documentadas:
 *   - Cobertura del presupuesto ingERIDO: parcial por diseño, acotada a
 *     La Libertad vía offsets de byte. No extrapolar a otros departamentos.
 *   - Cobertura territorial del año vigente: verificar `GET /api/meta/frescura`
 *     antes de presentar como dato del año corrente.
 *   - La cohorte se filtra por departamento para comparabilidad regional;
 *     el promedio o mediana SIN filtro territorial distorsiona la comparación
 *     entre municipalidades chicas y grandes.
 */

const IndiceEjecucionQuerySchema = z.object({
  /** Año fiscal. Default: el más reciente ingestado. */
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  /** Nivel de gobierno a filtrar (ej. GOBIERNO_LOCAL, GOBIERNO_REGIONAL). */
  nivel: z.string().min(1).optional(),
  /** Función de gasto a filtrar (ej. 06 EDUCACION Y CULTURA). */
  funcion: z.string().min(1).optional(),
  /** Departamento de sede de la entidad ejecutora. */
  departamento: z.string().min(1).optional(),
  /** Filtrar solo entidades con ranking (excluye cohortes < 5). */
  soloConRanking: z.enum(["true", "false"]).optional().default("false"),
  /** Orden de salida. */
  orden: z.enum(["tasa_asc", "tasa_desc", "nombre_asc"]).optional().default("tasa_desc"),
});

/**
 * Cuenta cuántos elementos de `sorted` (orden ascendente) son <= `valor`,
 * vía búsqueda binaria (upper bound). Evita el escaneo O(n) por entidad que
 * tenía la versión anterior (cada entidad reescaneaba el arreglo completo de
 * `entidades`, dando O(n²) sobre el total de filas, no solo sobre la cohorte).
 */
function contarMenorOIgual(sorted: number[], valor: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= valor) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

indiceEjecucionRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(IndiceEjecucionQuerySchema, req.query, res);
    if (!parsed) return;

    const { anio, nivel, funcion, departamento, soloConRanking, orden } = parsed;
    let anioFinal = anio ? Number(anio) : undefined;

    // Sin año explícito: LATEST_BUDGET_CTE dedup por anio_fiscal (entre otras
    // columnas), así que sin filtro de año esta query suma devengado/pim de
    // TODOS los años fiscales ingeridos para una entidad en una sola tasa —
    // mezclando ejercicios distintos en un solo "tasa_ejecucion". Se usa el
    // año fiscal más reciente con datos en el alcance solicitado como default.
    if (anioFinal === undefined) {
      const condicionesAnio: string[] = [];
      const paramsAnio: unknown[] = [];
      if (departamento) {
        paramsAnio.push(departamento.toUpperCase());
        condicionesAnio.push(`t.departamento = $${paramsAnio.length}`);
      }
      const whereAnio = condicionesAnio.length > 0 ? `WHERE ${condicionesAnio.join(" AND ")}` : "";
      const { rows: anioRows } = await pool.query<{ max_anio: number | string | null }>(
        `SELECT MAX(b.anio_fiscal) AS max_anio
         FROM budget_execution b
         JOIN entities e ON e.entity_code = b.entity_code
         JOIN territories t ON t.ubigeo = e.ubigeo
         ${whereAnio}`,
        paramsAnio
      );
      anioFinal = anioRows[0]?.max_anio !== null && anioRows[0]?.max_anio !== undefined
        ? Number(anioRows[0].max_anio)
        : undefined;
    }

    // Paso 1 — params propios para evitar desalineación de índices
    const condiciones1: string[] = [];
    const params1: unknown[] = [];
    if (nivel) { params1.push(nivel); condiciones1.push(`e.nivel_gobierno = $${params1.length}`); }
    if (funcion) { params1.push(funcion); condiciones1.push(`b.funcion = $${params1.length}`); }
    if (departamento) { params1.push(departamento.toUpperCase()); condiciones1.push(`t.departamento = $${params1.length}`); }
    if (anioFinal !== undefined) { params1.push(anioFinal); condiciones1.push(`b.anio_fiscal = $${params1.length}`); }
    const where1 = condiciones1.length > 0 ? `WHERE ${condiciones1.join(" AND ")}` : "";

    // Paso 2 — params propios. Incluye `funcion` igual que paso1: si el caller
    // filtra por función, la tasa de cada entidad (paso1) queda acotada a esa
    // función, así que la mediana de cohorte contra la que se compara tiene
    // que estar acotada igual — si no, se compara una tasa función-específica
    // contra una mediana de presupuesto total, que no es comparable.
    const condiciones2: string[] = [];
    const params2: unknown[] = [];
    if (departamento) { params2.push(departamento.toUpperCase()); condiciones2.push(`t.departamento = $${params2.length}`); }
    if (funcion) { params2.push(funcion); condiciones2.push(`b.funcion = $${params2.length}`); }
    if (anioFinal !== undefined) { params2.push(anioFinal); condiciones2.push(`b.anio_fiscal = $${params2.length}`); }
    const where2 = condiciones2.length > 0 ? `WHERE ${condiciones2.join(" AND ")}` : "";

    // Paso 1: tasas por entidad
    // `LATEST_BUDGET_CTE` (dedup por entity_code+funcion+anio_fiscal+meta_departamento+generica,
    // quedándose con el fecha_corte más reciente) es obligatorio contra `budget_execution` —
    // confirmado en vivo: hay entidades con 12 filas para el mismo entity_code+función+año
    // repartidas en 2 fecha_corte distintos. Sumar `budget_execution` directo (como hacía
    // antes esta query) duplica devengado/pim e infla tasa_ejecucion para cada entidad.
    const paso1 = `
      ${LATEST_BUDGET_CTE},
      entidad_tasa AS (
        SELECT
          e.entity_code, e.nombre, e.nivel_gobierno,
          t.departamento, t.provincia, t.distrito,
          SUM(b.devengado) AS total_devengado,
          SUM(b.pim)       AS total_pim,
          CASE WHEN SUM(b.pim) > 0
               THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
               ELSE NULL END AS tasa_ejecucion
        FROM entities e
        JOIN territories t ON t.ubigeo = e.ubigeo
        JOIN latest_budget b ON b.entity_code = e.entity_code
        ${where1}
        GROUP BY e.entity_code, e.nombre, e.nivel_gobierno, t.departamento, t.provincia, t.distrito
      )
      SELECT entity_code, nombre, nivel_gobierno, departamento, provincia, distrito,
             total_devengado, total_pim, tasa_ejecucion
      FROM entidad_tasa
      WHERE tasa_ejecucion IS NOT NULL`;

    // Paso 2: medianas y conteos por cohorte (mismo dedup que paso1, ver nota arriba)
    const paso2 = `
      ${LATEST_BUDGET_CTE},
      entidad_tasa AS (
        SELECT
          e.entity_code, e.nivel_gobierno, t.departamento,
          SUM(b.devengado) AS total_devengado,
          SUM(b.pim)       AS total_pim,
          CASE WHEN SUM(b.pim) > 0
               THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
               ELSE NULL END AS tasa_ejecucion
        FROM entities e
        JOIN territories t ON t.ubigeo = e.ubigeo
        JOIN latest_budget b ON b.entity_code = e.entity_code
        ${where2}
        GROUP BY e.entity_code, e.nivel_gobierno, t.departamento
      ),
      cohortes AS (
        SELECT
          nivel_gobierno, departamento,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tasa_ejecucion) AS mediana_cohorte,
          COUNT(*) AS n_entidades
        FROM entidad_tasa
        WHERE tasa_ejecucion IS NOT NULL
        GROUP BY nivel_gobierno, departamento
      )
      SELECT nivel_gobierno, departamento, mediana_cohorte, n_entidades
      FROM cohortes`;

    const [{ rows: entidades }, { rows: cohortes }] = await Promise.all([
      pool.query(paso1, params1),
      pool.query(paso2, params2),
    ]);

    // Armar mapa de cohortes para lookup rápido
    const cohorteMap = new Map<string, { mediana: number; n: number }>();
    for (const c of cohortes) {
      cohorteMap.set(`${c.nivel_gobierno}::${c.departamento}`, {
        mediana: Number(c.mediana_cohorte),
        n: Number(c.n_entidades),
      });
    }

    // Tasas numéricas por cohorte, pre-ordenadas una sola vez (O(n log n) total,
    // no O(n²) — ver nota en contarMenorOIgual).
    const tasasPorCohorte = new Map<string, number[]>();
    for (const e of entidades) {
      if (e.tasa_ejecucion === null) continue;
      const key = `${e.nivel_gobierno}::${e.departamento}`;
      if (!tasasPorCohorte.has(key)) tasasPorCohorte.set(key, []);
      tasasPorCohorte.get(key)!.push(Number(e.tasa_ejecucion));
    }
    for (const tasas of tasasPorCohorte.values()) tasas.sort((a, b) => a - b);

    // Paso 3: ranking dentro de la cohorte
    const resultados = entidades.map((e) => {
      const cohorteKey = `${e.nivel_gobierno}::${e.departamento}`;
      const cohorte = cohorteMap.get(cohorteKey);
      const tasaNum = Number(e.tasa_ejecucion);

      if (!cohorte || cohorte.n < 5) {
        return {
          entityCode: e.entity_code,
          nombre: e.nombre,
          nivelGobierno: e.nivel_gobierno,
          departamento: e.departamento,
          provincia: e.provincia,
          distrito: e.distrito,
          totalPim: Number(e.total_pim),
          totalDevengado: Number(e.total_devengado),
          tasaEjecucion: tasaNum,
          medianaCohorte: null,
          totalCohorte: null,
          ranking: null,
          percentil: null,
          cohorteInsuficiente: true,
        };
      }

      const tasasCohorte = tasasPorCohorte.get(cohorteKey) ?? [];
      const menorOIgual = contarMenorOIgual(tasasCohorte, tasaNum);
      const ranking = cohorte.n - menorOIgual + 1;
      const percentil = Math.round((menorOIgual / cohorte.n) * 100);

      return {
        entityCode: e.entity_code,
        nombre: e.nombre,
        nivelGobierno: e.nivel_gobierno,
        departamento: e.departamento,
        provincia: e.provincia,
        distrito: e.distrito,
        totalPim: Number(e.total_pim),
        totalDevengado: Number(e.total_devengado),
        tasaEjecucion: tasaNum,
        medianaCohorte: cohorte.mediana,
        totalCohorte: cohorte.n,
        ranking,
        percentil,
        cohorteInsuficiente: false,
      };
    });

    // `soloConRanking=true` excluye las cohortes insuficientes del resultado
    // (antes se extraía el filtro de la query pero nunca se aplicaba).
    const resultadosFiltrados =
      soloConRanking === "true" ? resultados.filter((r) => !r.cohorteInsuficiente) : resultados;

    // Ordenar
    if (orden === "tasa_desc") {
      resultadosFiltrados.sort((a, b) => (b.tasaEjecucion ?? -1) - (a.tasaEjecucion ?? -1));
    } else if (orden === "tasa_asc") {
      resultadosFiltrados.sort((a, b) => (a.tasaEjecucion ?? 999) - (b.tasaEjecucion ?? 999));
    } else {
      resultadosFiltrados.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    // Metadatos de respuesta
    const totalEntidades = resultadosFiltrados.length;
    const conRanking = resultadosFiltrados.filter((r) => r.cohorteInsuficiente === false).length;
    const sinRanking = resultadosFiltrados.filter((r) => r.cohorteInsuficiente === true).length;

    res.json({
      meta: {
        cobertura: "La Libertad (pIM, offsets de byte)",
        nota:
          "Cohortes con menos de 5 entidades no reciben ranking — la comparabilidad es estadísticamente inválida con muestras menores.",
        filtros: { nivel, funcion, departamento, anio: anioFinal, soloConRanking },
        stats: {
          totalEntidades,
          conRanking,
          sinRanking,
          rankingMin: conRanking > 0 ? Math.min(...resultadosFiltrados.filter((r) => r.ranking !== null).map((r) => r.ranking!)) : null,
          rankingMax: conRanking > 0 ? Math.max(...resultadosFiltrados.filter((r) => r.ranking !== null).map((r) => r.ranking!)) : null,
        },
        fuente: "MEF - Presupuesto y ejecución de gasto (Consulta Amigable)",
        // La fecha de corte real sale del batch mais reciente de budget_execution
      },
      resultados: resultadosFiltrados,
    });
  })
);

/**
 * Ranking por función de gasto (agregado departamental).
 * Responde: para cada función, cuál es la mediana de ejecución de la cohorte
 * y cómo se posiciona la entidad seleccionada.
 */
const EntidadFuncionQuerySchema = z.object({
  anio: z.string().regex(/^\d{4}$/, "debe ser un año de 4 dígitos").optional(),
  /** Si se pasa, filtra a una función específica. */
  funcion: z.string().min(1).optional(),
});

indiceEjecucionRouter.get(
  "/por-funcion/:entityCode",
  asyncHandler(async (req, res) => {
    // `entityCode` viaja en `req.params` (ruta `/por-funcion/:entityCode`), no
    // en `req.query` — validarlo dentro del query schema nunca lo alcanza, así
    // que toda llamada normal (`/por-funcion/301234`) caía siempre en el 400
    // de "obligatorio". Se valida por separado contra `req.params`.
    const entityCode = req.params.entityCode;
    if (!entityCode) {
      res.status(400).json({ error: "entityCode es obligatorio." });
      return;
    }

    const parsed = parseQuery(EntidadFuncionQuerySchema, req.query, res);
    if (!parsed) return;

    const { anio, funcion } = parsed;

    // La cohorte de comparación tiene que acotarse al mismo nivel de gobierno
    // y departamento de la entidad consultada — si no, una municipalidad
    // distrital chica se compara contra la mediana de TODO el país/nivel,
    // mezclando gobiernos regionales con municipalidades.
    const { rows: entidadInfo } = await pool.query<{ nivel_gobierno: string; departamento: string }>(
      `SELECT e.nivel_gobierno, t.departamento
       FROM entities e
       JOIN territories t ON t.ubigeo = e.ubigeo
       WHERE e.entity_code = $1`,
      [entityCode]
    );
    if (entidadInfo.length === 0) {
      res.status(404).json({ error: "Entidad no encontrada." });
      return;
    }
    const { nivel_gobierno: nivelGobierno, departamento } = entidadInfo[0];

    let anioFinal = anio ? Number(anio) : undefined;
    if (anioFinal === undefined) {
      const { rows: anioRows } = await pool.query<{ max_anio: number | string | null }>(
        `SELECT MAX(anio_fiscal) AS max_anio FROM budget_execution WHERE entity_code = $1`,
        [entityCode]
      );
      anioFinal = anioRows[0]?.max_anio !== null && anioRows[0]?.max_anio !== undefined
        ? Number(anioRows[0].max_anio)
        : undefined;
    }

    const condiciones: string[] = [];
    const params: unknown[] = [];

    if (anioFinal !== undefined) {
      params.push(anioFinal);
      condiciones.push(`b.anio_fiscal = $${params.length}`);
    }
    if (funcion) {
      params.push(funcion);
      condiciones.push(`b.funcion = $${params.length}`);
    }

    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

    // Tasas por función para la entidad — `b.entity_code` se arma como su
    // propio WHERE/AND en vez de concatenarse ciegamente después de `where`:
    // si `where` viene vacío (sin anio/funcion, el caso común — solo
    // entityCode es obligatorio) pegarle "AND ..." queda sin WHERE antes,
    // error de sintaxis SQL garantizado.
    const entidadParams = [...params, entityCode];
    const entidadWhere =
      condiciones.length > 0
        ? `${where} AND b.entity_code = $${entidadParams.length}`
        : `WHERE b.entity_code = $${entidadParams.length}`;
    const { rows: entidadRows } = await pool.query(
      `${LATEST_BUDGET_CTE}
       SELECT b.funcion,
              SUM(b.devengado) AS total_devengado,
              SUM(b.pim)       AS total_pim,
              CASE WHEN SUM(b.pim) > 0
                   THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
                   ELSE NULL
              END AS tasa_ejecucion
       FROM latest_budget b
       ${entidadWhere}
       GROUP BY b.funcion
       ORDER BY b.funcion`,
      entidadParams
    );

    if (entidadRows.length === 0) {
      res.status(404).json({ error: "Entidad sin datos para el año y filtros dados." });
      return;
    }

    // Medianas por función — cohorte = entidades del MISMO nivel de gobierno
    // y departamento que la entidad consultada (ver nota arriba).
    const condicionesMediana: string[] = [`e.nivel_gobierno = $1`, `t.departamento = $2`];
    const paramsMediana: unknown[] = [nivelGobierno, departamento];
    if (anioFinal !== undefined) {
      paramsMediana.push(anioFinal);
      condicionesMediana.push(`b.anio_fiscal = $${paramsMediana.length}`);
    }
    if (funcion) {
      paramsMediana.push(funcion);
      condicionesMediana.push(`b.funcion = $${paramsMediana.length}`);
    }
    const whereMediana = `WHERE ${condicionesMediana.join(" AND ")}`;

    // Postgres rechaza `SUM(...)` anidado dentro del `ORDER BY` de otra función
    // agregada ("aggregate function calls cannot be nested", confirmado en
    // vivo) — la versión anterior de esta query reventaba con 500 en TODA
    // llamada que llegara hasta aquí, no solo en un caso borde. La tasa por
    // entidad+función se pre-agrega en su propia CTE antes de calcular el
    // percentil sobre esas filas ya resueltas.
    const { rows: medianRows } = await pool.query(
      `${LATEST_BUDGET_CTE},
       entidad_funcion_tasa AS (
         SELECT b.entity_code, b.funcion,
                SUM(b.devengado) AS total_devengado,
                SUM(b.pim)       AS total_pim,
                CASE WHEN SUM(b.pim) > 0
                     THEN ROUND(SUM(b.devengado) / SUM(b.pim) * 100, 1)
                     ELSE NULL END AS tasa_ejecucion
         FROM latest_budget b
         JOIN entities e ON e.entity_code = b.entity_code
         JOIN territories t ON t.ubigeo = e.ubigeo
         ${whereMediana}
         GROUP BY b.entity_code, b.funcion
       )
       SELECT funcion,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tasa_ejecucion) AS mediana_funcion,
              COUNT(DISTINCT entity_code) AS n_entidades
       FROM entidad_funcion_tasa
       WHERE tasa_ejecucion IS NOT NULL
       GROUP BY funcion`,
      paramsMediana
    );

    const medianaMap = new Map<string, { mediana: number; n: number }>();
    for (const r of medianRows) {
      medianaMap.set(r.funcion, {
        mediana: Number(r.mediana_funcion),
        n: Number(r.n_entidades),
      });
    }

    const resultados = entidadRows.map((r) => {
      const med = medianaMap.get(r.funcion);
      const tasa = Number(r.tasa_ejecucion);
      const mediana = med?.mediana ?? null;
      const desviacion = mediana !== null ? Math.round((tasa - mediana) * 10) / 10 : null;

      return {
        funcion: r.funcion,
        totalPim: Number(r.total_pim),
        totalDevengado: Number(r.total_devengado),
        tasaEjecucion: tasa,
        medianaFuncion: mediana,
        nCohorte: med?.n ?? null,
        desviacionDeMediana: desviacion,
        // Desviación > 0 = por encima de la mediana de la función
        // Desviación < 0 = por debajo
      };
    });

    res.json({
      entityCode,
      anioFiscal: anioFinal,
      meta: {
        cobertura: "La Libertad (pIM)",
        nota: "Cohorte = todas las entidades del mismo nivel de gobierno y departamento que la entidad consultada, con la misma función. Desviación = tasa propia − mediana de la cohorte.",
        fuente: "MEF - Consulta Amigable",
      },
      resultados,
    });
  })
);
