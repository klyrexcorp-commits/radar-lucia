// Utilidades compartidas por fetch-offers.mjs y enrich-contacts.mjs

// Clave estable de empresa: sin tildes, sin formas societarias ni palabras de relleno
export function companyKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?u?\.?|sociedad limitada|spain|espana|group|grupo|corp|corporation|consulting services)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Palabras demasiado genéricas para identificar una web con ellas
const GENERIC = new Set([
  'madrid', 'spain', 'espana', 'group', 'grupo', 'recruitment', 'recursos', 'humanos', 'consulting', 'consultores',
  'services', 'servicios', 'solutions', 'solucion', 'soluciones', 'internacional', 'international', 'media',
  'digital', 'marketing', 'comunicacion', 'gestion', 'trabajemos', 'juntos', 'hotel', 'hotels', 'sociedad',
  'iberia', 'europe', 'global', 'holding', 'holdings', 'trabajo', 'empleo', 'company', 'partners',
]);

// ¿El dominio contiene el nombre de la empresa? Es la única señal que se acepta: que el título
// de una página mencione a la empresa no basta (portales, prensa y directorios la mencionan).
export function domainMatches(empresa, host) {
  const flat = String(host ?? '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
  const key = companyKey(empresa);
  const joined = key.replace(/ /g, '');
  if (joined.length >= 4 && flat.includes(joined)) return true;
  return key.split(' ').some((t) => t.length >= 4 && !GENERIC.has(t) && flat.includes(t));
}

// Copia a cada oferta la web y los emails de contacto general que se encontraron de su empresa.
// `webFuente` es la web que daba la propia oferta; la de la empresa solo se usa si no hay otra.
export function applyCompanies(offers, companies) {
  for (const o of offers) {
    const c = companies[companyKey(o.empresa)];
    o.webFuente = o.webFuente ?? '';
    o.web = o.webFuente || c?.web || '';
    o.emailsWeb = c?.emails ?? [];
  }
  return offers;
}
