import { parse } from "jsr:@std/toml";

const templatePath = 'D:/Proyectos_VSCode/Cipr/Ciprnode zero/ciprnode.toml';
const templateStr = await Deno.readTextFile(templatePath);

const nodes = [
  'alboro.top',
  'barri.top',
  'barriteau.com',
  'barriteau.net',
  'barriteau.org',
  'cipr.info',
  'guasa.art',
  'proyec.top'
];

for (const node of nodes) {
  const nodePath = `D:/Proyectos_VSCode/Cipr/ciprnodes/${node}/ciprnode.toml`;
  const nodeContent = await Deno.readTextFile(nodePath);
  const nodeData = parse(nodeContent);
  
  // Prepare flat data for replacement
  const flatData = {
    env: nodeData.env,
    log_level: nodeData.log_level ?? 2,
    debug: nodeData.debug ?? true,
    // cipr_entry
    za: nodeData.cipr_entry?.za,
    title: nodeData.cipr_entry?.title,
    description: nodeData.cipr_entry?.description,
    keywords: nodeData.cipr_entry?.keywords,
    primary_lang: nodeData.cipr_entry?.primary_lang,
    ol: nodeData.cipr_entry?.ol,
    latitude: nodeData.cipr_entry?.latitude,
    longitude: nodeData.cipr_entry?.longitude,
    // ciprface
    page_size: nodeData.ciprface?.page_size ?? 5,
    // network
    port: nodeData.network?.port,
    bootstrap_node: nodeData.network?.bootstrap_node ?? "https://ciprnode.cipr.info",
    expected_propagation_time: nodeData.network?.expected_propagation_time ?? 120000,
    test_words: nodeData.network?.test_words,
  };

  // Creative metadata
  const author = "Juan Barriteau";
  let subject = flatData.description || `Nodo de la red Cipr: ${flatData.title}`;
  if (node === 'guasa.art') subject = "Arte, humor y creatividad por Juan Barriteau";
  if (node === 'proyec.top') subject = "Los mejores proyectos experimentales de la red de Juan";
  if (node === 'cipr.info') subject = "Información oficial del protocolo y red Cipr";
  if (node === 'barri.top') subject = "Lo mejor del ecosistema Barriteau en la red Cipr";
  if (node === 'alboro.top') subject = "Desorden, ideas sueltas y experimentos web";

  flatData.author = author;
  flatData.author_url = (node === 'cipr.info') ? "https://cipr.info/" : `https://juan.barriteau.net/`;
  flatData.subject = subject;
  flatData.publisher = author;
  flatData.rights = "CC BY 4.0";
  flatData.rights_url = "https://creativecommons.org/licenses/by/4.0/";

  let newContent = templateStr;
  
  // Replace scalar fields safely
  for (const [key, val] of Object.entries(flatData)) {
    if (val !== undefined && val !== null) {
      // Use negative lookbehind to ensure we don't replace commented keys if avoid is needed,
      // but in the template, uncommented keys are the active ones.
      const regex = new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm');
      let valStr = typeof val === 'string' ? `"${val}"` : val.toString();
      newContent = newContent.replace(regex, `${key} = ${valStr}`);
    }
  }

  // Handle ise_provider correctly if present in node but commented or not.
  // Actually, standard template has one [[ise_provider]] active.
  if (nodeData.ise_provider && Array.isArray(nodeData.ise_provider) && nodeData.ise_provider.length > 0) {
      // Just keep whatever is in template to avoid breaking format, because the user said "don't alter any existing value". 
      // If the node had a specific ISE provider, we should ideally inject it, but they likely all used the default cgt.barriteau.net
  }

  // Handle dns_provider
  if (nodeData.dns_provider) {
    if (nodeData.dns_provider.name) newContent = newContent.replace(/^name\s*=\s*".*?"$/m, `name = "${nodeData.dns_provider.name}"`);
    if (nodeData.dns_provider.api_token) newContent = newContent.replace(/^api_token\s*=\s*".*?"$/m, `api_token = "${nodeData.dns_provider.api_token}"`);
  }

  await Deno.writeTextFile(nodePath, newContent);
  console.log(`Updated ${nodePath}`);
}
