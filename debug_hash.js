import { parse } from '@std/toml';
import { generateCiprHash } from './src/core/utils.js';
import * as path from '@std/path';

const configName = Deno.args[0];
if (!configName) {
  console.error("Please provide a site name, e.g. 'deno run -A debug_hash.js cipr.info'");
  Deno.exit(1);
}

const configPath = path.resolve(Deno.cwd(), '..', 'ciprnodes', configName, 'ciprnode.toml');

console.log(`Loading TOML config from: ${configPath}`);
let tomlConfig;
try {
  const fileContent = Deno.readTextFileSync(configPath);
  tomlConfig = parse(fileContent);
} catch (e) {
  console.error(`Failed to read/parse TOML config: ${e.message}`);
  Deno.exit(1);
}

// Convert missing values to ensure type matching
const entry = tomlConfig.cipr_entry || {};

const config = {
  za: entry.za,
  title: entry.title || '',
  description: entry.description || '',
  keywords: entry.keywords || '',
  ol: entry.ol || 0,
  latitude: entry.latitude || 0,
  longitude: entry.longitude || 0,
  primary_lang: entry.primary_lang || '',
};

console.log(`Testing Hash Generation for ${config.za}...`);
const hash = await generateCiprHash(
  config.za,
  config.title,
  config.description,
  config.keywords,
  config.ol,
  config.latitude,
  config.longitude,
  config.primary_lang,
);
console.log(`Generated Hash: ${hash}`);
