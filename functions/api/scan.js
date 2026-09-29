// Website scanner for compliance.402scope.org (Cloudflare Pages Function: POST /api/scan).
// Fetches a public website plus its terms, privacy and imprint pages, and runs indicative
// checks against EU crypto rules. Nothing is stored; results are cached for an hour per URL.

const UA = '402ScopeComplianceScanner/1.0 (+https://compliance.402scope.org/#scan)';
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const CACHE_SECONDS = 3600;

const MARKETING = [
  { re: /\bguarantee(?:d|s)?\b|\bassured returns?\b/gi, level: 'high', title: 'Return promised as certain', rule: 'MiCA Art. 7', fix: 'Say what can happen, not what will: rewards vary and can fall to zero.' },
  { re: /\b\d+(?:[.,]\d+)?\s?%\s?(?:apy|apr|yield|returns?|interest|profit|per (?:year|month|week|day)|a (?:year|month|day))\b/gi, level: 'high', title: 'Return figure without context', rule: 'MiCA Art. 7', fix: 'Show how the figure is calculated, that it is variable and that past rates do not predict future ones.' },
  { re: /\b(?:risk[- ]?free|no risk|zero risk|without risk|can(?:no|')t lose|100% safe|completely safe|totally safe|safe investment)\b/gi, level: 'high', title: 'Risk denied', rule: 'MiCA Art. 7', fix: 'Replace with a plain risk statement: you can lose all the value of what you buy.' },
  { re: /\b(?:fully protected|100% protected|funds are protected|insured deposits?|covered by insurance|deposit guarantee|fdic[- ]insured)\b/gi, level: 'high', title: 'Protection overstated', rule: 'MiCA Art. 7 and Title IV', fix: 'Crypto-assets and e-money tokens are not bank deposits. Remove protection claims or state exactly what covers what.' },
  { re: /\b(?:no kyc|no id (?:needed|required)|without (?:id|kyc|verification)|fully anonymous|anonymous (?:transfers?|payments?|trading))\b/gi, level: 'high', title: 'No-KYC promise', rule: 'Reg. (EU) 2023/1113 and EU AML rules', fix: 'Remove it. Crypto-asset service providers must identify customers and collect transfer data.' },
  { re: /\b(?:mica[- ]compliant|compliant with mica|fully compliant|eu[- ]regulated|licensed by|approved by the|authori[sz]ed by the)\b/gi, level: 'med', title: 'Regulatory status claim', rule: 'MiCA Art. 7', fix: 'Only state an authorisation you hold, naming the authority and the register entry.' },
  { re: /\b(?:withdraw (?:any ?time|instantly|at any time)|instant withdrawals?|no lock[- ]?ups?)\b/gi, level: 'med', title: 'Liquidity promise', rule: 'MiCA Art. 7', fix: 'Check it against lock-ups, unbonding periods and limits, and state them next to the claim.' },
  { re: /\b(?:passive income|get rich|financial freedom|to the moon|moonshot|\d+x (?:gains?|returns?)|life[- ]changing (?:gains|returns|money))\b/gi, level: 'med', title: 'Hype language', rule: 'MiCA Art. 7', fix: 'Marketing must be fair, clear and not misleading. Describe the product, not the dream.' },
  { re: /\b(?:only \d+ (?:spots?|places?|seats?) left|last chance|ends (?:today|tonight)|limited time only|act now|don'?t miss out)\b/gi, level: 'med', title: 'Pressure tactic', rule: 'Directive 2005/29/EC', fix: 'Remove false urgency. If a limit is real, state it plainly with the date.' },
];

const LINK_KINDS = [
  ['terms', /\b(?:terms|conditions|tos|user agreement|terms of (?:use|service))\b/i, /\/(?:terms|tos|conditions|legal\/terms|terms-of-(?:use|service))/i],
  ['privacy', /\b(?:privacy|data protection|gdpr)\b/i, /\/(?:privacy|data-protection|gdpr)/i],
  ['imprint', /\b(?:imprint|impressum|legal notice|aviso legal|mentions l[ée]gales)\b/i, /\/(?:imprint|impressum|legal-notice|aviso-legal|mentions-legales)/i],
  ['whitepaper', /\b(?:white ?paper|lite ?paper|crypto-asset white paper)\b/i, /(?:white-?paper|lite-?paper)/i],
];

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', ...extra },
  });

function normalise(raw, allowLocal) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('Enter a website address.');
  if (s.length > 500) throw new Error('That address is too long.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Error('That does not look like a website address.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses can be scanned.');
  if (u.username || u.password) throw new Error('Remove the user name or password from the address.');
  const h = u.hostname.toLowerCase();
  if (!allowLocal) {
    if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') throw new Error('Enter a public website address.');
    if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) throw new Error('Enter a domain name, not an IP address.');
    if (u.port && !['80', '443'].includes(u.port)) throw new Error('Enter a public website address.');
  }
  u.hash = '';
  return u;
}

const baseDomain = (h) => h.toLowerCase().split('.').slice(-2).join('.');

async function fetchPage(url, allowLocal) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const finalUrl = new URL(res.url || url);
  if (!allowLocal && (/^[\d.]+$/.test(finalUrl.hostname) || finalUrl.hostname.includes(':') || !finalUrl.hostname.includes('.'))) {
    throw new Error('redirected to a non-public address');
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok) return { url: finalUrl.href, status: res.status, html: '', type };
  if (!/html|xml|text\/plain/i.test(type)) return { url: finalUrl.href, status: res.status, html: '', type };
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { chunks.push(value.slice(0, value.byteLength - (size - MAX_BYTES))); await reader.cancel(); break; }
    chunks.push(value);
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return { url: finalUrl.href, status: res.status, html: new TextDecoder('utf-8').decode(buf), type };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', euro: '€' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
  .replace(/&#x([\da-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ' '; } })
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

function extract(html, pageUrl) {
  const metas = [];
  html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (/(?:name|property)\s*=\s*["'](?:description|og:description|og:title|twitter:description)["']/i.test(tag)) {
      const m = tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
      if (m) metas.push(decode(m[1] ?? m[2]));
    }
    return '';
  });
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).trim();
  const links = [];
  html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, inner) => {
    const m = attrs.match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
    if (!m) return '';
    let href = decode(m[1] ?? m[2]).trim();
    if (!href || /^(?:mailto:|tel:|javascript:|#)/i.test(href)) return '';
    try { href = new URL(href, pageUrl).href; } catch { return ''; }
    const text = decode(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    links.push({ href, text });
    return '';
  });
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|header|footer|tr|br|td|th|button|a|span)>/gi, ' $& ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).replace(/\s+/g, ' ').trim();
  return { title, text, metas, links };
}

function findLinks(links, origin) {
  const found = {};
  for (const [kind, textRe, hrefRe] of LINK_KINDS) {
    const hit = links.find((l) => textRe.test(l.text)) || links.find((l) => hrefRe.test(l.href));
    if (hit) found[kind] = hit.href;
  }
  if (!found.whitepaper) {
    const pdf = links.find((l) => /\.pdf(?:$|\?)/i.test(l.href) && /paper|token|economics/i.test(l.href + ' ' + l.text));
    if (pdf) found.whitepaper = pdf.href;
  }
  return found;
}

const snippet = (text, i, len) => {
  const a = Math.max(0, text.lastIndexOf(' ', Math.max(0, i - 70)));
  const b = text.indexOf(' ', Math.min(text.length, i + len + 70));
  return (a > 0 ? '…' : '') + text.slice(a, b === -1 ? text.length : b).trim() + (b !== -1 && b < text.length ? '…' : '');
};

function runChecks(pages, found, rawHome) {
  const findings = [];
  const passed = [];
  const home = pages[0];
  const all = pages.map((p) => p.text).join(' \n ');
  const marketingPages = pages.filter((p) => p.kind === 'home' || p.kind === 'whitepaper');

  // 1. Marketing claims, quoted with their context.
  const seen = new Set();
  for (const r of MARKETING) {
    for (const p of marketingPages) {
      r.re.lastIndex = 0;
      let m;
      let n = 0;
      while ((m = r.re.exec(p.text)) && n < 2) {
        const key = r.title + '|' + m[0].toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ level: r.level, title: r.title, rule: r.rule, fix: r.fix, quote: m[0], context: snippet(p.text, m.index, m[0].length), page: p.url });
          n++;
        }
        if (m[0].length === 0) r.re.lastIndex++;
      }
    }
  }

  const tokenish = /\b(?:token(?:s|omics)?|presale|pre-sale|ico|ido|tge|airdrop|staking|stake|mint(?:ing)?|nft)\b/i.test(home.text + ' ' + home.metas.join(' '));
  const riskWords = /\b(?:risk|risks|lose|loss|volatil\w*|not financial advice|may lose)\b/i.test(home.text.replace(/risk[- ]?free|no risk|zero risk|without risk/gi, ''));
  const statement = /not been (?:reviewed|approved)[^.]{0,80}(?:competent )?authorit/i.test(all);

  // 2. Crypto-asset marketing statements.
  if (tokenish) {
    if (statement) passed.push({ title: 'Statement that no authority has approved the communication', rule: 'MiCA Art. 7' });
    else findings.push({ level: 'med', title: 'Required statement not found', rule: 'MiCA Art. 7', fix: 'Crypto-asset marketing must say clearly that it has not been reviewed or approved by any competent authority in the EU.' });
  }
  if (riskWords) passed.push({ title: 'Risk language on the home page', rule: 'MiCA Art. 7' });
  else findings.push({ level: 'med', title: 'No risk statement on the home page', rule: 'MiCA Art. 7', fix: 'Add a short, plain statement of the main risks near any call to action.' });

  // 3. White paper.
  if (tokenish) {
    if (found.whitepaper || /\bwhite ?paper\b/i.test(all)) passed.push({ title: 'White paper linked or mentioned', rule: 'MiCA Arts. 6 and 9' });
    else findings.push({ level: 'med', title: 'No white paper found', rule: 'MiCA Arts. 4, 6, 8 and 9', fix: 'Offering or seeking admission of a token in the EU usually needs a notified white paper published on your website, unless an exemption applies. Check which case you are in.' });
  }

  // 4. Terms.
  const terms = pages.find((p) => p.kind === 'terms');
  if (!found.terms) {
    findings.push({ level: 'med', title: 'Terms of use not found', rule: 'Directive 93/13/EEC and Directive 2011/83/EU', fix: 'Publish terms that name the provider, the governing law, how disputes and complaints are handled, and what users pay.' });
  } else if (terms && terms.text.length > 400) {
    passed.push({ title: 'Terms of use found', rule: 'Directive 93/13/EEC', page: terms.url });
    if (!/\b(?:governing law|applicable law|governed by|laws of|jurisdiction)\b/i.test(terms.text)) {
      findings.push({ level: 'med', title: 'Terms name no governing law', rule: 'Directive 93/13/EEC and Rome I Regulation Art. 6', fix: 'State the governing law and courts, and keep the mandatory protections of the consumer’s country of residence.', page: terms.url });
    }
    const excl = terms.text.match(/(?:shall|will) not be (?:held )?liable for any[^.]{0,120}|in no event shall[^.]{0,140}|no liability whatsoever[^.]{0,80}/i);
    if (excl) {
      findings.push({ level: 'med', title: 'Broad liability exclusion', rule: 'Directive 93/13/EEC, Annex point 1(a) and (b)', fix: 'Blanket exclusions are likely unfair towards consumers. Keep liability for your own negligence and for non-performance.', quote: excl[0].slice(0, 180), page: terms.url });
    }
  } else if (found.terms) {
    findings.push({ level: 'info', title: 'Terms page could not be read', rule: 'Directive 93/13/EEC', fix: 'The scanner found a link but could not read the page (it may load with JavaScript or sit on another site). A full review reads it in full.', page: found.terms });
  }

  // 5. Privacy.
  const privacy = pages.find((p) => p.kind === 'privacy');
  if (!found.privacy) {
    findings.push({ level: 'high', title: 'Privacy notice not found', rule: 'GDPR Arts. 12 and 13', fix: 'Publish a privacy notice: who you are, what data you collect (including wallet addresses and analytics), why, on what legal basis, for how long, and transfers outside the EU.' });
  } else if (privacy && privacy.text.length > 400) {
    passed.push({ title: 'Privacy notice found', rule: 'GDPR Art. 13', page: privacy.url });
    if (tokenish && !/\bwallet/i.test(privacy.text)) {
      findings.push({ level: 'med', title: 'Privacy notice does not mention wallet addresses', rule: 'GDPR Art. 13 and EDPB Guidelines 02/2025', fix: 'Wallet addresses linked to a person are personal data. Say how you collect and use them, and that on-chain data cannot be erased.', page: privacy.url });
    }
  }

  // 6. Provider identification.
  const ident = /\b(?:ltd|limited|gmbh|s\.l\.u?|s\.a\.|s\.a\.s|s\.r\.l|inc\.?|llc|b\.v\.|n\.v\.|ag|oü|ug|foundation|stiftung|sp\. z o\.o\.)(?=[\s,.)]|$)/i.test(all)
    && /\b(?:registered|registration|company (?:number|no)|reg\.? no|handelsregister|kvk|vat|cif|nif|siren|companies house|registry code)\b/i.test(all);
  if (ident) passed.push({ title: 'Operator identified with company details', rule: 'Directive 2000/31/EC Art. 5' });
  else findings.push({ level: 'med', title: 'Operator not clearly identified', rule: 'Directive 2000/31/EC Art. 5', fix: 'Show the legal name, registered address, registration number and a contact email, usually in a legal notice or the footer.' });

  // 7. Analytics without a consent tool.
  const trackers = /googletagmanager\.com|google-analytics\.com|gtag\(|connect\.facebook\.net|hotjar|clarity\.ms|segment\.com\/analytics/i.test(rawHome);
  const cmp = /cookiebot|onetrust|cookieyes|iubenda|usercentrics|didomi|termly|klaro|cookie-?consent|osano|complianz/i.test(rawHome);
  if (trackers && !cmp) findings.push({ level: 'med', title: 'Analytics loaded without a visible consent tool', rule: 'ePrivacy Directive Art. 5(3) and GDPR', fix: 'Load non-essential cookies and trackers only after consent, with an equally easy option to reject.' });

  // 8. Services that may need a CASP licence (for the human review).
  const casp = home.text.match(/\b(?:we hold your (?:crypto|funds|assets)|custod(?:y|ial) (?:service|wallet)|buy (?:and sell )?crypto|exchange (?:crypto|your crypto)|crypto-to-(?:fiat|crypto)|trading platform|earn (?:yield|interest) on)\b/i);
  if (casp) findings.push({ level: 'info', title: 'Service that may need CASP authorisation', rule: 'MiCA Art. 59', fix: 'Custody, exchange, transfer or platform services for EU users usually require authorisation as a crypto-asset service provider. This needs a closer look.', quote: casp[0], context: snippet(home.text, casp.index, casp[0].length), page: home.url });

  const order = { high: 0, med: 1, info: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  return { findings, passed, tokenish };
}

async function scan(target, allowLocal) {
  const started = Date.now();
  let first;
  try { first = await fetchPage(target.href, allowLocal); }
  catch (e) { return { error: 'We could not reach that website. Check the address and try again.' }; }
  if (!first.html) return { error: `The website answered with ${first.status ? 'status ' + first.status : 'no readable page'}. Check the address and try again.` };

  const home = { kind: 'home', url: first.url, ...extract(first.html, first.url) };
  const found = findLinks(home.links, first.url);
  const pages = [home];
  const origin = new URL(first.url);

  const extras = ['terms', 'privacy', 'imprint']
    .filter((k) => found[k])
    .map((k) => ({ k, u: found[k] }))
    .filter(({ u }) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && baseDomain(x.hostname) === baseDomain(origin.hostname); } catch { return false; } });
  const got = await Promise.allSettled(extras.map(({ u }) => fetchPage(u, allowLocal)));
  got.forEach((g, i) => {
    if (g.status === 'fulfilled' && g.value.html) pages.push({ kind: extras[i].k, url: g.value.url, ...extract(g.value.html, g.value.url) });
  });

  const { findings, passed, tokenish } = runChecks(pages, found, first.html);
  const thin = home.text.length < 300;
  return {
    url: first.url,
    title: home.title.slice(0, 140),
    scannedAt: new Date().toISOString(),
    ms: Date.now() - started,
    pages: pages.map((p) => ({ kind: p.kind, url: p.url, chars: p.text.length })),
    links: found,
    tokenish,
    thin,
    notice: thin ? 'This page builds most of its text with JavaScript, so the scanner could read very little of it. Results are incomplete: paste your copy into the checker below, or ask for a full review.' : '',
    counts: {
      high: findings.filter((f) => f.level === 'high').length,
      med: findings.filter((f) => f.level === 'med').length,
      info: findings.filter((f) => f.level === 'info').length,
      passed: passed.length,
    },
    findings,
    passed,
    disclaimer: 'Automated, indicative check of public pages in English. It is not a review, legal advice or a certificate. A clean result does not mean the website complies.',
  };
}

async function handle(context, rawUrl) {
  const allowLocal = context.env && context.env.SCAN_ALLOW_LOCAL === '1';
  let target;
  try { target = normalise(rawUrl, allowLocal); } catch (e) { return json({ error: e.message }, 400); }

  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request('https://scan-cache.402scope.internal/?u=' + encodeURIComponent(target.href));
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) { const body = await hit.text(); return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-scan-cache': 'hit' } }); }
  }
  const result = await scan(target, allowLocal);
  if (result.error) return json(result, 422);
  const body = JSON.stringify(result);
  if (cache && context.waitUntil) {
    context.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_SECONDS}` } })));
  }
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export async function onRequestPost(context) {
  const type = context.request.headers.get('content-type') || '';
  let url = '';
  try {
    if (type.includes('application/json')) url = (await context.request.json()).url;
    else url = (await context.request.formData()).get('url');
  } catch { return json({ error: 'Send the address as JSON: {"url": "example.com"}.' }, 400); }
  return handle(context, url);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url).searchParams.get('url');
  if (!url) return json({ error: 'Add ?url=example.com or send a POST request.' }, 400);
  return handle(context, url);
}

export const _test = { normalise, extract, findLinks, runChecks, scan };
