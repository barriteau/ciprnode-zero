import { join } from 'node:path';
import * as fs from 'node:fs';

const TARGET_DIRS = ['src'];
const TARGET_FILES = ['main.js'];
const REPORT_FILE = 'logs/console_report.md';

let reportMarkdown = '# Console Method Occurrences\n\nPlease categorize each usage into one of the 4 groups (0: silent, 1: operational, 2: verbose/file-logging, or remove). If you want me to replace it with a specific function (like `msg()` or `line()`), just let me know.\n\n';

const logRegex = /console\.(log|info|warn|error|debug|group|groupEnd)\(/g;

const processFile = (filePath) => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let matchFoundInFile = false;
  let fileContent = '## ' + filePath + '\n\n';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (logRegex.test(line)) {
      matchFoundInFile = true;
      const prevLine = i > 0 ? (i) + ': ' + lines[i - 1] : '';
      const currLine = '**' + (i + 1) + ': ' + line.trim() + '**';
      const nextLine = i < lines.length - 1 ? (i + 2) + ': ' + lines[i + 1] : '';

      fileContent += '### Line ' + (i+1) + '\n' +
          '```javascript\n' +
          (prevLine ? prevLine + '\n' : '') +
          currLine + '\n' +
          (nextLine ? nextLine + '\n' : '') +
          '```\n\n';
    }
  }

  if (matchFoundInFile) {
    reportMarkdown += fileContent;
  }
};

for (const file of TARGET_FILES) {
  processFile(file);
}

for (const dir of TARGET_DIRS) {
  const walk = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      file = join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) { 
        results = results.concat(walk(file));
      } else { 
        results.push(file);
      }
    });
    return results;
  };
  
  const files = walk(dir);
  for (const file of files) {
    processFile(file);
  }
}

fs.writeFileSync(REPORT_FILE, reportMarkdown);
console.log('Report generated at ' + REPORT_FILE);
