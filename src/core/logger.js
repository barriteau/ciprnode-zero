/**
 * @file src/core/logger.js
 * @description Manages writing logs to files with size and time-based rotation.
 */

import { join } from '@std/path';
import { ensureDirSync } from '@std/fs';

const LOG_DIR = join(Deno.cwd(), 'logs');
const LOG_FILE_PATH = join(LOG_DIR, 'ciprnode.log');
const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256 MB
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Ensure log directory exists
try {
  ensureDirSync(LOG_DIR);
} catch (e) {
  console.error('Failed to create log directory:', e);
}

// Ensure the old data/ciprnode.log is deleted (clean up obsolete file)
try {
  const OLD_LOG_FILE = join(Deno.cwd(), 'data', 'ciprnode.log');
  Deno.removeSync(OLD_LOG_FILE);
} catch {
  // Ignore if not present
}

let lastCleanup = Date.now();

const cleanupOldLogs = () => {
  try {
    const now = Date.now();
    for (const entry of Deno.readDirSync(LOG_DIR)) {
      if (entry.isFile && entry.name !== 'ciprnode.log' && entry.name.startsWith('ciprnode_')) {
        const filePath = join(LOG_DIR, entry.name);
        try {
          const stat = Deno.statSync(filePath);
          if (stat.mtime && (now - stat.mtime.getTime() > MAX_AGE_MS)) {
            Deno.removeSync(filePath);
          }
        } catch {
          // Ignore individual file stat/remove errors
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning up old logs:', e);
  }
};

const rotateLogFile = () => {
  try {
    const stat = Deno.statSync(LOG_FILE_PATH);
    if (stat.size >= MAX_FILE_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = join(LOG_DIR, `ciprnode_${timestamp}.log`);
      Deno.renameSync(LOG_FILE_PATH, rotatedPath);
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      // Ignore other errors
    }
  }
};

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

/**
 * Writes text to the log file with rotation.
 * @param {string} text Text to append to the log file.
 */
export const writeToLogFile = (text) => {
  try {
    rotateLogFile();
    Deno.writeTextFileSync(LOG_FILE_PATH, text + '\n', { append: true });
    
    const now = Date.now();
    if (now - lastCleanup > 3600000) { // 1 hour
      cleanupOldLogs();
      lastCleanup = now;
    }
  } catch {
    // Ignore file write errors to prevent crash
  }
};

/**
 * Logs a message to the file with the given level prefix.
 */
export const logToFile = (level, ...args) => {
  writeToLogFile(formatForFile(level, args));
};

// Custom Table Printer (No Headers)
export const logKeyValueTable = (data, separator = '   ') => {
  if (!data || typeof data !== 'object') return;

  const entries = Object.entries(data);
  if (entries.length === 0) return;

  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  entries.forEach(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLen);
    console.log(`${paddedKey}${separator}${value}`);
  });
};
