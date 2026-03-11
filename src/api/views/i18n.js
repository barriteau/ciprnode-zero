import { msg } from '../../core/utils.js';
/**
 * @file src/api/views/i18n.js
 * @description Simple Internationalization Helper
 */

import { join } from '@std/path';

export class I18n {
  constructor() {
    this.locales = {};
    this.supported = ['en', 'es', 'it', 'zh', 'fr', 'pt', 'ru', 'hi'];
    this.defaultLocale = 'en';
  }

  /**
   * Loads all locale JSON files from disk
   * @param {string} localesDir
   */
  async load(localesDir) {
    for (const lang of this.supported) {
      try {
        const text = await Deno.readTextFile(join(localesDir, `${lang}.json`));
        this.locales[lang] = JSON.parse(text);
      } catch (e) {
        msg(`Failed to load locale ${lang}: ${e.message}`, 'WA');
        this.locales[lang] = {};
      }
    }
  }

  /**
   * Translates a key for a given locale
   * @param {string} locale
   * @param {string} key
   * @param {object} params - Optional parameters for replacement
   */
  t(locale, key, params = {}) {
    const lang = this.supported.includes(locale) ? locale : this.defaultLocale;
    const dictionary = this.locales[lang] || this.locales[this.defaultLocale];

    // Support nested keys "search.placeholder"
    const keys = key.split('.');
    let value = dictionary;
    for (const k of keys) {
      value = value?.[k];
    }

    if (!value) return key; // Fallback to key if not found

    // Replace params {name}
    return value.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
  }
}

export const i18n = new I18n();
