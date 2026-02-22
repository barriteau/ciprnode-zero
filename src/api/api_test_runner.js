/**
 * @file src/api/api_test_runner.js
 * @description Integration tests for CiprAPI using in-memory DB.
 */

import { Database } from '@db/sqlite';
import { handleRequest } from './routes.js';
import { initSchema } from '../db/schema.js';
import { insertEntry } from '../db/repo.js';

// Mock Config
const config = {
  port: 8080,
  debug: true,
  bootstrapNodes: [],
  dohServers: [],
  dohTimeout: 2000,
  cloudflare: { enabled: false },
};

const runTests = async () => {
  console.log('--- Starting CiprAPI Integration Tests ---');

  // 1. Setup DB
  const db = new Database(':memory:');
  initSchema(db);

  // 2. Populate Data
  insertEntry(db, {
    za: 'example.com',
    title: 'Example Domain',
    description: 'This is an example entry.',
    keywords: 'example test',
    ol: null,
    latitude: null,
    longitude: null,
    timestamp: Math.floor(Date.now() / 1000),
  });
  console.log('[OK] DB Initialized & Populated');

  // 3. Define Test Cases
  const tests = [
    {
      name: 'GET / (HAL)',
      req: new Request('http://localhost:8080/', {
        headers: { 'Accept': 'application/hal+json' },
      }),
      check: async (res) => {
        const body = await res.json();
        const items = body._embedded?.item || body._embedded?.results || [];
        return res.status === 200 && items.length > 0;
      },
    },
    {
      name: 'GET / (HTML)',
      req: new Request('http://localhost:8080/', {
        headers: { 'Accept': 'text/html' },
      }),
      check: async (res) => {
        const text = await res.text();
        return res.status === 200 && text.includes('<!DOCTYPE html>');
      },
    },
    {
      name: 'GET /example.com/ (HAL)',
      req: new Request('http://localhost:8080/example.com/', {
        headers: { 'Accept': 'application/hal+json' },
      }),
      check: async (res) => {
        const body = await res.json();
        return res.status === 200 &&
          body.za === 'example.com' &&
          body._links.self.href === '/example.com/';
      },
    },
    {
      name: 'GET /nonexistent.com/ (404)',
      req: new Request('http://localhost:8080/nonexistent.com/', {
        headers: { 'Accept': 'application/json' },
      }),
      check: (res) => res.status === 404,
    },
    {
      name: 'QUERY (Search)',
      req: new Request('http://localhost:8080/', {
        method: 'QUERY',
        headers: { 'Content-Type': 'text/plain', 'Accept': 'application/hal+json' },
        body: 'example',
      }),
      check: async (res) => {
        const body = await res.json();
        const items = body._embedded?.item || body._embedded?.results || [];
        return res.status === 200 && items.some((i) => i.za === 'example.com');
      },
    },
  ];

  // 4. Run Tests
  let passed = 0;
  for (const test of tests) {
    try {
      const res = await handleRequest(test.req, db, config);
      if (!res) {
        console.error(`[FAIL] ${test.name}: No Response (Router returned null)`);
        continue;
      }
      const success = await test.check(res);
      if (success) {
        console.log(`[PASS] ${test.name}`);
        passed++;
      } else {
        console.error(`[FAIL] ${test.name}: Check Failed`);
      }
    } catch (e) {
      console.error(`[FAIL] ${test.name}: Exception`, e);
    }
  }

  console.log(`--- Tests Complete: ${passed}/${tests.length} Passed ---`);
  if (passed === tests.length) Deno.exit(0);
  else Deno.exit(1);
};

runTests();
