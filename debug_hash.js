import { generateCiprHash } from './src/core/utils.js';

const config = {
  za: 'alboro.top',
  title: 'Alboro Top Node',
  description: 'Primary node for alboro.top',
  keywords: 'alboro top node cipr',
  ol: 0,
  latitude: 104806000,
  longitude: -669036000,
};

console.log('Testing Hash Generation for alboro.top...');
const hash = await generateCiprHash(
  config.za,
  config.title,
  config.description,
  config.keywords,
  config.ol,
  config.latitude,
  config.longitude,
);
console.log(`Generated Hash: ${hash}`);
