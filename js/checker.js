/* Marketing copy checker: indicative keyword rules for EU crypto marketing. Runs locally. */
(() => {
  const RULES = [
    { re: /\bguarantee(?:d|s)?\b|\bassured returns?\b/gi, level: 'high', title: 'Return promised as certain', rule: 'MiCA Art. 7', fix: 'Say what can happen, not what will: rewards vary and can fall to zero.' },
    { re: /\b\d+(?:[.,]\d+)?\s?%\s?(?:apy|apr|yield|returns?|interest|profit|per (?:year|month|week|day)|a (?:year|month|day))\b/gi, level: 'high', title: 'Fixed return figure', rule: 'MiCA Art. 7', fix: 'Show how the figure is calculated, that it is variable and that past rates do not predict future ones.' },
    { re: /\b(?:risk[- ]?free|no risk|zero risk|without risk|can(?:no|')t lose|100% safe|completely safe|totally safe|safe investment)\b/gi, level: 'high', title: 'Risk denied', rule: 'MiCA Art. 7', fix: 'Replace with a plain risk statement: you can lose all the value of what you buy.' },
    { re: /\b(?:fully protected|100% protected|funds are protected|insured|covered by insurance|deposit guarantee|fdic)\b/gi, level: 'high', title: 'Protection overstated', rule: 'MiCA Art. 7 and Title IV', fix: 'Crypto-assets and e-money tokens are not bank deposits. Remove protection claims or state exactly what covers what.' },
    { re: /\b(?:no kyc|no id(?: needed| required)?|without (?:id|kyc|verification)|fully anonymous|anonymous (?:transfers?|payments?|trading))\b/gi, level: 'high', title: 'No-KYC promise', rule: 'Reg. (EU) 2023/1113 and EU AML rules', fix: 'Remove it. Service providers must identify customers and collect transfer data.' },
    { re: /\b(?:mica[- ]compliant|compliant with mica|fully compliant|regulated by|licensed by|approved by|authori[sz]ed by|eu[- ]regulated)\b/gi, level: 'med', title: 'Regulatory status claim', rule: 'MiCA Art. 7', fix: 'Only state an authorisation you hold, naming the authority and the register entry.' },
    { re: /\b(?:withdraw (?:any ?time|instantly|at any time)|instant withdrawals?|no lock[- ]?up)\b/gi, level: 'med', title: 'Liquidity promise', rule: 'MiCA Art. 7', fix: 'Check it against lock-ups, unbonding periods and limits, and state them next to the claim.' },
    { re: /\b(?:passive income|get rich|financial freedom|to the moon|moonshot|\d+x (?:gains?|returns?)|life[- ]changing)\b/gi, level: 'med', title: 'Hype language', rule: 'MiCA Art. 7', fix: 'Marketing must be fair, clear and not misleading. Describe the product, not the dream.' },
    { re: /\b(?:only \d+ (?:spots?|places?|seats?) left|last chance|ends (?:today|tonight)|limited time only|act now|don'?t miss out|fomo)\b/gi, level: 'med', title: 'Pressure tactic', rule: 'Directive 2005/29/EC', fix: 'Remove false urgency. If a limit is real, state it plainly with the date.' },
  ];
  const $ = (id) => document.getElementById(id);
  const input = $('copy');
  if (!input) return;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const check = () => {
    const text = input.value;
    const hits = [];
    RULES.forEach((r, i) => {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(text))) {
        if (!hits.some((h) => m.index < h.end && m.index + m[0].length > h.start)) {
          hits.push({ start: m.index, end: m.index + m[0].length, text: m[0], rule: r, id: i });
        }
        if (m[0].length === 0) r.re.lastIndex++;
      }
    });
    hits.sort((a, b) => a.start - b.start);

    let html = '', pos = 0;
    hits.forEach((h, n) => {
      html += esc(text.slice(pos, h.start)) + `<mark class="${h.rule.level}"><sup>${n + 1}</sup>${esc(h.text)}</mark>`;
      pos = h.end;
    });
    html += esc(text.slice(pos));
    $('check-preview').innerHTML = html || '<span class="muted">Paste some copy to check it.</span>';

    const notes = [];
    if (text.trim().length > 60 && !/not been reviewed or approved/i.test(text)) {
      notes.push({ level: 'med', title: 'Required statement not found', rule: 'MiCA Art. 7', fix: 'Crypto-asset marketing must say it has not been reviewed or approved by any competent authority in the EU.' });
    }
    if (text.trim().length > 60 && !/\b(?:risk|lose|loss)\b/i.test(text.replace(/risk[- ]?free|no risk|zero risk|without risk/gi, ''))) {
      notes.push({ level: 'med', title: 'No risk statement', rule: 'MiCA Art. 7', fix: 'Add a short, plain statement of the main risks near any call to action.' });
    }
    const items = hits.map((h, n) => ({ ...h.rule, quote: h.text, n: n + 1 })).concat(notes.map((x) => ({ ...x, quote: '' })));
    $('check-list').innerHTML = items.map((it) => `
      <li class="${it.level}">
        <div class="cl-head"><span class="lvl ${it.level}">${it.level === 'high' ? 'High' : 'Medium'}</span><b>${it.n ? it.n + '. ' : ''}${esc(it.title)}</b><span class="cl-rule">${esc(it.rule)}</span></div>
        ${it.quote ? `<p class="cl-quote">"${esc(it.quote)}"</p>` : ''}
        <p>${esc(it.fix)}</p>
      </li>`).join('');
    const high = items.filter((i) => i.level === 'high').length;
    const med = items.length - high;
    $('check-summary').innerHTML = text.trim()
      ? (items.length
          ? `<strong>${items.length} issue${items.length === 1 ? '' : 's'} found</strong><span class="lvl high">${high} high</span><span class="lvl med">${med} medium</span>`
          : '<strong>No flagged phrases</strong><span class="muted">That is a good start, not a clearance.</span>')
      : '';
    $('check-cta').hidden = !items.length;
  };

  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 250); });
  $('run-check').addEventListener('click', check);
  $('clear-check').addEventListener('click', () => { input.value = ''; check(); input.focus(); });
  check();
})();
