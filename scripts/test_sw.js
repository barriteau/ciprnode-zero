const testSW = async () => {
  try {
    const res = await fetch('https://localhost:8443/sw.js', {
      headers: { 'Accept': '*/*' },
      // Bypass cert check for local testing
      client: Deno.createHttpClient({ caCerts: [], dangerouslyIgnoreUnauthorized: true }),
    });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Cache-Control:', res.headers.get('cache-control'));
    console.log('Body length:', (await res.text()).length);
  } catch (e) {
    console.error(e);
  }
};
testSW();
