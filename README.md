# 402Scope Compliance · web

Sitio estático, sin dependencias ni servidor. La carpeta `dist/` es lo que se publica.

## Qué hay

- `pages/`: contenido de cada página (inicio, aviso legal, privacidad, cookies y Terms of Engagement).
- `styles.css`: diseño compartido, modo claro y oscuro.
- `fonts/`: tipografías alojadas en el propio sitio (licencia OFL).
- `build.py`: genera `dist/` (para publicar) y `preview/` (vista previa).
- `assets/`: vídeo del producto (MP4/WebM), póster, informe de muestra en PDF y sus vistas previas, imagen para compartir.
- `js/`: verificador de frases (`checker.js`) y animaciones (`motion.js`).
- `vendor/`: GSAP y ScrollTrigger, alojados en el propio sitio.
- `icons/`: iconos Phosphor (licencia MIT).
- `video/scene.html` y `report/sample-report.html`: fuentes del vídeo y del informe de muestra, por si hay que regenerarlos.

## Configuración (principio de `build.py`)

- `SITE_URL`: `https://compliance.402scope.org` (subdominio del dominio del observatorio).
- `EMAIL`: `hello@402scope.org`. Cámbialo si creas otra dirección.
- `STRIPE_URL`: vacío hasta tener el enlace de pago. Mientras tanto, el botón abre un correo para pedir la revisión.
- `STRIPE_USDC`: pon `True` cuando Stripe active los pagos en stablecoins en tu cuenta (en España están en acceso anticipado).
- `CAL_URL`: vacío hasta tener Cal.com. Mientras tanto, "Book a 15-min call" abre un correo.
- `INDEPENDENCE`: texto de la política de independencia respecto al observatorio.

Pendiente de rellenar a mano: `[invoicing software]` en `pages/privacy.html`.

Después: `python3 build.py`.

## Publicar con Cloudflare Pages (gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. En Cloudflare Pages, crea un proyecto conectado a ese repositorio. Build command: `python3 build.py`. Output directory: `dist`.
3. En "Custom domains" añade `compliance.402scope.org`.
4. En Hostinger (DNS de 402scope.org) crea el registro CNAME `compliance` que te indique Cloudflare. El observatorio en 402scope.org no se toca.
5. Activa Cloudflare Web Analytics (sin cookies, como dice la política de cookies).

Cada cambio que se suba al repositorio se publica solo.

## Testimonios

Añade solo opiniones reales, con permiso escrito del cliente, en `TESTIMONIALS` dentro de `build.py`. Baja `FOUNDING_OPEN` cada vez que cierres un cliente fundador.
