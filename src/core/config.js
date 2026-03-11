import { msg } from './utils.js';
/**
 * @file src/core/config.js
 * @description Configuration loader module. Reads ciprnode.toml and provides config object.
 */

import { parse } from '@std/toml';
import { validateCiprConfig } from './validator.js';
import { dirname, join } from '@std/path';
import { exists } from '@std/fs';

/**
 * @typedef {Object} CiprNodeConfig
 * @property {string} za - Zone Apex
 * @property {number} port - Listening port
 * @property {string} env - Environment
 * @property {string} title
 * @property {string} description
 * @property {string[]} keywords
 * @property {number} ol
 * @property {number} latitude
 * @property {number} longitude
 * @property {string} bootstrap_node
 * @property {number} page_size
 * @property {string} [parent_url]
 * @property {string} [primary_lang]
 * @property {string[]} test_words
 * @property {Object} [dns_provider]
 * @property {Object[]} [ise_provider]
 */

/**
 * Loads configuration from the toml file.
 * @param {string} configPath - Path to the config file.
 * @returns {Promise<CiprNodeConfig>} The parsed configuration.
 */
import { load } from '@std/dotenv';

/**
 * Loads configuration from the toml file.
 * @param {string} configPath - Path to the config file.
 * @returns {Promise<CiprNodeConfig>} The parsed configuration.
 */
export const loadConfig = async (configPath = 'ciprnode.toml') => {
  // Load .env file if present (doesn't throw if missing)
  await load({ export: true });

  // Check CWD first
  let absolutePath = join(Deno.cwd(), configPath);

  // If not found, check relative to executable (for services/binaries)
  if (!(await exists(absolutePath))) {
    // execPath is likely /path/to/ciprnode.exe
    const _bindir = new URL('.', import.meta.url).pathname; // fallback for current module
    // But since this runs in Deno, Deno.execPath() is the runtime.
    // Deno.mainModule gives the script entry.
    // For Deno Compile: Deno.execPath() is the binary itself.
    const execDir = dirname(Deno.execPath());
    const execConfigPath = join(execDir, configPath);

    if (await exists(execConfigPath)) {
      absolutePath = execConfigPath;
      // Also update CWD to be here? Maybe not side-effecty.
    }
  }

  if (!(await exists(absolutePath))) {
    msg(`[FATAL] Config file not found at ${absolutePath}`, 'KO');
    Deno.exit(1);
  }

  try {
    const text = await Deno.readTextFile(absolutePath);
    const data = parse(text);

    // Flatten structure for internal use if needed, or keep it strict.
    // Mapping TOML structure to flat config object for simplicity
    const ciprEntry = data.cipr_entry || {};
    const network = data.network || {};

    // Helper to parse coordinates: returns null if missing, otherwise raw value for validation
    const parseCoord = (val) => {
      if (val === undefined || val === null || val === '') return null;
      return val; // Allow validator to check type (Number.isInteger fails for string/bool)
    };

    const config = {
      za: ciprEntry.za || 'localhost',
      parent_url: data.parent_url || '',
      port: Number(network.port) || 443,
      env: data.env || 'development',
      title: ciprEntry.title || '',
      description: ciprEntry.description || '',
      keywords: typeof ciprEntry.keywords === 'string'
        ? ciprEntry.keywords.split(' ').filter((k) => k.length > 0)
        : (Array.isArray(ciprEntry.keywords) ? ciprEntry.keywords : []),
      primary_lang:
        (typeof ciprEntry.primary_lang === 'string' && ciprEntry.primary_lang.trim() !== '')
          ? ciprEntry.primary_lang.trim()
          : null,
      ol: (Number(ciprEntry.ol) === 0 || ciprEntry.ol === '' || ciprEntry.ol === null ||
          ciprEntry.ol === undefined)
        ? null
        : Number(ciprEntry.ol),
      latitude: parseCoord(ciprEntry.latitude),
      longitude: parseCoord(ciprEntry.longitude),
      bootstrap_node: network.bootstrap_node || '',
      expected_propagation_time: Number(data.expected_propagation_time) || 120000,
      page_size: Number(data.ciprface?.page_size) || 50,
      test_words: typeof data.test_words === 'string'
        ? data.test_words.split(/\s+/).filter((k) => k.length > 0)
        : (Array.isArray(data.test_words) ? data.test_words : []),
      log_level: typeof data.log_level === 'number' ? data.log_level : 2,
      debug: Deno.args.includes('--debug') || data.debug === true || false,
      // Optional [meta_data] section — passed through as-is; individual keys may be absent.
      meta_data: data.meta_data && typeof data.meta_data === 'object' ? data.meta_data : null,
      dns: {
        do53: Array.isArray(network.do53)
          ? network.do53
          : (Array.isArray(data.do53) ? data.do53 : []),
        doh: Array.isArray(network.doh) ? network.doh : (Array.isArray(data.doh) ? data.doh : []),
      },
      dns_provider: {
        name: Deno.env.get('CIPR_DNS_PROVIDER') || data.dns_provider?.name || '',
        api_token: Deno.env.get('CIPR_DNS_API_TOKEN') || data.dns_provider?.api_token || '',
        zone_id: Deno.env.get('CIPR_DNS_ZONE_ID') || data.dns_provider?.zone_id || '',
      },
      ise_provider: Array.isArray(data.ise_provider)
        ? data.ise_provider
        : (data.ise_provider ? [data.ise_provider] : []),
    };

    validateCiprConfig(config);
    return config;
  } catch (error) {
    msg('Error parsing config file: ' + error, 'KO');
    throw error;
  }
};

/**
 * Returns default configuration.
 * @returns {CiprNodeConfig}
 */
const _getDefaultConfig = () => {
  return {
    za: 'localhost',
    parent_url: '',
    port: 443,
    env: 'development',
    title: 'Default Node',
    description: 'Unconfigured Cipr Node',
    keywords: [],
    primary_lang: null,
    ol: null,
    latitude: 0,
    longitude: 0,
    bootstrap_node: '',
    page_size: 50,
    test_words: [],
    log_level: 2,
    debug: false,
    meta_data: null,
    dns: {
      do53: [],
      doh: [],
    },
    dns_provider: {
      name: '',
      api_token: '',
      zone_id: '',
    },
    ise_provider: [],
  };
};
