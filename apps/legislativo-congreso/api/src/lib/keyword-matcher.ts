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
 * Extrae palabras clave de un texto (tokenización simple).
 * Elimina stopwords, números puros, palabras cortas (<3 caracteres).
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  return normalizeText(text)
    .split(/[\s,;:.()\-–—_\/"']/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
    .filter((word, i, arr) => arr.indexOf(word) === i); // Remove duplicates
}

/**
 * Calcula score de match (0.0 a 1.0) basado en palabras clave coincidentes.
 */
export function calculateMatchScore(projectKeywords: string[], targetText: string): number {
  if (projectKeywords.length === 0) return 0;
  return findMatchedKeywords(projectKeywords, targetText).length / projectKeywords.length;
}

/**
 * Devuelve las keywords del proyecto que aparecen en el texto objetivo.
 * Usa normalizeText en ambos lados: sin esto, un título con acentos
 * puntúa > 0 pero reportaría matchedKeywords vacío.
 */
export function findMatchedKeywords(projectKeywords: string[], targetText: string): string[] {
  const target = normalizeText(targetText);
  if (!target) return [];
  return projectKeywords.filter((kw) => target.includes(kw));
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
