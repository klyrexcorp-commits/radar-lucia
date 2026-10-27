# Radar Lucía

Radar de empleo para Lucía Gómez: recoge ofertas de InfoJobs, Indeed y LinkedIn con Apify,
las puntúa según su perfil y las muestra en una app estática (GitHub Pages). Los datos personales
(empresas guardadas, Gmail, enlace al CV, teléfono) viven solo en el navegador de Lucía.

## Piezas

- `docs/index.html`: la app (GitHub Pages sirve esta carpeta).
- `docs/offers.json`: ofertas recogidas; lo escribe el workflow, no se edita a mano.
- `scripts/fetch-offers.mjs`: llama a los actores de Apify y normaliza los resultados.
- `config/search.json`: puestos buscados, zona, antigüedad máxima y límite por búsqueda.
- `.github/workflows/fetch-offers.yml`: se ejecuta cada lunes o a mano.

## Puesta en marcha

1. Repositorio público `radar-lucia` en la cuenta de GitHub de Klyrex, con estos archivos.
2. Settings → Secrets and variables → Actions → New repository secret: `APIFY_TOKEN`
   (Apify Console → Settings → API & integrations).
3. Settings → Pages → Deploy from a branch → `main` / carpeta `/docs`.
4. Actions → «Recoger ofertas» → Run workflow (la primera vez, a mano).
5. En la app, Ajustes: Gmail de Lucía, enlace al CV y teléfono.

## Coste

Actores de pago por resultado: InfoJobs `scrapesage/infojobs-scraper`, Indeed
`unfenced-group/indeed-es-scraper` y LinkedIn `gopalakrishnan/linkedin-jobs`. Con 7 búsquedas y
25 resultados por búsqueda, una ejecución estimada ronda 0,5 $ más el uso de plataforma
(estimación a partir de los precios publicados; mirar el consumo real tras la primera ejecución).
El plan gratuito de Apify incluye 5 $ de crédito al mes.
