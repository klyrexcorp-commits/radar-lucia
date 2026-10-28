// Busca la web de cada empresa de docs/offers.json y extrae emails de contacto general
// (info@, rrhh@, empleo@...) de su propia web. Los emails con nombre de persona se descartan.
//   APIFY_TOKEN=... node scripts/enrich-contacts.mjs --max 60
//   node scripts/enrich-contacts.mjs --fixtures <carpeta>   (prueba sin red)
// RADAR_DOCS=<carpeta> cambia la carpeta donde se leen y escriben los JSON (para pruebas).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { companyKey, applyCompanies } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = process.env.RADAR_DOCS || path.join(root, 'docs');
const OFFERS = path.join(docs, 'offers.json');
const COMPANIES = path.join(docs, 'companies.json');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const MAX = Math.max(1, Math.min(200, Number(argVal('--max')) || 60));
const fixtures = argVal('--fixtures');
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN && !fixtures) { console.error('Falta la variable APIFY_TOKEN.'); process.exit(1); }

const DAY = 86400_000;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------- búsqueda de la web (Apify: Google Search Scraper) ----------
async function searchWebs(queries) {
  if (fixtures) return JSON.parse(await readFile(path.join(fixtures, 'search.json'), 'utf8'));
  const items = [];
  for (let i = 0; i < queries.length; i += 40) {
    const res = await fetch('https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?format=json&clean=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ queries: queries.slice(i, i + 40).join('\n'), maxPagesPerQuery: 1, countryCode: 'es', languageCode: 'es' }),
      signal: AbortSignal.timeout(290_000),
    });
    if (!res.ok) throw new Error(`google-search-scraper: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    items.push(...(await res.json()));
  }
  return items;
}

// Portales, directorios y prensa: nunca son la web de la empresa
const BLOCK = /(^|\.)(linkedin|infojobs|indeed|glassdoor|facebook|instagram|twitter|x|youtube|tiktok|pinterest|wikipedia|einforma|empresite|paginasamarillas|axesor|informa|cylex|kompass|expansion|google|tripadvisor|yelp|borme|iberinform|infoempresa|datoscif|cif|opencorporates|crunchbase|jooble|tecnoempleo|computrabajo|infoempleo|opcionempleo|jobtoday|bumeran|randstad|adecco|manpower|michaelpage|hays|elpais|elmundo|abc|europapress|lavanguardia|cincodias|eleconomista|medium)\.[a-z.]+$/i;

function pickWebsite(empresa, results) {
  const key = companyKey(empresa);
  const first = key.split(' ').filter((t) => t.length >= 3)[0];
  for (const r of (results ?? []).slice(0, 5)) {
    let u; try { u = new URL(r.url); } catch { continue; }
    const host = u.hostname.replace(/^www\./, '');
    if (BLOCK.test(host)) continue;
    const flat = host.replace(/[^a-z0-9]/g, '');
    const title = companyKey(r.title);
    if ((first && flat.includes(first)) || (key && title.includes(key))) return u.origin;
  }
  return '';
}

// ---------- lectura de la web de la empresa ----------
const PAGES = ['/', '/contacto', '/contact', '/aviso-legal', '/politica-de-privacidad', '/trabaja-con-nosotros'];

async function getPage(url) {
  if (fixtures) {
    const pages = JSON.parse(await readFile(path.join(fixtures, 'pages.json'), 'utf8'));
    return pages[url] ?? null;
  }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RadarLucia/1.0 (busqueda de empleo; lee emails de contacto publicos)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/html')) return null;
    return (await res.text()).slice(0, 500_000);
  } catch { return null; }
}

async function robotsAllows(origin) {
  const txt = await getPage(`${origin}/robots.txt`).catch(() => null);
  if (!txt || /<html/i.test(txt)) return true;
  let all = false;
  for (const line of txt.split(/\r?\n/)) {
    const l = line.trim();
    if (/^user-agent:/i.test(l)) all = /:\s*\*\s*$/.test(l);
    else if (all && /^disallow:\s*\/\s*$/i.test(l)) return false;
  }
  return true;
}

// Solo direcciones de buzón general; los emails con nombre de persona no se guardan
const ROLE = /^(info|informacion|contact|contacto|hola|hello|hi|rrhh|hr|empleo|jobs?|careers?|talento|talent|seleccion|recursos|people|administracion|admin|comunicacion|marketing|prensa|press|oficina|recepcion|secretaria|general|cv|reclutamiento|recruit(ing|ment)?|trabaja)([._-].*)?$/i;
const PREFERRED = /^(rrhh|hr|empleo|jobs?|careers?|talento|talent|seleccion|recursos|people|cv|recruit|reclut|trabaja)/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

function emailsFrom(html, host) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const found = new Set();
  for (const m of text.matchAll(/mailto:([^"'?>\s]+)/gi)) { try { found.add(decodeURIComponent(m[1]).toLowerCase()); } catch { /* ignorar */ } }
  for (const e of text.match(EMAIL_RE) ?? []) found.add(e.toLowerCase());
  const base = host.split('.').slice(-2).join('.');
  return [...found]
    .map((e) => e.replace(/[.,;]+$/, ''))
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/.test(e))
    .filter((e) => e.split('@')[1]?.endsWith(base))
    .filter((e) => ROLE.test(e.split('@')[0]));
}

async function findEmails(origin) {
  if (!(await robotsAllows(origin))) return [];
  const host = new URL(origin).hostname.replace(/^www\./, '');
  const found = new Set();
  for (const p of PAGES) {
    const html = await getPage(origin + p);
    if (html) emailsFrom(html, host).forEach((e) => found.add(e));
    if ([...found].some((e) => PREFERRED.test(e.split('@')[0]))) break;
  }
  return [...found]
    .sort((a, b) => Number(PREFERRED.test(b.split('@')[0])) - Number(PREFERRED.test(a.split('@')[0])))
    .slice(0, 3);
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

// ---------- ejecución ----------
const data = JSON.parse(await readFile(OFFERS, 'utf8'));
let companies = {};
try { companies = JSON.parse(await readFile(COMPANIES, 'utf8')); } catch { /* primera vez */ }
const now = new Date().toISOString();

const fresh = (c) => c && (Date.now() - new Date(c.checked_at).getTime()) < (c.status === 'ok' ? 60 : 14) * DAY;

// una entrada por empresa, la de mejor encaje; se salta las que ya traen email en la oferta
const seen = new Map();
for (const o of [...data.offers].sort((a, b) => b.encaje - a.encaje)) {
  const k = companyKey(o.empresa);
  if (!k || o.encaje < 50 || seen.has(k)) continue;
  seen.set(k, o);
}
for (const o of data.offers) if (o.emails?.length) seen.delete(companyKey(o.empresa));

const todo = [...seen.entries()].filter(([k]) => !fresh(companies[k])).slice(0, MAX);
console.log(`Empresas: ${seen.size} candidatas, ${todo.length} por buscar ahora (máximo ${MAX}).`);

if (todo.length) {
  const queryOf = ([, o]) => `${clean(o.empresa)} ${clean(String(o.ciudad).split(',')[0]) || 'Madrid'} sitio web oficial`;
  const serps = await searchWebs(todo.map(queryOf));
  const byTerm = new Map(serps.map((s) => [clean(s.searchQuery?.term), s.organicResults ?? []]));

  let conWeb = 0, conEmail = 0;
  await pool(todo, 5, async (entry) => {
    const [k, o] = entry;
    const web = pickWebsite(o.empresa, byTerm.get(clean(queryOf(entry))));
    const emails = web ? await findEmails(web) : [];
    companies[k] = { nombre: o.empresa, web, emails, status: !web ? 'sin_web' : emails.length ? 'ok' : 'sin_email', checked_at: now };
    if (web) conWeb++;
    if (emails.length) conEmail++;
  });
  console.log(`Webs encontradas: ${conWeb}/${todo.length} · con email de contacto: ${conEmail}/${todo.length}`);
}

applyCompanies(data.offers, companies);
data.enriched = now;
await writeFile(OFFERS, JSON.stringify(data, null, 1) + '\n');
await writeFile(COMPANIES, JSON.stringify(companies, null, 1) + '\n');
console.log(`Ofertas con email de la web: ${data.offers.filter((o) => o.emailsWeb?.length).length}/${data.offers.length}`);
