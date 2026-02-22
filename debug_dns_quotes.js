const expectedHash = '8d8f46342fd49c3661e5fc0a33362ab6a7db1781ccfc6dc9a07fc066fe2c91d8';
const storedInCloudflare = `"${expectedHash}"`; // Simulating Cloudflare storage

console.log(`Expected: ${expectedHash}`);
console.log(`Stored (Simulated): ${storedInCloudflare}`);

// Simulating naive retrieval which might keep quotes if not parsed correctly
const retrievedFromDns = storedInCloudflare;

console.log(`Retrieved: ${retrievedFromDns}`);
console.log(`Direct Match? ${retrievedFromDns === expectedHash}`);

// Checking if we need to strip quotes
const stripped = retrievedFromDns.replace(/^"|"$/g, '');
console.log(`Stripped: ${stripped}`);
console.log(`Stripped Match? ${stripped === expectedHash}`);
