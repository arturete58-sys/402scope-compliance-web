#!/usr/bin/env python3
"""Builds the site into dist/ (deployable, self-hosted fonts) and preview/ (artifact preview).

Fill in CONFIG below, then run: python3 build.py
"""
import json, shutil, datetime
from pathlib import Path

CONFIG = {
    # Where the site is published (no trailing slash).
    "SITE_URL": "https://compliance.402scope.org",
    "EMAIL": "hello@402scope.org",
    # Stripe Payment Link for the EUR 490 review. Empty until Stripe is set up:
    # the buttons then open an email to order the review.
    "STRIPE_URL": "",
    # Set to True once Stripe has enabled stablecoin payments on the account.
    "STRIPE_USDC": False,
    # Cal.com link for the 15-minute call. Empty: the buttons open an email instead.
    "CAL_URL": "",
    "UPDATED": "29 September 2026",
    # Founding-client places still open (out of 5) at the launch price.
    "FOUNDING_OPEN": 5,
    # Real testimonials only, added with the client's written permission:
    # {"quote": "...", "name": "...", "role": "...", "project": "..."}
    "TESTIMONIALS": [],
    "INDEPENDENCE": "Measurement is free and never sold. If a provider measured by the observatory buys a review, the engagement is disclosed on its observatory page and has no effect on its measurements.",
}

ROOT = Path(__file__).parent
def ph(name, cls=""):
    svg = (ROOT / "icons" / f"{name}.svg").read_text(encoding="utf-8").strip()
    attrs = ' aria-hidden="true" focusable="false"' + (f' class="{cls}"' if cls else "")
    return svg.replace("<svg ", "<svg" + attrs + " ", 1)


ICONS = {
    "ICON_ARROW": ph("arrow-right"),
    "ICON_CHECK": ph("check"),
    "ICON_X": ph("x"),
    "ICON_PLUS": ph("plus"),
    "ICON_SEARCH": ph("magnifying-glass"),
    "ICON_PLAY": ph("play", "i-play").replace("<svg", "<svg hidden", 1),
    "ICON_PAUSE": ph("pause", "i-pause"),
    "ICON_TOKEN": ph("coins", "seg-icon"),
    "ICON_PAY": ph("arrows-left-right", "seg-icon"),
    "ICON_API": ph("code", "seg-icon"),
}
MARK = ('<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">'
        '<rect x="1" y="1" width="30" height="30" rx="8" fill="#141c30" stroke="#2c3858"/>'
        '<circle cx="16" cy="16" r="7.5" fill="none" stroke="#edf1f8" stroke-width="2"/>'
        '<path d="M16 4.5v4M16 23.5v4M4.5 16h4M23.5 16h4" stroke="#edf1f8" stroke-width="2" stroke-linecap="round"/>'
        '<circle cx="16" cy="16" r="2.4" fill="#8ea8ff"/></svg>')
BRAND = "402Scope"


def clients_section():
    from html import escape
    open_ = int(CONFIG["FOUNDING_OPEN"])
    quotes = CONFIG["TESTIMONIALS"]
    seats = "".join('<i class="taken"></i>' if i >= open_ else "<i></i>" for i in range(5))
    founding = f'''<div class="founding">
          <h3>Founding clients</h3>
          <p>The first five teams get the review at €490 instead of €790. In return, you let us publish a short testimonial and, if you agree, an anonymised case study of the fixes.</p>
          <div class="seats" aria-label="{open_} of 5 places open">{seats}<span>{open_} of 5 places open</span></div>
          <a class="btn btn-primary" href="#pricing">Claim a founding place {ICONS["ICON_ARROW"]}</a>
        </div>''' if open_ > 0 else ""
    if quotes:
        items = "".join(f'''<figure class="quote"><blockquote>{escape(q["quote"])}</blockquote><figcaption><b>{escape(q["name"])}</b>, {escape(q["role"])}, {escape(q["project"])}</figcaption></figure>''' for q in quotes)
        right = f'<div class="quotes">{items}</div>'
        title, lead = "What clients say", "Published with each client's permission."
    else:
        right, title, lead = "", "Be one of the first five", "402Scope Compliance opened in September 2026. No invented reviews: testimonials appear here as real clients give them."
    if not quotes and not founding:
        return ""
    body = (founding + right) if quotes else founding
    return f'''  <section class="section clients" id="clients" aria-labelledby="clients-title">
    <div class="wrap">
      <div>
        <h2 id="clients-title">{title}</h2>
        <p class="lead">{lead}</p>
      </div>
      <div class="quotes">{body}</div>
    </div>
  </section>'''


def derived():
    mail = CONFIG["EMAIL"]
    stripe = CONFIG["STRIPE_URL"]
    soon = ' <span class="status">Coming soon</span>'
    return {
        "PAY_HREF": stripe or f"mailto:{mail}?subject=MiCA%20Readiness%20Review",
        "PAY_FINE": ("You pay once. A five-minute form follows, and the 72 hours start when it arrives."
                     if stripe else "Order by email for now. You get a payment link or a USDC invoice, then a five-minute form. The 72 hours start when it arrives."),
        "CALL_URL": CONFIG["CAL_URL"] or f"mailto:{mail}?subject=15-minute%20call",
        "STATUS_STRIPE": "" if stripe else soon,
        "CLIENTS_SECTION": clients_section(),
        "STATUS_STRIPE_USDC": "" if (stripe and CONFIG["STRIPE_USDC"]) else soon,
    }


PAGES = [
    {"file": "index.html", "src": "pages/index.html",
     "title": "402Scope Compliance",
     "seo_title": "MiCA Compliance Review for Crypto and x402 Teams | 402Scope",
     "desc": "Fixed-price EU compliance review for token launches, stablecoin apps and x402 APIs: MiCA, AML and marketing rules, redlined in 72 working hours."},
    {"file": "legal-notice.html", "src": "pages/legal-notice.html",
     "title": "Legal notice", "seo_title": "Legal notice | 402Scope",
     "desc": "Legal notice for 402Scope Compliance, operated by Arturo Ferrándiz Fernández."},
    {"file": "privacy.html", "src": "pages/privacy.html",
     "title": "Privacy policy", "seo_title": "Privacy policy | 402Scope",
     "desc": "How 402Scope Compliance processes personal data under the GDPR."},
    {"file": "terms-of-engagement.html", "src": "pages/terms-of-engagement.html",
     "title": "Terms of Engagement", "seo_title": "Terms of Engagement | 402Scope Compliance",
     "desc": "Terms that apply to MiCA Readiness Reviews and other services from 402Scope Compliance."},
    {"file": "guides.html", "src": "pages/guides.html",
     "title": "Guides", "seo_title": "EU Crypto Compliance Guides | 402Scope Compliance",
     "desc": "Short, sourced guides to MiCA marketing rules, white paper exemptions and crypto terms of service for EU users."},
    {"file": "mica-marketing-rules.html", "src": "pages/guide-mica-marketing-rules.html",
     "title": "MiCA marketing rules", "seo_title": "MiCA Marketing Rules: The Article 7 Checklist | 402Scope Compliance",
     "desc": "What MiCA Article 7 requires from crypto marketing: the four requirements, the mandatory statement, timing, KOLs and fines, with examples."},
    {"file": "mica-white-paper-exemptions.html", "src": "pages/guide-mica-white-paper-exemptions.html",
     "title": "MiCA white paper exemptions", "seo_title": "Do You Need a MiCA White Paper? Article 4 Exemptions | 402Scope Compliance",
     "desc": "When a MiCA white paper is required and when it is not: the Article 4(2) and 4(3) exemptions, what still applies, notification and publication."},
    {"file": "crypto-terms-of-service-eu.html", "src": "pages/guide-crypto-terms-of-service-eu.html",
     "title": "Crypto terms of service for EU users", "seo_title": "Crypto Terms of Service for EU Users: 7 Clauses That Fail | 402Scope Compliance",
     "desc": "Seven clauses in crypto terms of service that are unfair or unenforceable for EU consumers, with the rule behind each and what to write instead."},
    {"file": "cookies.html", "src": "pages/cookies.html",
     "title": "Cookies", "seo_title": "Cookies | 402Scope",
     "desc": "Cookie information for the 402Scope Compliance website."},
]

FONT_FACES = """
@font-face { font-family: "Schibsted Grotesk"; font-style: normal; font-weight: 400 900; font-display: swap; src: url("fonts/schibsted-grotesk-latin-ext-wght-normal.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Schibsted Grotesk"; font-style: normal; font-weight: 400 900; font-display: swap; src: url("fonts/schibsted-grotesk-latin-wght-normal.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Literata"; font-style: normal; font-weight: 400; font-display: swap; src: url("fonts/literata-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Literata"; font-style: normal; font-weight: 600; font-display: swap; src: url("fonts/literata-latin-600-normal.woff2") format("woff2"); }
"""
GOOGLE_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:wght@400;600&family=Schibsted+Grotesk:wght@400..800&display=swap">')


def header(is_home):
    base = "" if is_home else "index.html"
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{base or '#main'}" aria-label="{BRAND} Compliance, home">{MARK}<span class="brand-text"><strong>{BRAND}</strong><span>Compliance</span></span></a>
    <nav class="nav" aria-label="Main">
      <a href="{base}#who">Who it's for</a>
      <a href="{base}#examples">Examples</a>
      <a href="{base}#checker">Scanner</a>
      <a href="{base}#report">Sample report</a>
      <a href="{base}#pricing">Pricing</a>
      <a href="guides.html">Guides</a>
      <a class="btn btn-primary" href="{base}#pricing">Get my review</a>
    </nav>
  </div>
</header>'''


def footer():
    mail = CONFIG["EMAIL"]
    return f'''<footer class="site-footer">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="index.html">{MARK}<span class="brand-text"><strong>{BRAND}</strong><span>Compliance</span></span></a>
        <p class="foot-note">Fixed-price EU compliance reviews for crypto and x402 teams. Regulatory analysis, not legal advice. Not a law firm.</p>
      </div>
      <nav aria-labelledby="f-service"><h2 id="f-service">Service</h2><ul>
        <li><a href="index.html#review">The review</a></li><li><a href="index.html#report">Sample report</a></li>
        <li><a href="index.html#pricing">Pricing</a></li><li><a href="index.html#faq">FAQ</a></li><li><a href="guides.html">Guides</a></li></ul></nav>
      <nav aria-labelledby="f-obs"><h2 id="f-obs">402Scope</h2><ul>
        <li><a href="https://402scope.org">Observatory</a></li><li><a href="index.html#observatory">Independence</a></li>
        <li><a href="index.html#about">About</a></li></ul></nav>
      <nav aria-labelledby="f-legal"><h2 id="f-legal">Legal</h2><ul>
        <li><a href="terms-of-engagement.html">Terms of Engagement</a></li><li><a href="legal-notice.html">Legal notice</a></li><li><a href="privacy.html">Privacy</a></li>
        <li><a href="cookies.html">Cookies</a></li></ul></nav>
    </div>
    <div class="foot-bottom"><span>Arturo Ferrándiz Fernández, Valencia, Spain</span><span class="email">{mail}</span></div>
  </div>
</footer>'''


def json_ld():
    data = {
        "@context": "https://schema.org",
        "@type": "ProfessionalService",
        "name": "402Scope Compliance",
        "url": CONFIG["SITE_URL"] + "/",
        "email": CONFIG["EMAIL"],
        "description": PAGES[0]["desc"],
        "areaServed": {"@type": "Place", "name": "European Union"},
        "address": {"@type": "PostalAddress", "addressLocality": "Valencia", "addressCountry": "ES"},
        "knowsAbout": ["MiCA", "Markets in Crypto-Assets Regulation", "Anti-money laundering", "Travel Rule", "Crypto marketing rules", "GDPR"],
        "founder": {"@type": "Person", "name": "Arturo Ferrándiz Fernández", "alumniOf": {"@type": "CollegeOrUniversity", "name": "Universitat de València"}},
        "makesOffer": [
            {"@type": "Offer", "name": "MiCA Readiness Review", "price": "490", "priceCurrency": "EUR"},
            {"@type": "Offer", "name": "Launch Pack", "priceSpecification": {"@type": "PriceSpecification", "minPrice": "2000", "priceCurrency": "EUR"}},
        ],
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'


MODE = {"v": "dist"}


def scripts():
    if MODE["v"] == "dist":
        libs = '<script src="vendor/gsap.min.js" defer></script><script src="vendor/ScrollTrigger.min.js" defer></script>'
    else:
        libs = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>'
                '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js" defer></script>')
    return libs + '<script src="js/checker.js" defer></script><script src="js/scan.js" defer></script><script src="js/motion.js" defer></script>'


def fill(text):
    for k, v in {**{k: str(v) for k, v in CONFIG.items()}, **derived(), "SCRIPTS": scripts(), **ICONS}.items():
        text = text.replace("{{" + k + "}}", v)
    return text


def head_tags(page, mode):
    url = CONFIG["SITE_URL"] + "/" + ("" if page["file"] == "index.html" else page["file"])
    title = page["seo_title"] if mode == "dist" else page["title"]
    tags = [
        f'<title>{title}</title>',
        f'<meta name="description" content="{page["desc"]}">',
        f'<link rel="canonical" href="{url}">',
        '<meta name="robots" content="index, follow">',
        '<meta name="theme-color" content="#0a0f1c">',
        f'<meta property="og:type" content="website"><meta property="og:title" content="{page["seo_title"]}">',
        f'<meta property="og:description" content="{page["desc"]}"><meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{CONFIG["SITE_URL"]}/og-image.png"><meta name="twitter:card" content="summary_large_image">',
        '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
    ]
    if mode == "dist":
        tags.append('<link rel="preload" href="fonts/schibsted-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>')
        tags.append('<link rel="stylesheet" href="fonts.css">')
    else:
        tags.append(GOOGLE_FONTS)
    tags.append('<link rel="stylesheet" href="styles.css">')
    if page["file"] == "index.html":
        tags.append(json_ld())
    return "\n".join(tags)


def build(mode):
    MODE["v"] = mode
    out = ROOT / mode
    if out.exists():
        shutil.rmtree(out)
    out.mkdir()
    shutil.copy(ROOT / "styles.css", out / "styles.css")
    for asset in (ROOT / "assets").glob("*"):
        shutil.copy(asset, out / asset.name)
    shutil.copytree(ROOT / "js", out / "js")
    if mode == "dist":
        shutil.copytree(ROOT / "vendor", out / "vendor")
    (out / "favicon.svg").write_text(MARK.replace(' class="brand-mark"', ' xmlns="http://www.w3.org/2000/svg"'), encoding="utf-8")
    for page in PAGES:
        body = header(page["file"] == "index.html") + "\n" + fill((ROOT / page["src"]).read_text(encoding="utf-8")) + "\n" + footer()
        head = head_tags(page, mode)
        if mode == "dist" or page["file"] != "index.html":
            html = f'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n{head}\n</head>\n<body>\n{body}\n</body>\n</html>\n'
        else:
            html = f'<meta charset="utf-8">\n{head}\n{body}\n'
        (out / page["file"]).write_text(html, encoding="utf-8")
    if mode == "dist":
        fonts = out / "fonts"
        fonts.mkdir()
        for f in (ROOT / "fonts").glob("*.woff2"):
            shutil.copy(f, fonts / f.name)
        (fonts / "LICENSE-OFL.txt").write_text("Schibsted Grotesk and Literata are licensed under the SIL Open Font License 1.1. https://openfontlicense.org\n", encoding="utf-8")
        (out / "fonts.css").write_text(FONT_FACES.strip() + "\n", encoding="utf-8")
        (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {CONFIG['SITE_URL']}/sitemap.xml\n", encoding="utf-8")
        today = datetime.date.today().isoformat()
        urls = "".join(f"  <url><loc>{CONFIG['SITE_URL']}/{'' if p['file'] == 'index.html' else p['file']}</loc><lastmod>{today}</lastmod></url>\n" for p in PAGES)
        (out / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n', encoding="utf-8")
        (out / "_headers").write_text(
            "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n"
            "  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n"
            "  Strict-Transport-Security: max-age=31536000; includeSubDomains\n\n"
            "/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/*.mp4\n  Cache-Control: public, max-age=604800\n\n/*.webm\n  Cache-Control: public, max-age=604800\n", encoding="utf-8")
        (out / "404.html").write_text(
            (out / "legal-notice.html").read_text(encoding="utf-8").split("<main")[0].replace("Legal notice | 402Scope", "Page not found | 402Scope")
            + '<main id="main" class="legal"><div class="wrap"><h1>Page not found</h1><p>The page you were looking for does not exist. <a href="index.html">Go to the home page</a>.</p></div></main>\n'
            + footer() + "\n</body>\n</html>\n", encoding="utf-8")


if __name__ == "__main__":
    build("dist")
    build("preview")
    print("built dist/ and preview/")
