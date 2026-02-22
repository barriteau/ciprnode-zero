import { dirname, join } from '@std/path';
import { ensureDirSync } from '@std/fs';

const LOG_FILE_PATH = join(Deno.cwd(), 'data', 'ciprnode.log');

// Ensure log directory exists
try {
  ensureDirSync(dirname(LOG_FILE_PATH));
} catch (e) {
  console.error('Failed to create log directory:', e);
}

const formatForFile = (level, args) => {
  const timestamp = new Date().toISOString();
  const message = args.map((arg) => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  return `[${timestamp}] [${level}] ${message}`;
};

const writeToLogFile = (text) => {
  try {
    Deno.writeTextFileSync(LOG_FILE_PATH, text + '\n', { append: true });
  } catch {
    // Ignore file write errors to prevent crash
  }
};

/**
 * Patches the global console object to write to the log file.
 * Must be called once at startup.
 */
export const setupConsoleLogging = () => {
  const originalLog = console.log;
  const originalInfo = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalDebug = console.debug;

  console.log = (...args) => {
    writeToLogFile(formatForFile('LOG', args));
    originalLog.apply(console, args);
  };

  console.log = (...args) => {
    writeToLogFile(formatForFile('INFO', args));
    originalInfo.apply(console, args);
  };

  console.warn = (...args) => {
    writeToLogFile(formatForFile('WARN', args));
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    writeToLogFile(formatForFile('ERROR', args));
    originalError.apply(console, args);
  };

  console.debug = (...args) => {
    writeToLogFile(formatForFile('DEBUG', args));

    // Check for --debug flag for console visibility
    if (Deno.args.includes('--debug')) {
      originalDebug.apply(console, args);
    }
  };
};

// Custom Table Printer (No Headers)
export const logKeyValueTable = (data, separator = '   ') => {
  if (!data || typeof data !== 'object') return;

  const entries = Object.entries(data);
  if (entries.length === 0) return;

  // Calculate padding
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  entries.forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLen);
    console.log(`${paddedKey}${separator}${value}`);
  });
};

// Legacy aliases for backward compatibility during refactor
export const logInfo = (msg, data) => {
  console.log(`${msg}`, data || '');
};

export const logSuccess = (msg, data) => {
  console.log(`[OK]   ${msg}`, data || '');
};

export const logWarn = (msg, data) => {
  console.warn(`[WARN] ${msg}`, data || '');
};

export const logError = (msg, err) => {
  console.error(`[ERR]  ${msg}`, err || '');
};

export const logDebug = (config, msg, data) => {
  // If config.debug is true, we want to see this.
  // console.debug might be hidden unless --debug flag is used in Deno.
  // We'll force it to console.log with a [DBG] prefix if config.debug is on.
  if (config?.debug) {
    // Use console.log or console.info to ensure output to stdout
    // when the application config says debug is enabled.
    const serialized = data
      ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data))
      : '';
    console.log(`[DBG]  ${msg}`, serialized);
  }
};
