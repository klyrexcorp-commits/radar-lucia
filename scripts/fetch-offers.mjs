// Recoge ofertas de InfoJobs, Indeed y LinkedIn con actores de Apify
// y las deja normalizadas en docs/offers.json.
//   APIFY_TOKEN=... node scripts/fetch-offers.mjs
//   node scripts/fetch-offers.mjs --fixtures <carpeta>   (prueba sin llamar a Apify)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyCompanies } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(await readFile(path.join(root, 'config/search.json'), 'utf8'));
const OUT = path.join(root, 'docs/offers.json');
const TOKEN = process.env.APIFY_TOKEN;
const fixtures = process.argv.includes('--fixtures') ? process.argv[process.argv.indexOf('--fixtures') + 1] : null;

if (!TOKEN && !fixtures) {
  console.error('Falta la variable APIFY_TOKEN.');
  process.exit(1);
}

// ---------- Apify ----------
async function runActor(actor, input, fixtureName) {
  if (fixtures) return JSON.parse(await readFile(path.join(fixtures, `${fixtureName}.json`), 'utf8'));
  const url = `https://api.apify.com/v2/acts/${actor.replace('/', '~')}/run-sync-get-dataset-items?format=json&clean=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(290_000),
  });
  if (!res.ok) throw new Error(`${actor}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---------- utilidades ----------
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

function extractEmails(text) {
  const found = String(text ?? '').match(EMAIL_RE) ?? [];
  const ok = found
    .map((e) => e.toLowerCase().replace(/[.,;]+$/, ''))
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/.test(e))
    .filter((e) => !/(no-?reply|example\.|sentry|wixpress)/.test(e));
  return [...new Set(ok)].slice(0, 3);
}

function guessTipo(puesto) {
  const s = puesto.toLowerCase();
  if (/event|producci|congres|azafat/.test(s)) return 'eventos';
  if (/marketing|comunic|social|content|contenido|brand|publicid/.test(s)) return 'marketing';
  return 'cuentas';
}

// Encaje con el perfil de Lucía (marketing, cuentas y eventos, nivel junior)
function score(puesto, descripcion) {
  const t = puesto.toLowerCase();
  const d = descripcion.toLowerCase();
  let n = 40;
  if (/cuentas|account|event|marketing|comunicaci|publicidad|brand|social media|community/.test(t)) n += 25;
  if (/junior|jr\b|pr[aá]cticas|becari|asistente|auxiliar|trainee|coordinador/.test(t)) n += 15;
  if (/senior|sr\b|director|jefe|responsable|manager|head|l[ií]der|gerente/.test(t)) n -= 40;
  if (/desarrollador|developer|ingenier|programador|contable|contabilidad|financ|log[ií]stic|conductor|enfermer|comercial|ventas|electric/.test(t)) n -= 50;
  if (/payable|receivable|facturaci|auditor|tesorer|fiscal|n[oó]min|recursos humanos|rrhh/.test(t)) n -= 50;
  if (/(\+|m[aá]s de|m[ií]nimo|minimo)\s*[3-9]\s*a[nñ]os/.test(d)) n -= 20;
  return Math.max(0, Math.min(100, n));
}

function finalize(o, portal) {
  const descripcion = clean(o.descripcion);
  const puesto = clean(o.puesto);
  return {
    id: o.id,
    portal,
    puesto,
    empresa: clean(o.empresa),
    ciudad: clean(o.ciudad),
    url: o.url,
    fecha: o.fecha || null,
    salario: clean(o.salario),
    modalidad: clean(o.modalidad),
    webFuente: /^https?:\/\//i.test(o.web || '') ? o.web : '',
    emails: extractEmails(o.descripcion),
    tipo: guessTipo(puesto),
    encaje: score(puesto, descripcion),
    resumen: descripcion.slice(0, 400),
  };
}

// ---------- fuentes ----------
const SOURCES = {
  infojobs: {
    portal: 'InfoJobs',
    actor: 'scrapesage/infojobs-scraper',
    inputs: () => [{
      searchQueries: cfg.queries,
      provinces: [cfg.infojobsProvince],
      postedWithin: `_${cfg.postedDays}_DAYS`,
      sortBy: 'PUBLICATION_DATE',
      includeDescription: true,
      maxResults: cfg.maxPerQuery * cfg.queries.length,
    }],
    normalize: (it) => it.recordType && it.recordType !== 'jobOffer' ? null : ({
      id: `infojobs:${it.offerId}`, puesto: it.title, empresa: it.companyName, ciudad: it.city,
      url: it.url, fecha: it.publishedAt, salario: it.salaryText, modalidad: it.teleworking,
      descripcion: it.description, web: '',
    }),
  },
  indeed: {
    portal: 'Indeed',
    actor: 'unfenced-group/indeed-es-scraper',
    inputs: () => cfg.queries.map((q) => ({
      query: q, location: cfg.location, radius: 25, sort: 'date',
      fromDays: String(cfg.postedDays), maxItems: cfg.maxPerQuery,
    })),
    normalize: (it) => ({
      id: `indeed:${it.jobKey}`, puesto: it.title, empresa: it.companyName,
      ciudad: it.location?.city || it.location?.raw, url: it.jobUrl, fecha: it.datePublished,
      salario: it.salary?.salaryText, modalidad: it.location?.isRemote ? 'Remoto' : '',
      descripcion: it.descriptionText, web: it.corporateWebsite,
    }),
  },
  linkedin: {
    portal: 'LinkedIn',
    actor: 'gopalakrishnan/linkedin-jobs',
    inputs: () => cfg.queries.map((q) => ({
      keywords: q, location: cfg.linkedinLocation, maxResults: cfg.maxPerQuery,
    })),
    normalize: (it) => {
      const url = String(it.jobUrl || '').split('?')[0];
      const num = url.match(/(\d{6,})\/?$/)?.[1];
      return {
        id: `linkedin:${num || url}`, puesto: it.title, empresa: it.company, ciudad: it.location,
        url, fecha: it.postedDate, salario: '', modalidad: '', descripcion: '', web: '',
      };
    },
  },
};

// ---------- ejecución ----------
const now = new Date().toISOString();
const fresh = [];
const status = {};

for (const [key, src] of Object.entries(SOURCES)) {
  if (!cfg.sources[key]) continue;
  try {
    let n = 0;
    for (const input of src.inputs()) {
      const items = await runActor(src.actor, input, key);
      for (const it of items) {
        const o = src.normalize(it);
        if (!o || !o.id || !o.url || !clean(o.puesto) || !clean(o.empresa)) continue;
        fresh.push(finalize(o, src.portal));
        n++;
      }
    }
    status[key] = { ok: true, ofertas: n };
    console.log(`${src.portal}: ${n} ofertas`);
  } catch (e) {
    status[key] = { ok: false, error: String(e.message || e).slice(0, 300) };
    console.error(`${src.portal}: ERROR ${status[key].error}`);
  }
}

if (!Object.values(status).some((s) => s.ok)) {
  console.error('Ninguna fuente respondió; no se toca offers.json.');
  process.exit(1);
}

// fusionar con lo anterior, conservando first_seen
let previous = [];
try { previous = JSON.parse(await readFile(OUT, 'utf8')).offers ?? []; } catch { /* primera vez */ }
const byId = new Map(previous.map((o) => [o.id, o]));
const cutoff = Date.now() - cfg.keepDays * 86400_000;

for (const o of fresh) {
  const old = byId.get(o.id);
  byId.set(o.id, { ...o, first_seen: old?.first_seen ?? now, last_seen: now });
}

// descartar antiguas y poco relevantes; quitar duplicados entre portales (misma empresa y puesto)
const seenKey = new Map();
const offers = [...byId.values()]
  .filter((o) => new Date(o.last_seen).getTime() >= cutoff && o.encaje >= cfg.minScore)
  .sort((a, b) => (b.emails.length - a.emails.length) || (b.encaje - a.encaje))
  .filter((o) => {
    const k = `${o.empresa}|${o.puesto}`.toLowerCase().replace(/[^a-z0-9áéíóúñ|]/g, '');
    if (seenKey.has(k)) return false;
    seenKey.set(k, true);
    return true;
  })
  .sort((a, b) => b.encaje - a.encaje || String(b.fecha).localeCompare(String(a.fecha)));

// conservar las webs y emails ya encontrados en docs/companies.json
let companies = {};
try { companies = JSON.parse(await readFile(path.join(root, 'docs/companies.json'), 'utf8')); } catch { /* aún no existe */ }
applyCompanies(offers, companies);

await writeFile(OUT, JSON.stringify({ updated: now, status, total: offers.length, offers }, null, 1) + '\n');
console.log(`offers.json: ${offers.length} ofertas (${offers.filter((o) => o.emails.length).length} con email)`);
