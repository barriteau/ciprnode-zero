/**
 * @file tests/repro_ciprface.js
 * @description Verifies Ciprface HTML generation (Form, Assets, Map Data).
 */

import { Database } from 'jsr:@db/sqlite';
import { query } from '../src/api/controllers/search.js';
import { insertEntry } from '../src/db/repo.js';

// Mock Config
const config = { za: 'test.com', debug: true };

// Mock DB
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS ciprdup (
    za TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    keywords TEXT,
    ol INTEGER,
    latitude REAL,
    longitude REAL,
    timestamp INTEGER
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS ciprdup_fts USING fts5(
    za, title, description, keywords,
    content='ciprdup',
    content_rowid='rowid'
  );
  -- Triggers to keep FTS in sync
  CREATE TRIGGER ciprdup_ai AFTER INSERT ON ciprdup BEGIN
    INSERT INTO ciprdup_fts(rowid, za, title, description, keywords) VALUES (new.rowid, new.za, new.title, new.description, new.keywords);
  END;
`);

// Populate Data
insertEntry(db, {
  za: 'geo.com',
  title: 'Geo Entry',
  description: 'With coordinates',
  keywords: 'map',
  ol: 1,
  latitude: 40.7,
  longitude: -74.0,
  timestamp: 1000,
});

async function runTest(name, req, validator) {
  console.log(`\nRunning: ${name}`);
  try {
    const res = await query(req, db, config, null);
    console.log(`Status: ${res.status}`);
    const text = await res.text();

    if (validator(text)) {
      console.log('PASSED');
    } else {
      console.error('FAILED: Validator returned false.');
      console.log('Response excerpt:', text.substring(0, 500));
    }
  } catch (e) {
    console.error('ERROR:', e);
  }
}

function createRequest(url, headers = {}) {
  return new Request(url, { headers });
}

// Tests
(async () => {
  // 1. Home Page (GET /)
  // Should have Leaflet, CSS, App.js, Search Form, and Map Container
  await runTest(
    '1. Home Page Assets & Form',
    createRequest('http://localhost/', { 'Accept': 'text/html' }),
    (html) => {
      const hasLeaflet = html.includes('leaflet.css') && html.includes('leaflet.js');
      const hasCustomAssets = html.includes('/css/style.css') && html.includes('/js/app.js');
      const hasForm = html.includes('<form action="/" method="GET"');
      const hasMapContainer = html.includes('id="map-container"');

      if (!hasLeaflet) console.log('Missing Leaflet');
      if (!hasCustomAssets) console.log('Missing Custom Assets');
      if (!hasForm) console.log('Missing Form');
      if (!hasMapContainer) console.log('Missing Map Container');

      return hasLeaflet && hasCustomAssets && hasForm && hasMapContainer;
    },
  );

  // 2. Search Results Injection
  // Should contain window.CIPR_RESULTS with geo data
  await runTest(
    '2. Map Data Injection',
    createRequest('http://localhost/?q=geo', { 'Accept': 'text/html' }),
    (html) => {
      // Check for script injection
      const hasScript = html.includes('window.CIPR_RESULTS = [');
      const hasGeoData = html.includes('"latitude":40.7');
      return hasScript && hasGeoData;
    },
  );

  // 3. Advanced Form Fields
  await runTest(
    '3. Advanced Fields Rendered',
    createRequest('http://localhost/', { 'Accept': 'text/html' }),
    (html) => {
      const hasOl = html.includes('name="ol"');
      const hasLat = html.includes('name="geo_latitude"');
      const hasUseMyLoc = html.includes('id="use-my-location"');
      return hasOl && hasLat && hasUseMyLoc;
    },
  );
})();
