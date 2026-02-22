const baseUrl = 'http://localhost:8443';

const testEndpoint = async (name, path, method = 'GET', body = null) => {
  try {
    const opts = { method };
    if (body) {
      opts.body = JSON.stringify(body);
      opts.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(`${baseUrl}${path}`, opts);
    console.log(`[${name}] ${method} ${path} -> ${res.status} ${res.statusText}`);
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const _json = await res.json();
      // console.log('Response:', json);
    }
    return res.ok;
  } catch (e) {
    console.error(`[${name}] FAILED:`, e.message);
    return false;
  }
};

const run = async () => {
  // Wait a bit for server to start if running in parallel, but here we run check manually
  console.log('Verifying Dummy API...');

  await testEndpoint('Ciprdup', '/');
  await testEndpoint('Resource', '/example.com/');
  await testEndpoint('Title', '/example.com/title/');
  await testEndpoint('Register', '/guasa.art/', 'PUT', { title: 'Test' });
  await testEndpoint('Delete', '/guasa.art/', 'DELETE');
  // QUERY method might not be supported by standard fetch without custom config in some envs, but Deno supports it.
  await testEndpoint('Query Ciprdup', '/', 'QUERY');
};

run();
