/**
 * Conector CLI — UN Comtrade (benchmark externo de comercio).
 *
 * Fuente (verificada en vivo el 2026-10-14, SIN API key, endpoint preview):
 *   https://comtradeapi.un.org/public/v1/preview/C/A/HS
 *     ?reporterCode=604&period=2024&partnerCode=0,842,156&cmdCode=TOTAL,04&flowCode=X
 * Acepta varios valores por parámetro separados por coma, así que un request
 * cubre un reporter × año × flujo × (todos los partners y capítulos pedidos).
 *
 * Dos límites del preview, verificados en vivo el 2026-10-15:
 *   - corta cualquier request en 500 filas, SIN aviso (el request por defecto
 *     de 15 partners × 46 cmds = 690 filas salía truncado a 500) — por eso los
 *     lotes se arman con `lotesPorFila` y `validarLote` falla si se pasa;
 *   - limita la tasa (HTTP 429) y corta por cuota de volumen de llamadas
 *     (HTTP 403 "Out of call volume quota" con Retry-After) — `fetchComtrade`
 *     reintenta con backoff y espera la ventana de cuota cuando la hay.
 *
 * Bloque `--mundo` (se corre salvo `--sin-mundo`): el preview NO publica al
 * Mundo como reporter (reporterCode=0 devuelve vacío), así que el agregado
 * mundial por capítulo se arma sumando las filas partner '0' (cada reporter)
 * de TODOS los reporters y guardándolo con reporter_code '0'. Es el
 * denominador que usa `modo=rca` del handler `benchmark-externo` — sin él la
 * RCA no tiene contra qué calcularse. Códigos de reporter inválidos el
 * preview los omite sin error, así que la lista REPORTERS_MUNDO es
 * autolimpiante (una cobertura incompleta solo subestima el total mundial).
 *
 * Qué trae y para qué: flujos de exportación/importación de Perú (y de países
 * comparadores opcionales) por partner y capítulo arancelario, en USD — el
 * benchmark externo que permite calcular ventaja comparativa revelada y cuota
 * de mercado contra competidores, que las fuentes nacionales (BCRP, SUNAT)
 * agregan y no permiten.
 *
 * Escribe en la base de la app `bcrp-comercio-exterior` (dominio: comercio
 * exterior). Sin app Express propia: conector + handler MCP + catálogo.
 *
 * Uso:
 *   npx tsx src/ingest/comtrade-benchmark.ts                       # defaults (+ bloque --mundo)
 *   npx tsx src/ingest/comtrade-benchmark.ts --reporters 604,218   # Perú y Ecuador
 *   npx tsx src/ingest/comtrade-benchmark.ts --sin-mundo           # omite el agregado mundial
 *   npx tsx src/ingest/comtrade-benchmark.ts --dry-run             # fetch, no escribe
 */
import { connect } from "./db.js";
import { pathToFileURL } from "node:url";

const API = "https://comtradeapi.un.org/public/v1/preview/C/A/HS";
const API_CON_CLAVE = "https://comtradeapi.un.org/data/v1/get/C/A/HS";
const ANIOS_DEFAULT = [2019, 2020, 2021, 2022, 2023, 2024];
const FLUJOS_DEFAULT = ["X", "M"];
const REPORTERS_DEFAULT = ["604"]; // 604 = Perú
const PARTNERS_DEFAULT = ["0", "842", "156", "76", "152", "484", "124", "724", "392", "410", "276", "380", "218", "170", "699"];
const CMD_DEFAULT = ["TOTAL", "01", "02", "04", "07", "08", "09", "10", "12", "15", "16", "20", "22", "24", "27", "28", "29", "30", "38", "39", "40", "44", "47", "48", "52", "54", "55", "57", "61", "62", "63", "64", "69", "70", "71", "72", "73", "74", "76", "84", "85", "86", "87", "90", "94", "95"];
const DELAY_MS = 400;
/**
 * Cadencia con API key: el endpoint autenticado (APIM) solo admite ~1 llamada
 * cada 15 s (verificado el 2026-10-15: a los 3 s y a los 9 s → 429 "Wait 15
 * seconds"). A 400 ms todas las llamadas caen en 429 y la corrida se queda sin
 * reintentos. Con key se espera ese slot entre requests.
 */
const DELAY_MS_CON_CLAVE = 16_000;

/**
 * API key de UN Comtrade (opcional; suscripción gratuita en
 * comtradedeveloper.un.org). Con key se llama al endpoint autenticado con
 * header `Ocp-Apim-Subscription-Key`; sin key, al preview público anónimo.
 */
const CLAVE = process.env.COMTRADE_API_KEY?.trim() ?? "";

/** Límite duro de filas por request del preview (verificado 2026-10-15). */
const MAX_FILAS_API = 500;
/** Margen por debajo del límite al armar lotes: dejarse pegar al tope es cortarse. */
const MARGEN_FILAS = 450;
/** Con key no aplica el tope de 500: se pide `maxrecords` con este margen. */
const MAX_FILAS_CON_CLAVE = 20_000;
const MARGEN_FILAS_CON_CLAVE = 18_000;

/**
 * Codes de los reporters con los que se arma el agregado mundial (partner '0'
 * sumado por capítulo). No sirve una lista ISO 3166-1 "pura": este preview
 * mezcla ISO con códigos legado y NO expone a todos los países en todos los
 * años. Provenance — barrido de los códigos 001–999 el 2026-10-15
 * (cmdCode=TOTAL, partner 0, 2024, flow X): 148 codes respondieron y la suma
 * dio US$24.97T; hallazgos:
 *   - legado no-ISO: EE.UU.=842 (ISO 840 no existe), Francia=251, India=699,
 *     Noruega=579, Suiza=757, Taiwán=490;
 *   - 097 = agregado "Unión Europea" (exporta US$571B a 842): EXCLUIDO por
 *     doble conteo con sus miembros;
 *   - Rusia (643), EAU (784) y Vietnam (704) responden 2019 pero no 2024
 *     (rezago del preview): se conservan los códigos ISO para años previos.
 * Con la unión ISO+legado la suma 2024 da ≈ US$22.2T ≈ 91% del total mundial —
 * la RCA queda por tanto con un denominador levemente bajo (sesgo al alza).
 * Los codes que el preview no reconoce los omite sin error (verificado:
 * reporterCode=999,604 devuelve solo 604), así que la lista es autolimpiante.
 * Para renovarla: repetir el barrido 001–999 por año y comparar sumas.
 */
const REPORTERS_MUNDO = [
  "004","008","012","020","024","028","031","032","036","040","044","048","050","051","052","056","060","064","068","070",
  "072","076","084","090","096","100","104","108","112","116","120","124","132","136","140","144","148","152","156","158",
  "170","174","178","180","188","191","192","196","203","204","208","214","218","222","226","231","232","233","234","238",
  "242","246","248","250","251","254","258","262","266","268","270","275","276","288","300","304","308","320","324","328",
  "332","340","344","348","352","356","360","364","368","372","376","380","383","384","388","392","398","400","404","408",
  "410","414","417","418","422","426","428","430","434","438","440","442","446","450","454","458","462","466","470","478",
  "480","484","490","492","496","498","499","500","504","508","512","516","524","528","540","548","554","558","562","566",
  "578","579","583","584","586","591","598","600","604","608","616","620","624","626","630","634","642","643","646","659",
  "662","670","674","678","682","686","688","690","694","699","702","703","705","706","710","716","724","728","729","732",
  "740","748","752","756","757","760","762","764","768","780","784","788","792","795","800","804","807","818","826","831",
  "832","833","834","840","842","854","858","860","862","882","887","894",
] as const;

const DDL = `
CREATE TABLE IF NOT EXISTS comtrade_flujos (
  id             BIGSERIAL PRIMARY KEY,
  anio           SMALLINT NOT NULL,
  flujo          TEXT NOT NULL,
  reporter_code  TEXT NOT NULL,
  partner_code   TEXT NOT NULL,
  cmd_code       TEXT NOT NULL,
  fob_usd        NUMERIC(20, 2),
  cif_usd        NUMERIC(20, 2),
  primary_usd    NUMERIC(20, 2),
  net_wgt_kg     NUMERIC(20, 3),
  es_estimado    BOOLEAN NOT NULL DEFAULT false,
  es_agregado    BOOLEAN NOT NULL DEFAULT false,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (anio, flujo, reporter_code, partner_code, cmd_code)
);

CREATE INDEX IF NOT EXISTS idx_comtrade_reporter_anio
  ON comtrade_flujos (reporter_code, anio, flujo);
CREATE INDEX IF NOT EXISTS idx_comtrade_partner
  ON comtrade_flujos (partner_code);
CREATE INDEX IF NOT EXISTS idx_comtrade_cmd
  ON comtrade_flujos (cmd_code);
`;

export interface ComtradeFila {
  anio: number;
  flujo: string;
  reporterCode: string;
  partnerCode: string;
  cmdCode: string;
  fobUsd: number | null;
  cifUsd: number | null;
  primaryUsd: number | null;
  netWgtKg: number | null;
  esEstimado: boolean;
  esAgregado: boolean;
}

interface ComtradeApiRow {
  refYear: number;
  flowCode: string;
  reporterCode: number;
  partnerCode: number;
  cmdCode: string;
  fobvalue: number | null;
  cifvalue: number | null;
  primaryValue: number | null;
  netWgt: number | null;
  isNetWgtEstimated: boolean;
  isAggregate: boolean;
}

/**
 * Convierte una fila del preview de Comtrade a la fila propia. Pura para poder
 * testearla con el JSON real capturado de la API (los nulls de reporterDesc /
 * cmdDesc del preview se resuelven con códigos: acá se guarda el código).
 */
export function normalizarComtrade(row: ComtradeApiRow): ComtradeFila | null {
  if (!Number.isInteger(row.refYear) || !row.flowCode) return null;
  return {
    anio: row.refYear,
    flujo: row.flowCode,
    reporterCode: String(row.reporterCode),
    partnerCode: String(row.partnerCode),
    cmdCode: String(row.cmdCode),
    fobUsd: row.fobvalue ?? null,
    cifUsd: row.cifvalue ?? null,
    primaryUsd: row.primaryValue ?? null,
    netWgtKg: row.netWgt ?? null,
    esEstimado: Boolean(row.isNetWgtEstimated),
    esAgregado: Boolean(row.isAggregate),
  };
}

export function buildUrl(opts: {
  reporter: string;
  anio: number;
  flujo: string;
  partners: string[];
  cmds: string[];
  conClave?: boolean;
}): string {
  const params = new URLSearchParams({
    reporterCode: opts.reporter,
    period: String(opts.anio),
    partnerCode: opts.partners.join(","),
    cmdCode: opts.cmds.join(","),
    flowCode: opts.flujo,
  });
  if (opts.conClave) {
    // Endpoint autenticado: solo la fila agregada (idéntica a la del preview,
    // verificado el 2026-10-15) y margen para no cortar la respuesta.
    params.set("motCode", "0");
    params.set("partner2Code", "0");
    params.set("customsCode", "C00");
    params.set("maxrecords", String(MAX_FILAS_CON_CLAVE));
  }
  return `${opts.conClave ? API_CON_CLAVE : API}?${params.toString()}`;
}

/**
 * Parte una lista en lotes de a `maxPorLote` ítems. Exportado para testearlo:
 * es lo que evita el corte silencioso en 500 filas del preview.
 */
export function partirLotes<T>(items: readonly T[], maxPorLote: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += maxPorLote) {
    lotes.push(items.slice(i, i + maxPorLote) as T[]);
  }
  return lotes;
}

/**
 * Lotes cuyo tamaño de request (ítems × cmds) no supere `margenFilas` — el
 * preview trunca en 500 sin avisar. El margen lo pasa el caller según endpoint
 * (MARGEN_FILAS en preview, MARGEN_FILAS_CON_CLAVE con key) para que el default
 * de este módulo no dependa del entorno.
 */
export function lotesPorFila<T>(items: readonly T[], numCmds: number, margenFilas = MARGEN_FILAS): T[][] {
  const maxPorLote = Math.max(1, Math.floor(margenFilas / Math.max(1, numCmds)));
  return partirLotes(items, maxPorLote);
}

/**
 * Tras cada request: si llega al límite de filas el lote quedó cortado
 * (nuestros lotes nunca deberían llegar), y si vino menos filas de las pedidas
 * se avisa (combos sin dato, p.ej. partner = reporter).
 */
function validarLote(rows: ComtradeApiRow[], esperadas: number | null, contexto: string, maxFilas = MAX_FILAS_API): void {
  if (rows.length >= maxFilas) {
    throw new Error(
      `${contexto}: ${rows.length} filas = límite del endpoint (${maxFilas}); request truncado — revisar lotesPorFila`
    );
  }
  if (esperadas !== null && rows.length < esperadas) {
    process.stdout.write(`  aviso ${contexto}: ${rows.length}/${esperadas} filas (combos sin dato)\n`);
  }
}

async function fetchComtrade(url: string, intentos = 6): Promise<ComtradeApiRow[]> {
  // Timeout explícito: sin él, un request colgado deja el conector vivo para
  // siempre (se observó en el dry-run de WDI) y la corrida nunca termina.
  // Reintentos: el preview limita la tasa (429 observado el 2026-10-15) y
  // devuelve 5xx esporádicos — espera creciente 2s, 4s, 8s, 16s.
  // Con key el429 inicial es esperable (ventana de 15 s): la espera mínima ya
  // es esa ventana, y sin key sigue el backoff clásico 2s, 4s, 8s...
  let esperaMs = CLAVE ? 16_000 : 2000;
  for (let intento = 1; ; intento++) {
    let res: Response;
    try {
      // 180 s (no 60): el request de mundo (212 reporters × 46 cmds) superó
      // 60 s bajo carga el 2026-10-15 y abortó 6 veces seguidas. Sigue acotado
      // por intentos: un request huerfano no deja la corrida viva para siempre.
      res = await fetch(url, {
        signal: AbortSignal.timeout(180_000),
        headers: CLAVE ? { "Ocp-Apim-Subscription-Key": CLAVE } : {},
      });
    } catch (err) {
      if (intento >= intentos) throw err;
      process.stdout.write(`  reintento ${intento}/${intentos} (timeout/red): espero ${Math.round(esperaMs / 1000)}s\n`);
      await sleep(esperaMs);
      esperaMs = Math.min(esperaMs * 2, 60_000);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (intento >= intentos) {
        throw new Error(`Comtrade devolvió HTTP ${res.status} tras ${intentos} intentos`);
      }
      process.stdout.write(
        `  reintento ${intento}/${intentos} (HTTP ${res.status}): espero ${Math.round(esperaMs / 1000)}s\n`
      );
      await sleep(esperaMs);
      esperaMs = Math.min(esperaMs * 2, 60_000);
      continue;
    }
    if (res.status === 403) {
      // El preview público tiene cuota de volumen de llamadas: al agotarse
      // responde 403 "Out of call volume quota" con Retry-After (observado el
      // 2026-10-15). Solo se reintenta si es eso — un 403 real (auth) corta ya.
      const texto = await res.text();
      if (!texto.includes("quota")) throw new Error(`Comtrade devolvió HTTP 403: ${texto.slice(0, 200)}`);
      if (intento >= intentos) throw new Error(`Comtrade: cuota del endpoint público agotada tras ${intentos} esperas`);
      const encabezado = res.headers.get("retry-after");
      const esperaCuota =
        encabezado !== null && /^\d+$/.test(encabezado) ? Number(encabezado) * 1000 + 30_000 : Math.max(esperaMs, 60_000);
      process.stdout.write(
        `  cuota Comtrade agotada (403): esperando ${Math.round(esperaCuota / 60_000)} min para reanudar...\n`
      );
      await sleep(esperaCuota);
      continue;
    }
    if (!res.ok) throw new Error(`Comtrade devolvió HTTP ${res.status}`);
    const body = (await res.json()) as { data?: ComtradeApiRow[]; error?: unknown };
    if (body.error) throw new Error(`Comtrade devolvió error: ${JSON.stringify(body.error)}`);
    return body.data ?? [];
  }
}

interface Args {
  anios: number[];
  flujos: string[];
  reporters: string[];
  partners: string[];
  cmds: string[];
  dryRun: boolean;
  sinMundo: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    anios: ANIOS_DEFAULT,
    flujos: FLUJOS_DEFAULT,
    reporters: REPORTERS_DEFAULT,
    partners: PARTNERS_DEFAULT,
    cmds: CMD_DEFAULT,
    dryRun: false,
    sinMundo: false,
  };
  const lista = (raw: string | undefined, fallback: string[]) =>
    (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean).length > 0
      ? (raw as string).split(",").map((s) => s.trim()).filter(Boolean)
      : fallback;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--sin-mundo") args.sinMundo = true;
    else if (a === "--years") {
      const v = (argv[++i] ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
      if (v.length > 0) args.anios = v;
    }
    else if (a === "--flujos") args.flujos = lista(argv[++i], FLUJOS_DEFAULT);
    else if (a === "--reporters") args.reporters = lista(argv[++i], REPORTERS_DEFAULT);
    else if (a === "--partners") args.partners = lista(argv[++i], PARTNERS_DEFAULT);
    else if (a === "--cmds") args.cmds = lista(argv[++i], CMD_DEFAULT);
  }
  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type DbPool = ReturnType<typeof connect>;

/** Upsert por lotes de 500; en dry-run solo cuenta. */
async function insertarFilas(pool: DbPool | null, filas: ComtradeFila[]): Promise<number> {
  if (filas.length === 0) return 0;
  if (!pool) return filas.length; // dry-run: cuenta lo que se habría insertado
  let insertadas = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const valores: unknown[] = [];
    const tuplas: string[] = [];
    for (const r of lote) {
      const base = valores.length;
      tuplas.push(
        `(${Array.from({ length: 11 }, (_, j) => `$${base + j + 1}`).join(",")})`
      );
      valores.push(
        r.anio, r.flujo, r.reporterCode, r.partnerCode, r.cmdCode,
        r.fobUsd, r.cifUsd, r.primaryUsd, r.netWgtKg, r.esEstimado, r.esAgregado
      );
    }
    const res = await pool.query(
      `INSERT INTO comtrade_flujos
         (anio, flujo, reporter_code, partner_code, cmd_code, fob_usd, cif_usd,
          primary_usd, net_wgt_kg, es_estimado, es_agregado)
       VALUES ${tuplas.join(",")}
       ON CONFLICT (anio, flujo, reporter_code, partner_code, cmd_code) DO UPDATE SET
         fob_usd = EXCLUDED.fob_usd, cif_usd = EXCLUDED.cif_usd,
         primary_usd = EXCLUDED.primary_usd, net_wgt_kg = EXCLUDED.net_wgt_kg,
         es_estimado = EXCLUDED.es_estimado, es_agregado = EXCLUDED.es_agregado,
         fetched_at = now()`,
      valores
    );
    insertadas += res.rowCount ?? 0;
  }
  return insertadas;
}

/**
 * Agregado mundial: por cada año×flujo suma las filas partner '0' (exportaciones
 * al Mundo de cada reporter) de TODOS los REPORTERS_MUNDO, por capítulo, y las
 * guarda como reporter_code '0' / partner_code '0' — el denominador de `modo=rca`.
 * Ni el preview ni el endpoint autenticado publican al Mundo como reporter
 * (reporterCode=0 viene vacío): el agregado se sintetiza con o sin key.
 */
async function ingestaMundo(
  args: Args,
  pool: DbPool | null
): Promise<{ requests: number; insertadas: number; reporters: Set<string> }> {
  const conClave = CLAVE.length > 0;
  const contadores = { requests: 0, insertadas: 0, reporters: new Set<string>() };
  for (const anio of args.anios) {
    for (const flujo of args.flujos) {
      const acumulado = new Map<string, number>();
      const reportersVistos = new Set<string>();
      let filasCrudas = 0;
      const lotes = lotesPorFila(
        REPORTERS_MUNDO,
        args.cmds.length,
        conClave ? MARGEN_FILAS_CON_CLAVE : MARGEN_FILAS
      );
      for (const lote of lotes) {
        const url = buildUrl({ reporter: lote.join(","), anio, flujo, partners: ["0"], cmds: args.cmds, conClave });
        const rows = await fetchComtrade(url);
        contadores.requests += 1;
        filasCrudas += rows.length;
        validarLote(
          rows,
          null,
          `mundo ${anio} ${flujo} lote ${lotes.indexOf(lote) + 1}/${lotes.length}`,
          conClave ? MAX_FILAS_CON_CLAVE : MAX_FILAS_API
        );
        for (const r of rows) {
          const code = String(r.reporterCode);
          reportersVistos.add(code);
          contadores.reporters.add(code);
          const valor = r.primaryValue ?? r.fobvalue ?? r.cifvalue;
          if (valor === null || !Number.isFinite(valor)) continue;
          acumulado.set(r.cmdCode, (acumulado.get(r.cmdCode) ?? 0) + valor);
        }
        await sleep(conClave ? DELAY_MS_CON_CLAVE : DELAY_MS);
      }
      const filas: ComtradeFila[] = [...acumulado.entries()].map(([cmd, valor]) => ({
        anio,
        flujo,
        reporterCode: "0",
        partnerCode: "0",
        cmdCode: cmd,
        fobUsd: flujo === "X" ? valor : null,
        cifUsd: flujo === "M" ? valor : null,
        primaryUsd: valor,
        netWgtKg: null,
        esEstimado: false,
        esAgregado: true,
      }));
      contadores.insertadas += await insertarFilas(pool, filas);
      process.stdout.write(
        `  mundo ${anio} ${flujo}: ${reportersVistos.size} reporters, ${filasCrudas} filas crudas → ` +
          `${filas.length} capítulos, TOTAL US$${((acumulado.get("TOTAL") ?? 0) / 1e9).toFixed(1)}B\n`
      );
    }
  }
  return contadores;
}

async function main() {
  const args = parseArgs(process.argv);
  const pool = args.dryRun ? null : connect("bcrp-comercio-exterior");
  if (pool) await pool.query(DDL);

  let insertadas = 0;
  let requests = 0;
  let reportersMundo = new Set<string>();
  try {
    // Lado país: partners en lotes dentro del límite de filas del endpoint.
    const conClave = CLAVE.length > 0;
    const maxFilas = conClave ? MAX_FILAS_CON_CLAVE : MAX_FILAS_API;
    const lotesPartners = lotesPorFila(
      args.partners,
      args.cmds.length,
      conClave ? MARGEN_FILAS_CON_CLAVE : MARGEN_FILAS
    );
    for (const reporter of args.reporters) {
      for (const anio of args.anios) {
        for (const flujo of args.flujos) {
          for (const partnersLote of lotesPartners) {
            const url = buildUrl({ reporter, anio, flujo, partners: partnersLote, cmds: args.cmds, conClave });
            const rows = await fetchComtrade(url);
            requests += 1;
            validarLote(
              rows,
              partnersLote.length * args.cmds.length,
              `reporter ${reporter} ${anio} ${flujo} partners ${partnersLote.join(",")}`,
              maxFilas
            );
            const filas = rows.map(normalizarComtrade).filter((r): r is ComtradeFila => r !== null);
            insertadas += await insertarFilas(pool, filas);
            process.stdout.write(`  reporter ${reporter} ${anio} ${flujo}: ${filas.length} filas\n`);
            await sleep(conClave ? DELAY_MS_CON_CLAVE : DELAY_MS);
          }
        }
      }
    }
    if (!args.sinMundo) {
      const mundo = await ingestaMundo(args, pool);
      requests += mundo.requests;
      insertadas += mundo.insertadas;
      reportersMundo = mundo.reporters;
    }
  } finally {
    if (pool) await pool.end();
  }
  process.stdout.write(
    `comtrade-benchmark: ${requests} requests, ${insertadas} filas` +
      (args.sinMundo ? "" : `, mundo: ${reportersMundo.size} reporters`) +
      `${args.dryRun ? " (dry-run)" : ""}\n`
  );
}

/**
 * El `main()` solo corre cuando el archivo se ejecuta directo (npm run
 * ingest:*). Los tests importan las funciones puras del módulo; sin esta guarda
 * el import disparaba la corrida real y el proceso moría con process.exit(1).
 */
const esEjecucionDirecta =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEjecucionDirecta) {
  main().catch((err) => {
    console.error("comtrade-benchmark falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
