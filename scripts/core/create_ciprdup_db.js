import { Database } from 'jsr:@db/sqlite@^0.12.0';
import { dirname, resolve } from 'jsr:@std/path@^1.0.8';
import { ensureDirSync } from 'jsr:@std/fs@^1.0.6';

const DB_PATH = resolve(Deno.cwd(), 'data', 'ciprdup.db');

// Ensure data directory exists
ensureDirSync(dirname(DB_PATH));

console.log(`Creating/Opening database at: ${DB_PATH}`);
const db = new Database(DB_PATH);

try {
  // ---------------------------------------------------------
  // 1. Performance Configuration (Pragmas)
  // ---------------------------------------------------------
  console.log('Applying High-Performance PRAGMAs...');

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

  // ---------------------------------------------------------
  // 2. Main Table Creation with Constraints
  // ---------------------------------------------------------
  console.log("Creating Main Table 'ciprdup'...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ciprdup (
      -- Zone Apex: The unique identifier for the resource.
      -- Constraint: Must be a string (TEXT).
      -- Constraint: Max length 255 characters (DNS limit).
      -- Constraint: Must contain at least one dot ('.') to simulate basic domain structure.
      za TEXT PRIMARY KEY CHECK (length(za) <= 255 AND za LIKE '%.%'),

      -- Title: The resource title.
      -- Constraint: Max length 64 characters.
      -- Constraint: Must NOT contain Newline (LF) or Carriage Return (CR) characters.
      title TEXT CHECK (length(title) <= 64 AND instr(title, x'0A') = 0 AND instr(title, x'0D') = 0),

      -- Description: A brief explanation of the resource.
      -- Constraint: Max length 256 characters.
      -- Constraint: Must NOT contain Newline (LF) or Carriage Return (CR) characters.
      description TEXT CHECK (length(description) <= 256 AND instr(description, x'0A') = 0 AND instr(description, x'0D') = 0),

      -- Keywords: Space-separated tags.
      -- Constraint: Max length 512 characters.
      -- Constraint: Must NOT contain Newline (LF) or Carriage Return (CR) characters.
      keywords TEXT CHECK (length(keywords) <= 512 AND instr(keywords, x'0A') = 0 AND instr(keywords, x'0D') = 0),

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
      -- Constraint: Must be a positive integer (greater than 0).
      timestamp INTEGER CHECK (timestamp > 0),

      -- Table Level Constraint: Coordinate Consistency
      -- Both latitude and longitude must be NULL, or both must be NOT NULL.
      CONSTRAINT check_coordinates_paired CHECK ((latitude IS NULL) == (longitude IS NULL))
    ) STRICT;
  `);

  // Index on primary_lang for extremely fast global filtering without FTS overhead
  console.log("Creating index on 'primary_lang'...");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ciprdup_primary_lang ON ciprdup(primary_lang);`);

  console.log("Creating 'languages' lookup table...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      lang_code TEXT PRIMARY KEY,
      lang_name TEXT NOT NULL,
      lang_name_en TEXT NOT NULL
    ) STRICT;
  `);

  console.log("Seeding 'languages' table...");
  const langsJson = JSON.parse(
    Deno.readTextFileSync(
      resolve(dirname(new URL('', import.meta.url).pathname), '../../src/db/languages.json'),
    ),
  );
  const insertLang = db.prepare(
    'INSERT OR IGNORE INTO languages (lang_code, lang_name, lang_name_en) VALUES (?, ?, ?)',
  );

  db.exec('BEGIN TRANSACTION;');
  langsJson.forEach((lang) => {
    insertLang.run(lang.lang_code, lang.lang_name, lang.lang_name_en);
  });
  db.exec('COMMIT TRANSACTION;');

  // ---------------------------------------------------------
  // 3. FTS5 Virtual Table (External Content)
  // ---------------------------------------------------------
  console.log("Creating FTS5 Virtual Table 'ciprdup_fts' (External Content)...");

  // We check if the FTS table exists to avoid errors on re-run
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
          content='ciprdup',  -- External content source is the main table
          content_rowid='rowid' -- Link via standard internal rowid
      );
    `);
  } else {
    console.log('  - FTS Table already exists provided.');
  }

  // ---------------------------------------------------------
  // 4. Triggers to Keep FTS Sync (External Content Requirement)
  // ---------------------------------------------------------
  console.log('Setting up Triggers for FTS Synchronization...');

  // Trigger: After Insert
  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_ai AFTER INSERT ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(rowid, za, title, description, keywords)
        VALUES (new.rowid, new.za, new.title, new.description, new.keywords);
      END;
  `);

  // Trigger: After Delete
  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_ad AFTER DELETE ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(ciprdup_fts, rowid, za, title, description, keywords)
        VALUES('delete', old.rowid, old.za, old.title, old.description, old.keywords);
      END;
  `);

  // Trigger: After Update
  db.exec(`
      CREATE TRIGGER IF NOT EXISTS ciprdup_au AFTER UPDATE ON ciprdup BEGIN
        INSERT INTO ciprdup_fts(ciprdup_fts, rowid, za, title, description, keywords)
        VALUES('delete', old.rowid, old.za, old.title, old.description, old.keywords);
        INSERT INTO ciprdup_fts(rowid, za, title, description, keywords)
        VALUES (new.rowid, new.za, new.title, new.description, new.keywords);
      END;
  `);

  console.log('Database initialized successfully!');

  // ---------------------------------------------------------
  // 5. Validation (Optional/Verify)
  // ---------------------------------------------------------
  // Uncomment to run a quick self-test
  /*
  console.log("Running basic validation...");
  try {
    // Valid Insert
    db.exec(`INSERT INTO ciprdup (za, title, description, keywords, timestamp) VALUES ('test.com', 'Test Title', 'Desc', 'kw', 123456789)`);
    console.log("  - Valid insert: OK");

    // Check Search
    const res = db.prepare("SELECT * FROM ciprdup_fts WHERE ciprdup_fts MATCH 'test'").all();
    if (res.length > 0) console.log("  - FTS Search: OK");
    else console.error("  - FTS Search: FAILED");

    // Invalid Insert (Constraint Check)
    try {
       db.exec(`INSERT INTO ciprdup (za, title, timestamp) VALUES ('bad', 'Title\nBad', 1)`); // Newline in title
       console.error("  - Constraint Check: FAILED (Should have thrown error)");
    } catch(e) {
       console.log("  - Constraint Check: OK (Caught expected invalid input)");
    }

    // Cleanup
    db.exec("DELETE FROM ciprdup WHERE za='test.com'");

  } catch (e) {
    console.error("Validation Error:", e);
  }
  */
} catch (err) {
  console.error('Critical Error during DB initialization:', err);
  Deno.exit(1);
} finally {
  db.close();
}
