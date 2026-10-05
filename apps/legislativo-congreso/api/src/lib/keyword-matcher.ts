/**
 * Utilidades para matching keyword-based entre proyectos de ley y datos ejecutivos.
 *
 * Sin IA, sin embeddings — solo ILIKE y similitud de string básica.
 */

const STOPWORDS = new Set([
  "el", "la", "de", "en", "por", "para", "con", "sin", "a", "que", "y", "o",
  "un", "una", "los", "las", "del", "al", "como", "sea", "ser", "está", "están",
  "su", "sus", "este", "esta", "estos", "estas", "otro", "otra", "otros", "otras",
  "todo", "toda", "todos", "todas", "cada", "cual", "cuales", "donde", "cuando",
  "más", "menos", "entre", "sobre", "contra", "hacia", "hasta", "desde", "hacer",
  "tener", "haber", "poder", "deber", "saber", "ver", "dar", "ir", "venir", "salir",
  "decir", "poner", "quedar", "tomar", "traer", "llevar", "pasar", "entrar", "salir",
  "general", "nacional", "público", "privado", "social", "económico", "político",
  "mediante", "mediante", "dentro", "fuera", "durante", "después", "antes", "siempre",
  "nunca", "jamás", "tal", "cual", "quien", "quienes", "algo", "nada", "alguien",
  "nadie", "alguno", "alguna", "algunos", "algunas", "ninguno", "ninguna", "ningunos",
  "ningunas", "mucho", "mucha", "muchos", "muchas", "poco", "poca", "pocos", "pocas",
  "bien", "mal", "mejor", "peor", "mayor", "menor", "grande", "pequeño", "alto", "bajo",
  "largo", "corto", "ancho", "estrecho", "nuevo", "viejo", "mismo", "misma", "propios",
  "propia", "propios", "propias", "solo", "sola", "solos", "solas", "primer", "primera",
  "primero", "primera", "segundo", "segunda", "último", "última", "últimos", "últimas",
]);

/**
 * Normaliza un texto para matching: minúsculas y sin diacríticos.
 * Toda comparación de keywords debe pasar por aquí para que "públicas"
 * y "publicas" sean equivalentes.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sufijos plurales y su forma singular, para que "saneamientos" y
 * "saneamiento" sean el mismo token. El mapeo es explícito a propósito: quitar
 * un único sufijo no basta, porque "saneamientos" recortando "s" queda
 * "saneamiento" pero recortando "amientos" queda "sane", y los dos ya no
 * coinciden consigo mismos.
 *
 * Se recorta por sufijo y no por prefijo a propósito: tolerar plurales ampliando
 * el prefijo haría que "crea" volviera a matchear "creacion", que es justo el
 * artefacto que el matching por token elimina.
 */
const SUFIJOS_PLURAL: ReadonlyArray<readonly [plural: string, singular: string]> = [
  ["amientos", "amiento"],
  ["imientos", "imiento"],
  ["aciones", "acion"],
  ["uciones", "ucion"],
  ["ancias", "ancia"],
  ["encias", "encia"],
  ["ismos", "ismo"],
  ["anzas", "anza"],
  ["es", ""],
  ["s", ""],
];

/**
 * Reduce un token a una forma singular canónica: "saneamientos" y "saneamiento"
 * → "saneamiento"; "obras" y "obra" → "obra". Solo para tokens de 5+ caracteres,
 * para no deformar "tres" en "tre" ni "pues" en "pu".
 */
export function normalizeToken(token: string): string {
  const t = normalizeText(token);
  if (t.length < 5) return t;
  for (const [plural, singular] of SUFIJOS_PLURAL) {
    if (t.endsWith(plural) && t.length - plural.length >= 4) {
      return t.slice(0, t.length - plural.length) + singular;
    }
  }
  return t;
}

/**
 * Divide un texto en tokens normalizados y singularizados.
 *
 * Separar por token completo, en vez de buscar subcadena, es lo que elimina
 * los falsos positivos medidos contra la ingesta real: con subcadena "crea"
 * matcheaba "CREACION" y la ley "que crea la Universidad Nacional de Ciencias
 * de la Salud" puntuaba 0.40 contra un puesto de salud. Con token completo ese
 * cruce desaparece y no aparece ninguno nuevo a cambio.
 */
export function tokenize(text: string): string[] {
  const normalizado = normalizeText(text);
  if (!normalizado) return [];
  const tokens: string[] = [];
  for (const bruto of normalizado.split(/[^a-z0-9]+/)) {
    if (bruto.length > 2 && !STOPWORDS.has(bruto)) tokens.push(normalizeToken(bruto));
  }
  return tokens;
}

/**
 * Extrae palabras clave de un texto (tokenización simple).
 * Elimina stopwords, números puros, palabras cortas (<3 caracteres).
 *
 * Deduplica por `normalizeToken`, no por la palabra cruda: sin esto, un
 * título con "obra" y "obras" conserva ambas como keywords distintas, y en
 * `puntuarProyecto` las dos buscan el mismo posting ("obra") y cuentan como
 * dos coincidencias para una sola palabra — infla `matched` y permite que
 * `matchScore` llegue a 1.0 o pase `matched_minimo` sin dos conceptos
 * distintos coincidiendo.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const vistos = new Set<string>();
  const keywords: string[] = [];
  for (const word of normalizeText(text).split(/[\s,;:.()\-–—_\/"']/)) {
    if (word.length <= 2 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    const canonico = normalizeToken(word);
    if (vistos.has(canonico)) continue;
    vistos.add(canonico);
    keywords.push(word);
  }
  return keywords;
}

/**
 * Calcula score de match (0.0 a 1.0) basado en palabras clave coincidentes.
 * La coincidencia es por token completo ya singularizado.
 */
export function calculateMatchScore(projectKeywords: string[], targetText: string): number {
  if (projectKeywords.length === 0) return 0;
  return findMatchedKeywords(projectKeywords, targetText).length / projectKeywords.length;
}

/**
 * Devuelve las keywords del proyecto cuyo token aparece en el texto objetivo.
 * Usa tokenize en ambos lados: sin normalizar, un título con acentos puntúa
 * > 0 pero reportaría matchedKeywords vacío.
 */
export function findMatchedKeywords(projectKeywords: string[], targetText: string): string[] {
  const objetivo = new Set(tokenize(targetText));
  if (objetivo.size === 0) return [];
  return projectKeywords.filter((kw) => objetivo.has(normalizeToken(kw)));
}

/**
 * Similitud de Jaccard entre dos strings (para nombres de entidad).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (text: string) =>
    normalizeText(text)
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Extrae CUI de un texto (patrón 6-8 dígitos).
 */
export function extractCUI(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{6,8}\b/);
  return match ? match[0] : null;
}
