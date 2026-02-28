const checkNode = async (url) => {
  try {
    const res = await fetch(url + '/sw.js', { headers: { 'Accept': '*/*' } });
    console.log(`--- Testing ${url}/sw.js ---`);
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Cache-Control:', res.headers.get('cache-control'));
    console.log('Service-Worker-Allowed:', res.headers.get('service-worker-allowed'));
  } catch (e) {
    console.error(`Failed ${url}:`, e.message);
  }
};

await checkNode('https://proyec.top');
await checkNode('https://cipr.info');
