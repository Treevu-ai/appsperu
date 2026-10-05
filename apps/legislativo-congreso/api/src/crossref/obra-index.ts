/**
 * Índice invertido de obras para el cruce keyword-based.
 *
 * Sustituye a la query con un `ILIKE` por keyword. La versión anterior armaba
 * `nombre_obra ILIKE $2 OR ILIKE $3 OR ...` con una cláusula por keyword única
 * del periodo: contra la ingesta real eso fueron 12,888 cláusulas, 17.2 s de
 * query en LA LIBERTAD periodo 2021, y 10,105 (78%) que no matcheaban ninguna
 * obra. Aquí las obras se tokenizan una vez y se arma un índice token → obras,
 * así el costo es proporcional a las coincidencias reales y no al número de
 * palabras del título.
 *
 * Sin límite de candidatas a propósito: el tope anterior de 500 truncaba por
 * `codigo_infobras`, o sea por código y no por relevancia, con lo que un
 * departamento de 10,134 obras devolvía sistemáticamente las 500 de código más
 * bajo. Acá se puntúan todas y la paginación ocurre sobre el conjunto completo.
 */

import { normalizeToken, tokenize } from "../lib/keyword-matcher.js";

/**
 * Tokens administrativos que los nombres de obra embeben y que, dentro de un
 * mismo departamento, no distinguen una obra de otra: cada nombre trae su
 * propio "DEL DISTRITO DE … PROVINCIA … DEPARTAMENTO …".
 *
 * La ubicación ya es el filtro del cruce (`departamento`), así que para puntuar
 * son constantes: incluirlos inflaba el score contra títulos legislativos que
 * también los mencionan. En la corrida real de LA LIBERTAD, una obra de
 * "mejoramiento y ampliación" emparejaba con una ley que listaba
 * `distrito,provincia,departamento` entre sus keywords, y el match era puro
 * boilerplate administrativo.
 */
const TOKENS_ADMINISTRATIVOS = new Set([
  "distrito", "provincia", "departamento", "municipalidad", "municipal",
  "gobierno", "nivel", "region", "provincial", "localidad", "caserio",
  "centro", "poblado", "comunidad", "ubicacion", "geografico",
]);

export interface ObraIndexable {
  codigo_infobras: string;
  nombre_obra: string;
}


export interface IndiceObras<T extends ObraIndexable = ObraIndexable> {
  /** Obras del departamento, en el orden en que llegaron, con su tipo intacto. */
  obras: T[];
  /** Token normalizado → índices de las obras que lo contienen. */
  postings: Map<string, number[]>;
  /** Token normalizado → Inverse Document Frequency. 1 = en todas las obras. */
  idf: Map<string, number>;
}

/**
 * Tokeniza cada nombre de obra una sola vez y publica los postings.
 * Coste lineal en el número de tokens del departamento, no en el de keywords.
 */
export function construirIndiceObras<T extends ObraIndexable>(obras: T[]): IndiceObras<T> {
  const postings = new Map<string, number[]>();
  const df = new Map<string, number>();

  for (let i = 0; i < obras.length; i++) {
    // Set para no contar dos veces un token repetido dentro del mismo nombre
    // ("depuración de agua" repetía "depuracion").
    for (const token of new Set(tokenize(obras[i].nombre_obra))) {
      if (TOKENS_ADMINISTRATIVOS.has(token)) continue;
      let lista = postings.get(token);
      if (!lista) postings.set(token, (lista = []));
      lista.push(i);
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const total = obras.length;
  const idf = new Map<string, number>();
  for (const [token, freq] of df) {
    idf.set(token, Math.log((total + 1) / (freq + 1)));
  }

  return { obras, postings, idf };
}

export interface MatchProyectoObra {
  /** Cantidad de keywords del proyecto que la obra contiene. */
  matched: number;
  /** Keywords del proyecto que la obra contiene, en orden del proyecto. */
  keywords: string[];
  /** Suma de IDF de las keywords coincidentes. */
  idfSum: number;
  /** Índice de la obra en `IndiceObras.obras`. */
  obraIndex: number;
}

/**
 * Puntúa un proyecto contra el índice sin recorrer todas las obras: solo visita
 * los postings de sus keywords. Devuelve los cruces ya filtrados por
 * `umbralMinimo` y `matchedMinimo`, que son los dos filtros de precisión.
 *
 * `matchedMinimo` existe porque la fracción sola no alcanza: con umbral 0.3 una
 * coincidencia de 1 keyword sobre 3 puntúa 0.33 y pasa el corte, y esa fue la
 * forma dominante de cruce en la corrida real.
 *
 * Se recorre cada posting una vez acumulando contadores, en vez de preguntar
 * "esta obra está en esta lista" por cada par: lo segundo sería O(candidatos ×
 * keywords × largo de la lista) y es lo que hizo inviable el primer intento.
 */
export function puntuarProyecto(
  indice: IndiceObras,
  keywords: string[],
  opciones: { umbralMinimo: number; matchedMinimo: number }
): MatchProyectoObra[] {
  if (keywords.length === 0 || indice.obras.length === 0) return [];

  const acumulados = new Map<number, { matched: number; idfSum: number; hit: string[] }>();
  for (const kw of keywords) {
    const lista = indice.postings.get(normalizeToken(kw));
    if (!lista) continue;
    const peso = indice.idf.get(normalizeToken(kw)) ?? 0;
    for (const i of lista) {
      let acc = acumulados.get(i);
      if (!acc) acumulados.set(i, (acc = { matched: 0, idfSum: 0, hit: [] }));
      acc.matched++;
      acc.idfSum += peso;
      acc.hit.push(kw);
    }
  }
  if (acumulados.size === 0) return [];

  const resultados: MatchProyectoObra[] = [];
  for (const [obraIndex, acc] of acumulados) {
    if (acc.matched < opciones.matchedMinimo) continue;
    if (acc.matched / keywords.length < opciones.umbralMinimo) continue;
    resultados.push({
      matched: acc.matched,
      keywords: acc.hit,
      idfSum: acc.idfSum,
      obraIndex,
    });
  }
  return resultados;
}

