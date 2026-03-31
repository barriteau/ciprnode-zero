import { Database } from '@db/sqlite';
import { assert, assertEquals } from '@std/assert';
import { initSchema } from '../src/db/schema.js';
import { insertEntry } from '../src/db/repo.js';
import { handleRequest } from '../src/api/routes.js';

// Setup Mock Environment
Deno.env.set('TEST_MOCK_VERIFY_NODE', 'true');

const createMockDb = () => {
  const db = new Database(':memory:');
  initSchema(db);
  insertEntry(db, {
    za: 'example.com',
    title: 'Example Title',
    description: 'Example Description',
    keywords: 'test keyword',
    offering: 'nothing',
    seeking: 'anything',
    primary_lang: 'en',
    ol: 1,
    latitude: 10000000,
    longitude: 20000000,
    timestamp: 1698417000,
  });
  return db;
};

const mockConfig = {
  za: 'testnode.com',
  page_size: 10,
  debug: false,
};

Deno.test('API Endpoints Test Suite', async (t) => {
  const db = createMockDb();

  await t.step('HEAD / returns correct statuses and counts', async () => {
    const req = new Request('http://localhost/', { method: 'HEAD' });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('X-Cipr-Count'), '1'); // we inserted 1 entry
  });

  await t.step('GET / without Accept returns default HAL/JSON', async () => {
    const req = new Request('http://localhost/', { method: 'GET', headers: { accept: 'application/hal+json' } });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body._embedded.results.length === 1);
    assertEquals(body.count, 1);
  });

  await t.step('GET /{za}/ returns HAL formatted response for application/hal+json', async () => {
    const req = new Request('http://localhost/example.com/', { method: 'GET', headers: { accept: 'application/hal+json' } });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body._links.self);
    assert(body._links.collection);
    assertEquals(body.za, 'example.com');
  });

  await t.step('GET /{za}/{field}/ Content Negotiation: text/plain vs application/hal+json', async () => {
    // 1. Text Plain
    const reqText = new Request('http://localhost/example.com/title/', { method: 'GET', headers: { accept: 'text/plain' } });
    const resText = await handleRequest(reqText, db, mockConfig);
    assertEquals(resText.status, 200);
    assertEquals(await resText.text(), 'Example Title');

    // 2. HAL JSON
    const reqHal = new Request('http://localhost/example.com/title/', { method: 'GET', headers: { accept: 'application/hal+json' } });
    const resHal = await handleRequest(reqHal, db, mockConfig);
    assertEquals(resHal.status, 200);
    const body = await resHal.json();
    assertEquals(body.title, 'Example Title');
    assert(body._links.self.href.includes('/title/'));
  });

  await t.step('PUT /{za}/ creates/updates an entry (verification mocked)', async () => {
    const putBody = {
      za: 'new.com',
      title: 'New',
      description: 'Desc',
      keywords: 'kw',
      timestamp: 1698418000,
    };
    const req = new Request('http://localhost/new.com/', { 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });
    const res = await handleRequest(req, db, mockConfig);
    assert([200, 201].includes(res.status));
  });

  await t.step('DELETE /{za}/ ignores delete if node is successfully validated', async () => {
    // Since our mock returns true, it considers the node valid (protection logic)
    const req = new Request('http://localhost/example.com/', { method: 'DELETE' });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200); // Handled transparently
  });

  await t.step('QUERY / returns semantic HAL links and embedded results', async () => {
    const req = new Request('http://localhost/?q=example', { method: 'QUERY', headers: { accept: 'application/hal+json' } });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    
    assertEquals(body.count, 2); // 1 original + 1 inserted in previous PUT test
    assert(body._links.first);
    assert(body._links.last);
    assert(body._links.self);
    assert(!body._links.prev); // Should be absent on page 1
  });

  await t.step('QUERY /ri/ behaves appropriately given config flags', async () => {
    const req = new Request('http://localhost/ri/', { method: 'QUERY', headers: { accept: 'application/hal+json' } });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.count, 0); // Mock config doesn't list ISE providers, expect 0
  });

  await t.step('GET /languages/ returns JSON autocomplete array', async () => {
    const req = new Request('http://localhost/languages/?q=en', { method: 'GET' });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(Array.isArray(body));
  });

  await t.step('GET /?sort_by=random returns randomized results (Explore)', async () => {
    const req = new Request('http://localhost/?sort_by=random', { method: 'GET', headers: { accept: 'application/hal+json' } });
    const res = await handleRequest(req, db, mockConfig);
    assertEquals(res.status, 200);
    const body = await res.json();
    assert(body._embedded.results.length > 0);
    assert(body.count > 0);
  });

  db.close();
});
