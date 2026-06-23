import { Database } from 'jsr:@db/sqlite@^0.12.0';
import { resolve } from 'jsr:@std/path@^1.0.8';
import { existsSync } from 'jsr:@std/fs@^1.0.6';

const RAW_CODE_STRING =
  'ab;Abkhazian|aa;Afar|af;Afrikaans|ak;Akan|sq;Albanian|am;Amharic|ar;Arabic|an;Aragonese|hy;Armenian|as;Assamese|av;Avaric|ae;Avestan|ay;Aymara|az;Azerbaijani|bm;Bambara|ba;Bashkir|eu;Basque|be;Belarusian|bn;Bengali|bh;Bihari languages|bi;Bislama|bs;Bosnian|br;Breton|bg;Bulgarian|my;Burmese|ca;Catalan|ch;Chamorro|ce;Chechen|ny;Chichewa|zh;Chinese|cv;Chuvash|kw;Cornish|co;Corsican|cr;Cree|hr;Croatian|cs;Czech|da;Danish|dv;Divehi|nl;Dutch|dz;Dzongkha|en;English|eo;Esperanto|et;Estonian|ee;Ewe|fo;Faroese|fj;Fijian|fi;Finnish|fr;French|ff;Fulah|gl;Galician|ka;Georgian|de;German|el;Greek|gn;Guarani|gu;Gujarati|ht;Haitian|ha;Hausa|he;Hebrew|hz;Herero|hi;Hindi|ho;Hiri Motu|hu;Hungarian|ia;Interlingua|id;Indonesian|ie;Interlingue|ga;Irish|ig;Igbo|ik;Inupiaq|io;Ido|is;Icelandic|it;Italian|iu;Inuktitut|ja;Japanese|jv;Javanese|kl;Kalaallisut|kn;Kannada|kr;Kanuri|ks;Kashmiri|kk;Kazakh|km;Central Khmer|ki;Kikuyu|rw;Kinyarwanda|ky;Kirghiz|kv;Komi|kg;Kongo|ko;Korean|kj;Kuanyama|ku;Kurdish|lo;Lao|la;Latin|lv;Latvian|li;Limburgan|ln;Lingala|lt;Lithuanian|lu;Luba-Katanga|lb;Luxembourgish|mk;Macedonian|mg;Malagasy|ms;Malay|ml;Malayalam|mt;Maltese|gv;Manx|mi;Maori|mr;Marathi|mh;Marshallese|mn;Mongolian|na;Nauru|nv;Navajo|nd;North Ndebele|nr;South Ndebele|ng;Ndonga|ne;Nepali|no;Norwegian|nb;Norwegian Bokmål|nn;Norwegian Nynorsk|ii;Sichuan Yi|oc;Occitan|oj;Ojibwa|cu;Church Slavic|or;Oriya|om;Oromo|os;Ossetian|pa;Punjabi|pi;Pali|fa;Persian|pl;Polish|ps;Pashto|pt;Portuguese|qu;Quechua|rm;Romansh|rn;Rundi|ro;Romanian|ru;Russian|sa;Sanskrit|sc;Sardinian|sd;Sindhi|se;Northern Sami|sm;Samoan|sg;Sango|sr;Serbian|gd;Gaelic|sn;Shona|si;Sinhala|sk;Slovak|sl;Slovenian|so;Somali|st;Southern Sotho|es;Spanish|su;Sundanese|sw;Swahili|ss;Swati|sv;Swedish|ta;Tamil|te;Telugu|tg;Tajik|th;Thai|ti;Tigrinya|bo;Tibetan|tk;Turkmen|tl;Tagalog|tn;Tswana|to;Tonga (Tonga Islands)|tr;Turkish|ts;Tsonga|tt;Tatar|tw;Twi|ty;Tahitian|ug;Uighur|uk;Ukrainian|ur;Urdu|uz;Uzbek|ve;Venda|vi;Vietnamese|vo;Volapük|wa;Walloon|cy;Welsh|wo;Wolof|fy;Western Frisian|xh;Xhosa|yi;Yiddish|yo;Yoruba|za;Zhuang|zu;Zulu';

const jsonPath = resolve(Deno.cwd(), 'src', 'db', 'languages.json');
let existingLangs = [];
try {
  existingLangs = JSON.parse(Deno.readTextFileSync(jsonPath));
} catch { /* file doesn't exist yet - start fresh */ }

const existingDict = {};
existingLangs.forEach((l) => existingDict[l.lang_code] = l.lang_name);

const langs = RAW_CODE_STRING.split('|').map((item) => {
  const [code, name] = item.split(';');
  const fallback = existingDict[code] || name;
  return { lang_code: code, lang_name: fallback, lang_name_en: name };
});

Deno.writeTextFileSync(jsonPath, JSON.stringify(langs, null, 2));
console.log(`Updated languages.json with 184 ISO 639-1 languages.`);

// 2. Database Recreation Routine
const DB_PATH = resolve(Deno.cwd(), 'data', 'ciprdup.db');
const BACKUP_PATH = resolve(Deno.cwd(), 'data', `ciprdup_backup_${Date.now()}.db`);

if (!existsSync(DB_PATH)) {
  console.log('No existing database to migrate.');
  Deno.exit(0);
}

console.log(`Backing up current DB to ${BACKUP_PATH}...`);
Deno.copyFileSync(DB_PATH, BACKUP_PATH);

// 3. To avoid file lock issues on Windows, we'll create the schema on a new temporary file first by manipulating the script.
const NEW_DB_PATH = resolve(Deno.cwd(), 'data', 'ciprdup_new.db');
if (existsSync(NEW_DB_PATH)) Deno.removeSync(NEW_DB_PATH);

console.log('Running create_ciprdup_db.js on the new database path...');
const createScript = Deno.readTextFileSync('scripts/core/create_ciprdup_db.js');
const modifiedScript = createScript.replace("'ciprdup.db'", "'ciprdup_new.db'");
Deno.writeTextFileSync('scripts/core/create_ciprdup_db_temp.js', modifiedScript);

const cmd = new Deno.Command(Deno.execPath(), {
  args: ['run', '-A', 'scripts/core/create_ciprdup_db_temp.js'],
});
const output = await cmd.output();
Deno.removeSync('scripts/core/create_ciprdup_db_temp.js');

if (!output.success) {
  console.error('Failed to recreate schema', new TextDecoder().decode(output.stderr));
  Deno.exit(1);
}

const db = new Database(NEW_DB_PATH);
db.exec(`ATTACH DATABASE '${DB_PATH}' AS old_db;`);

console.log('Migrating data to new structure...');
db.exec('BEGIN TRANSACTION;');
db.exec(`
  INSERT INTO ciprdup (za, title, description, keywords, ol, latitude, longitude, timestamp)
  SELECT za, title, description, keywords, ol, latitude, longitude, timestamp FROM old_db.ciprdup;
`);
db.exec('COMMIT TRANSACTION;');

console.log('Assigning random languages to all entries...');
const allCodes = langs.map((l) => l.lang_code);
const rows = db.prepare('SELECT rowid FROM ciprdup').all();
const updateStmt = db.prepare('UPDATE ciprdup SET primary_lang = ? WHERE rowid = ?');

db.exec('BEGIN TRANSACTION;');
let count = 0;
for (const row of rows) {
  const randomLang = allCodes[Math.floor(Math.random() * allCodes.length)];
  updateStmt.run(randomLang, row.rowid);
  count++;
}
db.exec('COMMIT TRANSACTION;');

db.exec('DETACH DATABASE old_db;');
db.close();

console.log(`Migration Complete. Randomized ${count} entries!`);
console.log(`\n======================================================`);
console.log(` SUCCESS: Database recreated and populated!`);
console.log(`======================================================`);
console.log(`Due to an active file lock on Windows, the new database`);
console.log(`has been saved as data/ciprdup_new.db.`);
console.log(`Please close your VS Code SQLite viewer or any Deno`);
console.log(`servers, then manually rename ciprdup_new.db to ciprdup.db.`);
console.log(`======================================================\n`);
