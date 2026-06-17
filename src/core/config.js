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
 * @property {string[]} bootstrap_nodes
 * @property {number} page_size
 * @property {string} [primary_lang]
 * @property {string[]} test_words
 * @property {Object} [dns_provider]
 * @property {Object[]} [ise_provider]
 */

import { load } from '@std/dotenv';

export const loadConfig = async (configPath = 'ciprnode.toml') => {
  // Load .env file if present (doesn't throw if missing)
  await load({ export: true });

  // Check CWD first
  let absolutePath = join(Deno.cwd(), configPath);

  // If not found, check relative to executable (for services/binaries)
  if (!(await exists(absolutePath))) {
    const execDir = dirname(Deno.execPath());
    const execConfigPath = join(execDir, configPath);

    if (await exists(execConfigPath)) {
      absolutePath = execConfigPath;
    }
  }

  if (!(await exists(absolutePath))) {
    msg(`[FATAL] Config file not found at ${absolutePath}`, 'KO');
    Deno.exit(1);
  }

  try {
    const text = await Deno.readTextFile(absolutePath);
    const data = parse(text);

    const ciprEntry = data.cipr_entry || {};
    const network = data.network || {};

    // Helper to parse coordinates: returns null if missing, otherwise raw value for validation
    const parseCoord = (val) => {
      if (val === undefined || val === null || val === '') return null;
      return val; // Allow validator to check type (Number.isInteger fails for string/bool)
    };

    const config = {
      za: ciprEntry.za,
      port: network.port !== undefined ? Number(network.port) : undefined,
      env: data.env,
      title: ciprEntry.title,
      description: ciprEntry.description,
      keywords: typeof ciprEntry.keywords === 'string'
        ? ciprEntry.keywords.split(' ').filter((k) => k.length > 0)
        : (Array.isArray(ciprEntry.keywords) ? ciprEntry.keywords : undefined),
      offering: (typeof ciprEntry.offering === 'string' && ciprEntry.offering.trim() !== '') ? ciprEntry.offering.trim() : undefined,
      seeking: (typeof ciprEntry.seeking === 'string' && ciprEntry.seeking.trim() !== '') ? ciprEntry.seeking.trim() : undefined,
      primary_lang:
        (typeof ciprEntry.primary_lang === 'string' && ciprEntry.primary_lang.trim() !== '')
          ? ciprEntry.primary_lang.trim()
          : undefined,
      ol: (ciprEntry.ol === '' || ciprEntry.ol === null || ciprEntry.ol === undefined)
        ? undefined
        : (Number(ciprEntry.ol) === 0 ? null : Number(ciprEntry.ol)),
      latitude: parseCoord(ciprEntry.latitude),
      longitude: parseCoord(ciprEntry.longitude),
      bootstrap_nodes: (() => {
        const arr = network.bootstrap_nodes ?? data.network?.bootstrap_nodes ?? data.bootstrap_nodes;
        if (arr) {
          return Array.isArray(arr) ? arr : [arr];
        }
        const legacy = network.bootstrap_node ?? data.network?.bootstrap_node ?? data.bootstrap_node;
        return legacy ? [legacy] : undefined;
      })(),
      expected_propagation_time: network.expected_propagation_time !== undefined ? Number(network.expected_propagation_time) : undefined,
      page_size: data.ciprface?.page_size !== undefined ? Number(data.ciprface.page_size) : undefined,
      test_words: typeof (network.test_words || data.test_words) === 'string'
        ? (network.test_words || data.test_words).split(/\s+/).filter((k) => k.length > 0)
        : (Array.isArray(network.test_words || data.test_words) ? (network.test_words || data.test_words) : undefined),
      log_level: (() => {
        // --log-level=N or --log_level=N CLI arg takes precedence over ciprnode.toml.
        const cliArg = Deno.args.find((a) => /^--log[_-]level=/.test(a));
        if (cliArg) {
          const n = parseInt(cliArg.split('=')[1], 10);
          if (!isNaN(n) && n >= 0 && n <= 2) return n;
        }
        return typeof data.log_level === 'number' ? data.log_level : undefined;
      })(),
      debug: Deno.args.includes('--debug') || data.debug === true || false,
      // Optional [meta_data] section — passed through as-is; individual keys may be absent.
      meta_data: data.meta_data && typeof data.meta_data === 'object' ? data.meta_data : undefined,
      dns: {
        do53: Array.isArray(network.do53)
          ? network.do53
          : (Array.isArray(data.do53) ? data.do53 : undefined),
        doh: Array.isArray(network.doh) ? network.doh : (Array.isArray(data.doh) ? data.doh : undefined),
      },
      dns_provider: {
        name: Deno.env.get('CIPR_DNS_PROVIDER') || data.dns_provider?.name,
        api_token: Deno.env.get('CIPR_DNS_API_TOKEN') || data.dns_provider?.api_token,
        zone_id: Deno.env.get('CIPR_DNS_ZONE_ID') || data.dns_provider?.zone_id,
      },
      ise_provider: Array.isArray(data.ise_provider)
        ? data.ise_provider
        : (data.ise_provider ? [data.ise_provider] : undefined),
    };

    validateCiprConfig(config);
    return config;
  } catch (error) {
    msg('Error parsing config file: ' + error.message, 'KO');
    throw error;
  }
};
