/* Website scanner (calls /api/scan on the live site) and the checker tabs. */
(() => {
  const $ = (id) => document.getElementById(id);

  // Tabs: Scan a website / Paste copy
  const tabs = [$('tool-scan'), $('tool-copy')].filter(Boolean);
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      select(tabs[(i + 1) % tabs.length], true);
    });
  });
  const toCopy = () => { if (tabs[1]) select(tabs[1]); const c = $('copy'); if (c) c.focus(); };

  const form = $('scan-form');
  if (!form) return;
  const input = $('scan-url');
  const btn = $('scan-run');
  const out = $('scan-output');
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = { high: 'High', med: 'Medium', info: 'Check' };
  const pageName = (u) => { try { const x = new URL(u); return x.pathname === '/' ? x.hostname : x.pathname; } catch { return ''; } };
  const btnHtml = btn.innerHTML;
  const mark = (f) => {
    const ctx = esc(f.context || f.quote), q = esc(f.quote);
    const i = ctx.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? ctx : ctx.slice(0, i) + `<mark class="${f.level}">` + ctx.slice(i, i + q.length) + '</mark>' + ctx.slice(i + q.length);
  };

  const reset = () => {
    $('scan-empty').hidden = true;
    ['scan-summary', 'scan-notice', 'scan-passed', 'scan-cta'].forEach((id) => { $(id).hidden = true; });
    $('scan-list').innerHTML = '';
  };

  const message = (html, withCopyLink) => {
    reset();
    const s = $('scan-summary');
    s.hidden = false;
    s.innerHTML = `<span class="scan-msg">${html}</span>`;
    if (withCopyLink) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-line'; b.textContent = 'Paste copy instead';
      b.addEventListener('click', toCopy);
      s.append(b);
    }
  };

  const render = (r) => {
    reset();
    const c = r.counts;
    const total = c.high + c.med;
    const s = $('scan-summary');
    s.hidden = false;
    s.innerHTML = `<strong>${total ? `${total} issue${total === 1 ? '' : 's'} found` : 'No flagged issues'}</strong>`
      + (c.high ? `<span class="lvl high">${c.high} high</span>` : '')
      + (c.med ? `<span class="lvl med">${c.med} medium</span>` : '')
      + (c.info ? `<span class="lvl info">${c.info} to check</span>` : '')
      + `<span class="scan-site">${esc(pageName(r.url))} · ${r.pages.length} page${r.pages.length === 1 ? '' : 's'} read</span>`;
    if (r.notice) { $('scan-notice').hidden = false; $('scan-notice').textContent = r.notice; }
    $('scan-list').innerHTML = r.findings.map((f) => `
      <li class="${f.level}">
        <div class="cl-head"><span class="lvl ${f.level}">${label[f.level] || ''}</span><b>${esc(f.title)}</b><span class="cl-rule">${esc(f.rule)}</span></div>
        ${f.quote ? `<p class="cl-quote">"${mark(f)}"</p>` : ''}
        <p>${esc(f.fix)}${f.page && pageName(f.page) !== pageName(r.url) ? ` <span class="cl-page">Found on ${esc(pageName(f.page))}.</span>` : ''}</p>
      </li>`).join('');
    if (r.passed && r.passed.length) {
      const d = $('scan-passed');
      d.hidden = false;
      d.querySelector('summary').textContent = `${r.passed.length} check${r.passed.length === 1 ? '' : 's'} passed`;
      d.querySelector('ul').innerHTML = r.passed.map((p) => `<li>${esc(p.title)} <span class="cl-rule">${esc(p.rule)}</span></li>`).join('');
    }
    $('scan-cta').hidden = false;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) { message('Enter your website address, for example <b>yourproject.io</b>.'); input.focus(); return; }
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    out.setAttribute('aria-busy', 'true');
    message('Reading your pages. This takes up to 20 seconds.');
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const type = res.headers.get('content-type') || '';
      if (!type.includes('application/json')) throw new Error('offline');
      const data = await res.json();
      if (!res.ok || data.error) message(esc(data.error || 'The scan did not finish. Try again in a minute.'), true);
      else render(data);
    } catch {
      message('The scanner runs on compliance.402scope.org and is not available here. You can still paste your copy.', true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = btnHtml;
      out.setAttribute('aria-busy', 'false');
    }
  });
})();
