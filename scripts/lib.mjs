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

// Copia a cada oferta la web y los emails de contacto general que se encontraron de su empresa
export function applyCompanies(offers, companies) {
  for (const o of offers) {
    const c = companies[companyKey(o.empresa)];
    if (c?.web && !o.web) o.web = c.web;
    o.emailsWeb = c?.emails ?? [];
  }
  return offers;
}
