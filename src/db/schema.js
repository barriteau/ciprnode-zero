/**
 * @file src/db/schema.js
 * @description Database schema definitions and initialization.
 */

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
    // Schema already exists, skipping
    return;
  }

  console.log(`Initializing Database Schema...`);

  // 1. Main Table Creation with Constraints
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
      timestamp INTEGER CHECK (timestamp > 0)
    ) STRICT;
  `);

  // 2. FTS5 Virtual Table (External Content)
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
  }

  // 3. Triggers to Keep FTS Sync (External Content Requirement)
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

  console.log(`[OK] Database schema initialized successfully.`);
};
