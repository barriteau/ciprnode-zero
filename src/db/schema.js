import { msg } from '../core/utils.js';
import langs from './languages.json' with { type: 'json' };
/**
 * @file src/db/schema.js
 * @description Database schema definitions and initialization.
 */

/**
 * Seeds the languages table if it is empty.
 * Creates the table if it does not exist.
 * @param {import('@db/sqlite').Database} db - The database instance.
 */
export const seedLanguages = (db) => {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS languages (
        lang_code TEXT PRIMARY KEY,
        lang_name TEXT NOT NULL,
        lang_name_en TEXT NOT NULL
      ) STRICT;
    `);

    const countResult = db.prepare('SELECT COUNT(*) as c FROM languages').get();
    if (countResult && countResult.c > 0) {
      msg('[OK] Languages table already seeded.');
      return;
    }

    const insertLang = db.prepare(
      'INSERT INTO languages (lang_code, lang_name, lang_name_en) VALUES (?, ?, ?)',
    );

    db.exec('BEGIN TRANSACTION;');
    langs.forEach((lang) => {
      insertLang.run(lang.lang_code, lang.lang_name, lang.lang_name_en);
    });
    db.exec('COMMIT;');

    msg(`[OK] Seeded languages table with ${langs.length} entries.`);
  } catch (e) {
    msg('Could not seed languages table: ' + e.message, 'WA');
  }
};

/**
 * Initializes the database schema.
 * @param {import('@db/sqlite').Database} db - The database instance.
 */
export const initSchema = (db) => {
  // Check if main table exists to verify initialization state
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ciprdup'",
  ).get();

  if (tableExists) {
    seedLanguages(db);
    return;
  }

  msg('Initializing Database Schema...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ciprdup (
      -- Zone Apex: The unique identifier for the resource.
      -- Constraint: Must be a string (TEXT).
      -- Constraint: Max length 255 characters (DNS limit).
      -- Constraint: Must contain at least one dot ('.') to simulate basic domain structure.
      za TEXT PRIMARY KEY CHECK (length(za) <= 255 AND za LIKE '%.%'),

      -- Title: The resource title.
      -- Constraint: Min 1, max 64 characters.
      -- Constraint: Must NOT contain Newline (LF), Carriage Return (CR),
      --              Line Separator (U+2028), or Paragraph Separator (U+2029).
      title TEXT CHECK (length(title) >= 1 AND length(title) <= 64
        AND instr(title, x'0A') = 0 AND instr(title, x'0D') = 0
        AND instr(title, x'E280A8') = 0 AND instr(title, x'E280A9') = 0),

      -- Description: A brief explanation of the resource.
      -- Constraint: Min 1, max 256 characters.
      -- Constraint: Must NOT contain Newline (LF), Carriage Return (CR),
      --              Line Separator (U+2028), or Paragraph Separator (U+2029).
      description TEXT CHECK (length(description) >= 1 AND length(description) <= 256
        AND instr(description, x'0A') = 0 AND instr(description, x'0D') = 0
        AND instr(description, x'E280A8') = 0 AND instr(description, x'E280A9') = 0),

      -- Keywords: Space-separated tags.
      -- Constraint: Min 1, max 512 characters.
      -- Constraint: Must NOT contain Newline (LF), Carriage Return (CR),
      --              Line Separator (U+2028), or Paragraph Separator (U+2029).
      keywords TEXT CHECK (length(keywords) >= 1 AND length(keywords) <= 512
        AND instr(keywords, x'0A') = 0 AND instr(keywords, x'0D') = 0
        AND instr(keywords, x'E280A8') = 0 AND instr(keywords, x'E280A9') = 0),
      offering TEXT CHECK (offering IS NULL OR (length(offering) <= 128
        AND instr(offering, x'0A') = 0 AND instr(offering, x'0D') = 0
        AND instr(offering, x'E280A8') = 0 AND instr(offering, x'E280A9') = 0)),
      seeking TEXT CHECK (seeking IS NULL OR (length(seeking) <= 128
        AND instr(seeking, x'0A') = 0 AND instr(seeking, x'0D') = 0
        AND instr(seeking, x'E280A8') = 0 AND instr(seeking, x'E280A9') = 0)),

      -- Primary Language: ISO 639-1 language code of the resource.
      -- Constraint: Must be exactly 2 characters (e.g., 'en', 'es') or NULL.
      primary_lang TEXT CHECK (length(primary_lang) = 2 OR primary_lang IS NULL),

      -- Offensiveness Level (ol): Subjective rating of content.
      -- Constraint: Must be one of: 1, 2, or 3.
      -- Note: NULL is implicitly allowed (representing '0' or 'Safe').
      ol INTEGER CHECK (ol IN (1, 2, 3)),

      -- Latitude: Geographic coordinate (WGS 84).
      -- Encoding: Integer = Real Latitude * 10,000,000.
      -- Constraint: Absolute value must be <= 900,000,000 (corresponding to +/- 90.0 degrees).
      latitude INTEGER CHECK (ABS(latitude) <= 900000000),

      -- Longitude: Geographic coordinate (WGS 84).
      -- Encoding: Integer = Real Longitude * 10,000,000.
      -- Constraint: Absolute value must be <= 1,800,000,000 (corresponding to +/- 180.0 degrees).
      longitude INTEGER CHECK (ABS(longitude) <= 1800000000),

      -- Timestamp: Unix Epoch of last update.
      -- Constraint: Must be a positive integer with 10 to 12 digits.
      timestamp INTEGER CHECK (timestamp >= 1000000000 AND timestamp <= 999999999999)
    ) STRICT;
  `);

  // Index on primary_lang for extremely fast global filtering without FTS overhead
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ciprdup_primary_lang ON ciprdup(primary_lang);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      lang_code TEXT PRIMARY KEY,
      lang_name TEXT NOT NULL,
      lang_name_en TEXT NOT NULL
    ) STRICT;
  `);

  seedLanguages(db);

  const ftsExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ciprdup_fts'",
  ).get();

  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE ciprdup_fts USING fts5(
          za,
          title,
          description,
          keywords,
          offering,
          seeking,
          content='ciprdup',
          content_rowid='rowid'
      );
    `);
  }

  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_ai AFTER INSERT ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(rowid, za, title, description, keywords, offering, seeking)
        VALUES (new.rowid, new.za, new.title, new.description, new.keywords, new.offering, new.seeking);
      END;
  `);

  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_ad AFTER DELETE ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(ciprdup_fts, rowid, za, title, description, keywords, offering, seeking)
        VALUES('delete', old.rowid, old.za, old.title, old.description, old.keywords, old.offering, old.seeking);
      END;
  `);

  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_au AFTER UPDATE ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(ciprdup_fts, rowid, za, title, description, keywords, offering, seeking)
        VALUES('delete', old.rowid, old.za, old.title, old.description, old.keywords, old.offering, old.seeking);
        INSERT INTO ciprdup_fts(rowid, za, title, description, keywords, offering, seeking)
        VALUES (new.rowid, new.za, new.title, new.description, new.keywords, new.offering, new.seeking);
      END;
  `);

  msg('[OK] Database schema initialized successfully.');
};
