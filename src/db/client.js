/**
 * @file src/db/client.js
 * @description SQLite database client factory.
 */

import { Database } from 'jsr:@db/sqlite@^0.12.0';
import { dirname, join } from 'jsr:@std/path@^1.0.8';
import { ensureDir } from 'jsr:@std/fs@^1.0.6';

/**
 * Initializes and returns the database connection.
 * @returns {Promise<Database>} The SQLite database instance.
 */
export const getDbConnection = async () => {
  const dbPath = join(Deno.cwd(), 'data', 'ciprdup.db');

  // Ensure data directory exists
  await ensureDir(dirname(dbPath));

  const db = new Database(dbPath);

  // High-Performance Configuration (Pragmas)
  // WAL Mode: Allows concurrent readers and writers
  db.exec('PRAGMA journal_mode = WAL;');

  // Synchronous NORMAL: Faster writes, safe enough for this use case
  db.exec('PRAGMA synchronous = NORMAL;');

  // Page Size 8KB: Optimized for large datasets (reduces B-Tree depth)
  db.exec('PRAGMA page_size = 8192;');

  // Cache Size 2GB: Negative value = kilobytes (-2000000 = ~2GB)
  // Keeps index hot in memory to avoid disk I/O
  db.exec('PRAGMA cache_size = -2000000;');

  // Memory Map 2GB: Maps the DB file into RAM for direct access
  db.exec('PRAGMA mmap_size = 2147483648;');

  console.log(`Database connection established at: ${dbPath}`);

  return db;
};
