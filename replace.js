const files = [
  'src/core/sync.js',
  'src/api/server.js',
  'src/api/handlers/query.js',
  'src/api/handlers/resource.js',
  'src/core/config.js',
  'src/core/dns.js',
  'src/core/validator.js',
  'src/db/client.js',
  'src/db/schema.js',
  'src/api/views/i18n.js'
];

for (const file of files) {
  let content = await Deno.readTextFile(file);
  let original = content;

  // Make sure we have the import
  if (!content.includes("import { msg }")) {
    if (file.includes('schema') || file.includes('client')) {
      content = "import { msg } from '../core/utils.js';\n" + content;
    } else if (file.includes('i18n')) {
      content = "import { msg } from '../../core/utils.js';\n" + content;
    } else if (file.includes('query') || file.includes('resource') || file.includes('server')) {
      // server already has it
      if (file !== 'src/api/server.js') {
        content = "import { msg } from '../../core/utils.js';\n" + content;
      }
    } else if (file.includes('config') || file.includes('dns') || file.includes('validator')) {
      content = "import { msg } from './utils.js';\n" + content;
    }
  }

  // Multi-line replacement using non-greedy match to capture arguments inside parens
  // Exclude lines with // console.log
  content = content.replace(/^(?!\s*\/\/)\s*console\.log\(([\s\S]*?)\);/gm, (match, p1) => {
    return match.replace(/console\.log\(/, 'msg(');
  });
  
  content = content.replace(/^(?!\s*\/\/)\s*console\.warn\(([\s\S]*?)\);/gm, (match, p1) => {
    return match.replace(/console\.warn\(/, 'msg(').replace(/\);$/, ", 'WA');");
  });
  
  content = content.replace(/^(?!\s*\/\/)\s*console\.error\(([\s\S]*?)\);/gm, (match, p1) => {
    return match.replace(/console\.error\(/, 'msg(').replace(/\);$/, ", 'KO');");
  });

  // Also catch simple inline ones (e.g., if (config.debug) console.log(...);)
  content = content.replace(/(if\s*\([^)]+\)\s*)console\.log\(([\s\S]*?)\);/g, (match, prefix, p1) => {
    return `${prefix}msg(${p1});`;
  });
  
  content = content.replace(/(if\s*\([^)]+\)\s*)console\.warn\(([\s\S]*?)\);/g, (match, prefix, p1) => {
    return `${prefix}msg(${p1}, 'WA');`;
  });

  if (content !== original) {
    await Deno.writeTextFile(file, content);
    console.log(`Updated ${file}`);
  }
}
