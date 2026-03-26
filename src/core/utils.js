/**
 * @file src/core/utils.js
 * @description Shared utility functions.
 */

import { createSha256Hash } from './crypto.js';
import { logToFile } from './logger.js';

export let LOG_LEVEL = 2; // 0: silent, 1: operational, 2: verbose
export let DEBUG_MODE = false;

export const setLoggingConfig = (level, debug) => {
  LOG_LEVEL = level;
  DEBUG_MODE = debug;
};

// Environment Detection
const getEnv = () => {
  if (typeof globalThis !== 'undefined' && globalThis.window && globalThis.document) {
    return 'browser';
  }
  if (typeof Deno !== 'undefined') {
    return 'deno';
  }
  if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.versions && globalThis.process.versions.node) {
    return 'node';
  }
  // Fallbacks for bash, zsh, powershell natively vs node/deno
  return 'unknown';
};

export const ENVIRONMENT = getEnv();

// Check if environment supports ANSI colors
const supportsANSI = () => {
  if (ENVIRONMENT === 'browser') return false;
  if (ENVIRONMENT === 'deno') return !Deno.noColor;
  if (ENVIRONMENT === 'node') {
    return globalThis.process && globalThis.process.stdout && globalThis.process.stdout.isTTY && !globalThis.process.env?.NO_COLOR;
  }
  return false;
};

export const USE_ANSI = supportsANSI();

// CSS Colors
const OK = 'color: #00FF00'; // Bright Neon Green
const WA = 'color: #FFFF00'; // Pure Bright Yellow
const KO = 'color: #FF0000'; // Pure Bright Red
const CL_DNS = 'color: #00E5FF'; // Cyan
const CL_REQ = 'color: #FF55FF'; // Bright Neon Pink
const CL_RES = 'color: #FFB74D'; // Orange/Amber

// ANSI 24-bit TrueColor sequences
const ANSI_OK = '\x1b[38;2;0;255;0m';
const ANSI_WA = '\x1b[38;2;255;255;0m';
const ANSI_KO = '\x1b[38;2;255;0;0m';
const ANSI_DNS = '\x1b[38;2;0;229;255m';
const ANSI_REQ = '\x1b[38;2;255;85;255m';
const ANSI_RES = '\x1b[38;2;255;183;77m';
const ANSI_B = '\x1b[1m'; // Bold
const ANSI_RESET = '\x1b[0m';

/**
 * Draw a separator line in the console
 * @param {string} type what type of line to draw, OK, IN, or END
 */
export const line = (type) => {
  if (DEBUG_MODE) {
    logToFile('INFO', '--------------------------------------------------------------------------------');
  }
  if (LOG_LEVEL === 0) return;

  const lineChar = '━'.repeat(80);

  if (USE_ANSI) {
    let ansiColor = ANSI_OK;
    if (type === 'DNS') ansiColor = ANSI_DNS;
    else if (type === 'REQ') ansiColor = ANSI_REQ;
    else if (type === 'RES') ansiColor = ANSI_RES;
    else if (type === 'WA') ansiColor = ANSI_WA;
    else if (type === 'KO') ansiColor = ANSI_KO;
    const formatted = `${ansiColor}${lineChar}${ANSI_RESET}`;
    
    switch (type) {
      case 'END':
        console.groupEnd();
        console.log(formatted);
        break;
      case 'IN':
        console.log(formatted);
        console.group();
        break;
      default:
        console.log(formatted);
        console.group();
        break;
    }
  } else if (ENVIRONMENT === 'browser') {
    const LI = `%c${lineChar}`;
    let cssColor = OK;
    if (type === 'DNS') cssColor = CL_DNS;
    else if (type === 'REQ') cssColor = CL_REQ;
    else if (type === 'RES') cssColor = CL_RES;
    else if (type === 'WA') cssColor = WA;
    else if (type === 'KO') cssColor = KO;

    switch (type) {
      case 'END':
        console.groupEnd();
        console.log(LI, OK); // Typically ends don't take color, but OK is standard
        break;
      case 'IN':
        console.log(LI, OK);
        console.group();
        break;
      default:
        console.log(LI, cssColor);
        console.group();
        break;
    }
  } else {
    // Fallback text only
    switch (type) {
      case 'END':
        console.groupEnd();
        console.log(lineChar);
        break;
      case 'IN':
        console.log(lineChar);
        console.group();
        break;
      default:
        console.log(lineChar);
        console.group();
        break;
    }
  }
};

/**
 * Print colorful messages in the console
 * @param {string} text message text
 * @param {string} type what type of message to show, H1, OK, WA or KO
 * @param {boolean} indent whether to indent the message
 */
export const msg = (text, type, indent = false) => {
  if (DEBUG_MODE) {
    logToFile(type || 'INFO', text);
  }
  if (LOG_LEVEL === 0) return;

  const indentStr = indent ? '\t' : '';

  if (USE_ANSI) {
    let colorStr = '';
    switch (type) {
      case 'H1': colorStr = ANSI_B; break;
      case 'OK': colorStr = ANSI_OK; break;
      case 'WA': colorStr = ANSI_WA; break;
      case 'KO': colorStr = ANSI_KO; break;
      case 'DNS': colorStr = ANSI_DNS; break;
      case 'REQ': colorStr = ANSI_REQ; break;
      case 'RES': colorStr = ANSI_RES; break;
      default: colorStr = ''; break;
    }
    const output = `${colorStr}${indentStr}${text}${ANSI_RESET}`;
    switch (type) {
      case 'WA': return console.warn(output);
      case 'KO': return console.error(output);
      default: return console.log(output);
    }
  } else if (ENVIRONMENT === 'browser') {
    switch (type) {
      case 'H1': return console.log(`%c${indentStr}${text}`, 'font-weight: bold');
      case 'OK': return console.log(`%c${indentStr}${text}`, OK);
      case 'WA': return console.warn(`%c${indentStr}${text}`, WA);
      case 'KO': return console.error(`%c${indentStr}${text}`, KO);
      case 'DNS': return console.log(`%c${indentStr}${text}`, CL_DNS);
      case 'REQ': return console.log(`%c${indentStr}${text}`, CL_REQ);
      case 'RES': return console.log(`%c${indentStr}${text}`, CL_RES);
      default: return console.log(`${indentStr}${text}`);
    }
  } else {
    switch (type) {
      case 'WA': return console.warn(`${indentStr}${text}`);
      case 'KO': return console.error(`${indentStr}${text}`);
      default: return console.log(`${indentStr}${text}`);
    }
  }
};

/**
 * Calculates the number of nodes to propagate to per pulse to infect the network.
 * @param {number} totalNodes - Total numbers of ciprnodes in the ciprdup. (Required)
 * @param {number} propagationTime - Expected propagation time in milliseconds. (Required)
 * @returns {number} Number of ciprnodes per pulse (integer >= 1).
 */
export const calculateNodesPerPulse = (totalNodes, propagationTime) => {
  if (totalNodes === undefined || totalNodes === null) {
    throw new Error('Total numbers of ciprnodes in the ciprdup is required');
  }
  if (!propagationTime) {
    throw new Error('propagationTime is required');
  }

  // Ensure integers
  const N = Math.max(1, Math.floor(totalNodes));
  const T_ms = Math.max(1, Math.floor(propagationTime));

  // Convert Time to "steps" (assuming 1s per step/hop latency)
  // Logic: N^(1/steps)
  const steps = Math.max(1, T_ms / 1000);

  const nodesPerPulse = Math.ceil(Math.pow(N, 1 / steps));

  // Can't be less than 1
  return Math.max(1, nodesPerPulse);
};

/**
 * Generates the standardized CIPR hash for an entry.
 * Standardizes fallback values (e.g. lat/long 0 vs '') to ensure consistency.
 *
 * @param {string} za
 * @param {string} title
 * @param {string} description
 * @param {string|string[]} keywords
 * @param {number|string} ol
 * @param {number|string} latitude
 * @param {number|string} longitude
 * @param {string} [primary_lang]
 * @returns {Promise<string>} The SHA256 hash.
 */
export const generateCiprHash = async (
  za,
  title,
  description,
  keywords,
  offering,
  seeking,
  primary_lang,
  ol,
  latitude,
  longitude,
) => {
  const keywordsStr = Array.isArray(keywords) ? keywords.join(' ') : (keywords || '');

  // Standardize '0' for falsy/empty numeric fields according to "0 to skip" spec logic.
  // This ensures that 0, null, undefined, and "" all map to "0" for the hash.
  const olStr = String(ol || 0);
  const latStr = String(latitude || 0);
  const lonStr = String(longitude || 0);

  // Construct the pipe-separated string
  const input = [
    za,
    title,
    description,
    keywordsStr,
    offering || '',
    seeking || '',
    primary_lang || '',
    olStr,
    latStr,
    lonStr,
  ].join('¦');

  msg(`String to hash: ${input}`);

  return await createSha256Hash(input);
};
