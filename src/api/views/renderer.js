/**
 * @file src/api/views/renderer.js
 * @description Template Renderer using Eta
 */

import { Eta } from '@eta-dev/eta';
import { join } from '@std/path';
import { i18n } from './i18n.js';

const TEMPLATES_DIR = join(Deno.cwd(), 'src/templates');

// Initialize Eta
const eta = new Eta({
  views: TEMPLATES_DIR,
  cache: true, // Production should technically cache, dev maybe not? But Eta caching is smart.
  rmWhitespace: true, // Minify HTML output at compile time
});

/**
 * Renders a template with data and i18n context
 * @param {string} templatePath - path relative to src/templates (e.g. "views/index.eta")
 * @param {object} data - Data to pass to template
 * @param {string} locale - Current locale (en, es, etc.)
 */
export function render(templatePath, data = {}, locale = 'en') {
  // Inject t() function into data
  const ctx = {
    ...data,
    t: (key, params) => i18n.t(locale, key, params),
    locale: locale,
    supportedLocales: i18n.supported,
    // Helper to switch language URL? No, handled by browser reload + cookie now.
  };

  return eta.render(templatePath, ctx);
}

/**
 * Initialize Renderer (Load locales)
 */
export async function initRenderer() {
  await i18n.load(join(Deno.cwd(), 'src/locales'));
}
