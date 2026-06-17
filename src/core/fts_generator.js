/**
 * @file src/core/fts_generator.js
 * @description Generates random FTS expressions for Reliability Validation.
 */

// Memory-efficient in-memory cache for up to 1024 unique terms extracted from queries
const TERM_CACHE_MAX_SIZE = 1024;
const recentTermsSet = new Set();
const recentTermsQueue = []; // FIFO to track order for eviction

/**
 * Extracts terms from a user search query and adds them to the volatile memory cache.
 * @param {string} queryStr - The raw user search query.
 */
export const captureSearchTerms = (queryStr) => {
  if (!queryStr || typeof queryStr !== 'string') return;

  // Clean the string: remove common punctuation and FTS syntax characters
  const cleanStr = queryStr
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F\u1E00-\u1EFF]/g, ' ') // Keeps letters/numbers and common accented chars
    .replace(/\b(?:and|or|not|near)\b/g, ' '); // Strip reserved FTS keywords

  const words = cleanStr.split(/\s+/).filter((w) => w.length > 2 && w.length < 20); // Sensible words only

  for (const word of words) {
    if (!recentTermsSet.has(word)) {
      if (recentTermsQueue.length >= TERM_CACHE_MAX_SIZE) {
        // Evict oldest
        const oldest = recentTermsQueue.shift();
        recentTermsSet.delete(oldest);
      }
      recentTermsSet.add(word);
      recentTermsQueue.push(word);
    }
  }
};

/**
 * Generates a random FTS expression combining configured test_words and cached search terms.
 * @param {import('./config.js').CiprNodeConfig} config
 * @returns {string} The generated FTS expression.
 */
export const generateRandomFTSExpression = (config) => {
  const pool = [...(config.test_words || [])];

  if (recentTermsQueue.length > 0) {
    const cacheSampleCount = Math.min(recentTermsQueue.length, 50);
    const shuffledCache = [...recentTermsQueue].sort(() => 0.5 - Math.random());
    pool.push(...shuffledCache.slice(0, cacheSampleCount));
  }

  if (pool.length === 0) {
    pool.push('node', 'data', 'test');
  }

  const termCount = Math.floor(Math.random() * 5) + 1;
  const selectedTerms = [];
  for (let i = 0; i < termCount; i++) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    selectedTerms.push(pool[randomIndex]);
  }

  const uniqueTerms = [...new Set(selectedTerms)];

  const isComplex = Math.random() < 0.10;

  if (!isComplex || uniqueTerms.length < 2) {
    return uniqueTerms.join(' ');
  }

  const operators = ['AND', 'OR', 'NOT', 'NEAR', 'PREFIX'];
  const op = operators[Math.floor(Math.random() * operators.length)];

  if (op === 'NOT') {
    return `${uniqueTerms[0]} NOT ${uniqueTerms[1]}`;
  } else if (op === 'NEAR') {
    const distance = Math.floor(Math.random() * 5) + 1;
    return `NEAR(${uniqueTerms[0]} ${uniqueTerms[1]}, ${distance})`;
  } else if (op === 'PREFIX') {
    return `${uniqueTerms[0]}* ${uniqueTerms[1]}`;
  } else if (op === 'AND' || op === 'OR') {
    return uniqueTerms.join(` ${op} `);
  }

  return uniqueTerms.join(' ');
};
