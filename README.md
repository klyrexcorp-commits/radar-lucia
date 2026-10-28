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
- `scripts/enrich-contacts.mjs` y `.github/workflows/buscar-emails.yml`: buscan la web de cada empresa
  (Google Search Scraper de Apify, desde 1,80 $ por 1.000 búsquedas) y leen su propia web desde GitHub
  Actions (sin coste de Apify) para sacar emails de contacto general (info@, rrhh@, empleo@...).
  Los emails con nombre de persona se descartan. Resultado en `docs/companies.json` y `docs/offers.json`.
  Se lanza a mano, con un máximo de empresas por ejecución (60 por defecto).

## Puesta en marcha

1. Repositorio público `radar-lucia` en la cuenta de GitHub de Klyrex, con estos archivos.
2. Settings → Secrets and variables → Actions → New repository secret: `APIFY_TOKEN`
   (Apify Console → Settings → API & integrations).
3. Settings → Pages → Deploy from a branch → `main` / carpeta `/docs`.
4. Actions → «Recoger ofertas» → Run workflow (la primera vez, a mano).
5. En la app, Ajustes: Gmail de Lucía, enlace al CV y teléfono.

## Envío desde Gmail (sin servidor)

Lucía escribe su email una sola vez en la pestaña **Mi email** (se guarda solo; `{empresa}` se sustituye
por el nombre de cada empresa), elige las empresas y pulsa Enviar. La app lo manda por la API de Gmail
desde su navegador, con el CV en PDF adjunto y 3 segundos entre un correo y el siguiente. No guarda contraseñas: pide permiso a Google (OAuth, solo `gmail.send`)
y el permiso vive únicamente en memoria. El PDF del CV se guarda solo en el navegador de Lucía.

Hace falta un ID de cliente de Google (se crea una vez, es gratis):

1. En <https://console.cloud.google.com> crear un proyecto (`radar-lucia`).
2. APIs y servicios → Biblioteca → **Gmail API** → Habilitar.
3. Google Auth Platform (antes «Pantalla de consentimiento de OAuth»): nombre de la app, correo de
   asistencia, público **Externo**. En «Usuarios de prueba» añadir el Gmail de Lucía. En «Acceso a los
   datos» añadir el permiso `https://www.googleapis.com/auth/gmail.send`.
4. Clientes → Crear cliente → **Aplicación web**. En «Orígenes autorizados de JavaScript» poner
   `https://klyrexcorp-commits.github.io` (sin barra final). Copiar el ID de cliente.
5. En la app: Ajustes → pegar el ID de cliente, escribir el Gmail, adjuntar el PDF del CV, **Conectar con
   Gmail** y **Enviarme un email de prueba**.

En modo «Prueba» Google avisa de que la app no está verificada (Avanzado → Ir a Radar Lucía) y el permiso
caduca a los 7 días: hay que volver a pulsar «Conectar con Gmail».

## Coste

Actores de pago por resultado: InfoJobs `scrapesage/infojobs-scraper`, Indeed
`unfenced-group/indeed-es-scraper` y LinkedIn `gopalakrishnan/linkedin-jobs`. Con 7 búsquedas y
25 resultados por búsqueda, una ejecución estimada ronda 0,5 $ más el uso de plataforma
(estimación a partir de los precios publicados; mirar el consumo real tras la primera ejecución).
El plan gratuito de Apify incluye 5 $ de crédito al mes.
