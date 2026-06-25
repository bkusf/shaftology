/* ============================================================================
   SHAFTOLOGY — app logic
   ========================================================================== */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = { mfr: '', modelId: '', weight: '', flex: '', selected: null };

  /* ---------- header counts ---------- */
  const MFRS = [...new Set(SHAFTS.map(s => s.mfr))].sort();
  $('#kpi-shafts').textContent = SHAFTS.length;
  $('#kpi-mfrs').textContent = MFRS.length;

  /* ====================================================================
     VISUALS — colour helpers + hover product-photo popover
     ==================================================================== */
  const imgOf   = id => (typeof SHAFT_IMAGES !== 'undefined') ? SHAFT_IMAGES[id] : null;
  const colorOf = id => ((typeof SHAFT_COLORS !== 'undefined') && SHAFT_COLORS[id]) || '#7a8580';
  const specOf  = id => (typeof SHAFT_SPECS !== 'undefined') ? SHAFT_SPECS[id] : null;

  // exact torque for a selected (weight, flex); falls back to same flex @ nearest
  // weight, then null (caller shows the representative ~value)
  function torqueAt(id, weight, flex) {
    const m = (typeof SHAFT_TORQUE !== 'undefined') && SHAFT_TORQUE[id];
    if (!m) return null;
    const w = String(weight);
    if (m[w] && m[w][flex] != null) return m[w][flex];
    const ws = Object.keys(m).filter(k => m[k][flex] != null);
    if (ws.length) {
      const tw = Number(weight);
      const near = ws.reduce((a, b) => Math.abs(+b - tw) < Math.abs(+a - tw) ? b : a);
      return m[near][flex];
    }
    return null;
  }
  // "3.2°" when exact for the build, else "~3.2°" (representative)
  function torqueLabel(s, weight, flex) {
    const t = torqueAt(s.id, weight, flex);
    return t != null ? t.toFixed(1) + '°' : '~' + s.torque.toFixed(1) + '°';
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = v => Math.max(0, Math.min(255, v));
    return `rgb(${clamp((n >> 16) + amt)},${clamp(((n >> 8) & 255) + amt)},${clamp((n & 255) + amt)})`;
  }

  const pop = $('#img-pop');
  function swatchMarkup(s, caption) {
    const c = colorOf(s.id);
    return `<div class="ip-swatch" style="background:linear-gradient(150deg, ${c}, ${shade(c, -34)})">` +
           `<span>${s.model}</span></div><div class="ip-cap">${caption}</div>`;
  }
  function showPhoto(id, e) {
    const s = SHAFTS.find(x => x.id === id); if (!s) return;
    const url = imgOf(id);
    if (url) {
      pop.innerHTML = `<img class="ip-img" src="${url}" alt="${s.model}">` +
                      `<div class="ip-cap"><b>${s.mfr}</b> · ${s.model}</div>`;
      pop.querySelector('.ip-img').addEventListener('error', () => {
        pop.innerHTML = swatchMarkup(s, 'colour reference · photo unavailable');
      });
    } else {
      pop.innerHTML = swatchMarkup(s, 'colour reference · no photo on file');
    }
    movePhoto(e);
    pop.classList.add('show');
  }
  function movePhoto(e) {
    const w = 250, h = 305;
    let x = e.clientX + 20, y = e.clientY - 60;
    if (x + w > window.innerWidth) x = e.clientX - w - 20;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 12;
    if (y < 12) y = 12;
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function hidePhoto() { pop.classList.remove('show'); }
  function bindPhoto(el, id) {
    el.addEventListener('mouseenter', e => showPhoto(id, e));
    el.addEventListener('mousemove', movePhoto);
    el.addEventListener('mouseleave', hidePhoto);
  }
  // small photo-icon affordance for a card (the ONLY hover target that shows the photo)
  function photoBtn(s) {
    return `<button class="card-photo" type="button" tabindex="-1" aria-label="View ${s.model} photo">` +
           `<span class="cp-dot" style="background:${colorOf(s.id)}"></span>` +
           `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.1"/><path d="M8 7l1.4-2.2h5.2L16 7"/></svg>` +
           `</button>`;
  }
  // wire the photo icon inside a card; everything else on the card no longer triggers the photo
  function bindCardPhoto(card, id) {
    const pb = card.querySelector('.card-photo');
    if (pb) bindPhoto(pb, id);
  }

  /* ====================================================================
     SIMILARITY ENGINE
     ==================================================================== */
  // profile distance over weighted features (lower = more alike)
  function profileDistance(a, b) {
    let sum = 0;
    for (const k in FEATURE_WEIGHTS) {
      const d = (a[k] - b[k]);
      sum += FEATURE_WEIGHTS[k] * d * d;
    }
    return Math.sqrt(sum);
  }

  // nearest available class weight to a target
  function nearestWeight(shaft, target) {
    if (!target) return shaft.weights[Math.floor(shaft.weights.length / 2)];
    return shaft.weights.reduce((best, w) =>
      Math.abs(w - target) < Math.abs(best - target) ? w : best, shaft.weights[0]);
  }

  // overall match score 0–100 for `cand` vs the selected `base` build
  function matchScore(base, cand, targetWeight) {
    const pd = profileDistance(base, cand);                 // ~0 (same) … ~8 (very diff)
    const wGap = Math.abs(nearestWeight(cand, targetWeight) - targetWeight);
    const wPenalty = (wGap / 10) * 0.55;                    // 10g ≈ 0.55 distance units
    const flexPenalty = cand.flexes.includes(state.flex) ? 0 : 0.4;
    const d = pd + wPenalty + flexPenalty;
    // map distance → percentage with a smooth falloff
    const pct = 100 * Math.exp(-d / 3.0);
    return Math.max(35, Math.min(99, Math.round(pct)));
  }

  // human-readable spec deltas between base and candidate
  const DELTA_FIELDS = [
    { k: 'launch', label: 'launch', higherWord: ['lower','higher'] },
    { k: 'spin',   label: 'spin',   higherWord: ['lower','higher'] },
    { k: 'tip',    label: 'tip',    higherWord: ['softer','stiffer'] },
    { k: 'stability', label: 'stability', higherWord: ['less','more'] },
    { k: 'feel',   label: 'feel',   higherWord: ['firmer','smoother'] },
  ];
  function topDeltas(base, cand, n = 3) {
    return DELTA_FIELDS
      .map(f => ({ ...f, diff: cand[f.k] - base[f.k] }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, n)
      .map(f => {
        if (f.diff === 0) return { txt: 'same ' + f.label, cls: 'same', arrow: '=' };
        const up = f.diff > 0;
        return {
          txt: f.higherWord[up ? 1 : 0] + ' ' + f.label,
          cls: up ? 'up' : 'down',
          arrow: up ? '▲' : '▼',
        };
      });
  }

  /* ====================================================================
     SELECTION CASCADE
     ==================================================================== */
  const selMfr = $('#sel-mfr'), selModel = $('#sel-model'),
        selWeight = $('#sel-weight'), selFlex = $('#sel-flex'),
        applyBtn = $('#apply-btn');

  MFRS.forEach(m => selMfr.add(new Option(m, m)));

  selMfr.addEventListener('change', () => {
    state.mfr = selMfr.value; state.modelId = state.weight = state.flex = '';
    resetSelect(selModel, 'Select a model…');
    resetSelect(selWeight, '—'); resetSelect(selFlex, '—');
    if (!state.mfr) { selModel.disabled = true; refreshApply(); return; }
    SHAFTS.filter(s => s.mfr === state.mfr)
      .forEach(s => selModel.add(new Option(s.model, s.id)));
    selModel.disabled = false;
    refreshApply();
  });

  selModel.addEventListener('change', () => {
    state.modelId = selModel.value; state.weight = state.flex = '';
    resetSelect(selWeight, '—'); resetSelect(selFlex, '—');
    const shaft = SHAFTS.find(s => s.id === state.modelId);
    if (!shaft) { selWeight.disabled = selFlex.disabled = true; refreshApply(); return; }
    shaft.weights.forEach(w => selWeight.add(new Option(w + 'g', w)));
    shaft.flexes.forEach(f => selFlex.add(new Option(f, f)));
    selWeight.disabled = selFlex.disabled = false;
    refreshApply();
  });

  selWeight.addEventListener('change', () => { state.weight = selWeight.value; refreshApply(); });
  selFlex.addEventListener('change',   () => { state.flex   = selFlex.value;   refreshApply(); });

  function resetSelect(sel, placeholder) {
    sel.innerHTML = ''; sel.add(new Option(placeholder, '')); sel.value = '';
  }
  function refreshApply() {
    applyBtn.disabled = !(state.mfr && state.modelId && state.weight && state.flex);
  }

  applyBtn.addEventListener('click', analyze);

  /* ====================================================================
     ANALYZE → render profile + recommendations
     ==================================================================== */
  function analyze() {
    const shaft = SHAFTS.find(s => s.id === state.modelId);
    if (!shaft) return;
    state.selected = shaft;

    renderProfile(shaft);
    renderRecos();

    $('#result').hidden = false;
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderProfile(s) {
    $('#p-mfr').textContent = s.mfr + (s.gen ? ' · ' + s.gen : '');
    $('#p-model').textContent = s.model;
    $('#p-build').textContent =
      `${state.weight}g  ·  ${state.flex} flex  ·  ${torqueLabel(s, state.weight, state.flex)} torque  ·  ${s.year}`;
    $('#p-blurb').textContent = s.blurb;
    $('#p-tags').innerHTML = s.tags.map(t => `<span class="tag">${t}</span>`).join('');

    renderSpecsRow(s);
    $('#p-photo-label').textContent = imgOf(s.id) ? 'Hover for photo' : 'No photo · colour ref';

    renderSpecStrip(s);
    drawRadar(s);
    drawBend(s);
  }

  /* ---------- verified / estimated spec row ---------- */
  const CHECK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
  function renderSpecsRow(s) {
    const sp = specOf(s.id);
    const el = $('#p-specs');
    if (sp) {
      const fields = [['Length', sp.length], ['Weight', sp.weight], ['Torque', sp.torque],
                      ['Tip', sp.tip], ['Butt', sp.butt], ['Launch', sp.launch], ['Spin', sp.spin]];
      el.innerHTML =
        `<span class="verified-badge">${CHECK} Verified specs</span>` +
        fields.filter(f => f[1] && f[1] !== '—')
              .map(f => `<span class="spec-pill"><b>${f[0]}</b>${f[1]}</span>`).join('') +
        (sp.note ? `<span class="spec-pill">${sp.note}</span>` : '');
    } else {
      el.innerHTML =
        `<span class="verified-badge est">Relative profile · est.</span>` +
        `<span class="spec-pill"><b>Torque</b>~${s.torque.toFixed(1)}°</span>` +
        `<span class="spec-pill"><b>Weights</b>${s.weights[0]}–${s.weights[s.weights.length - 1]}g</span>` +
        `<span class="spec-pill"><b>Flex</b>${s.flexes.join(' · ')}</span>`;
    }
  }

  /* ---------- spec strip ---------- */
  const SPECS = [
    { k: 'launch', label: 'Launch' },
    { k: 'spin',   label: 'Spin' },
    { k: 'tip',    label: 'Tip Stiff' },
    { k: 'stability', label: 'Stability' },
    { k: 'feel',   label: 'Smoothness' },
    { k: 'balance', label: 'Balance' },
  ];
  const WORD5 = ['Very Low','Low','Mid','High','Very High'];
  function word(v) { return WORD5[Math.round(v) - 1] || 'Mid'; }

  function renderSpecStrip(s) {
    $('#spec-strip').innerHTML = SPECS.map(spec => `
      <div class="spec">
        <span class="s-label">${spec.label}</span>
        <div class="s-val">${s[spec.k]}<span class="s-unit">/5</span></div>
        <div class="s-bar"><span data-w="${(s[spec.k] / 5) * 100}"></span></div>
      </div>`).join('');
    // animate bars
    requestAnimationFrame(() => $$('#spec-strip .s-bar > span')
      .forEach(b => b.style.width = b.dataset.w + '%'));
  }

  /* ---------- radar chart ---------- */
  const RC = { cx: 160, cy: 160, r: 118, n: RADAR_AXES.length };
  function radarPoint(i, val) {            // val 0..5
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI / RC.n);
    const rr = (val / 5) * RC.r;
    return [RC.cx + rr * Math.cos(ang), RC.cy + rr * Math.sin(ang)];
  }
  function polygon(shaft, cls, dots) {
    const pts = RADAR_AXES.map((ax, i) => radarPoint(i, shaft[ax.key]));
    const path = `<polygon class="${cls}" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/>`;
    const circles = dots ? pts.map(p =>
      `<circle class="radar-you-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`).join('') : '';
    return path + circles;
  }
  function drawRadar(s, alt) {
    let g = '';
    // concentric rings
    for (let ring = 1; ring <= 5; ring++) {
      const pts = RADAR_AXES.map((_, i) => radarPoint(i, ring));
      g += `<polygon class="radar-grid" points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}"/>`;
    }
    // spokes + labels
    RADAR_AXES.forEach((ax, i) => {
      const [x, y] = radarPoint(i, 5);
      g += `<line class="radar-spoke" x1="${RC.cx}" y1="${RC.cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
      const [lx, ly] = radarPoint(i, 5.75);
      const anchor = Math.abs(lx - RC.cx) < 2 ? 'middle' : (lx > RC.cx ? 'start' : 'end');
      g += `<text class="radar-axis-label" x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="${anchor}">${ax.label}</text>`;
    });
    if (alt) g += polygon(alt, 'radar-alt', false);
    g += polygon(s, 'radar-you', true);
    $('#radar').innerHTML = g;
  }

  /* ---------- bend profile ---------- */
  // draws a smooth spine whose thickness/curve reflects butt→mid→tip stiffness
  function drawBend(s) {
    const W = 600, H = 120, midY = 60;
    // stiffness samples (butt, mid, tip) → deflection: stiffer = flatter
    const nodes = [
      { x: 20,  stiff: s.butt },
      { x: 300, stiff: s.mid },
      { x: 580, stiff: s.tip },
    ];
    // deflection amplitude: softer (low stiff) = more bend downward toward tip
    const ampFor = st => (5 - st) * 7;       // 0..28px
    const yFor = (x, st) => {
      const t = x / W;                       // 0 butt → 1 tip
      return midY + ampFor(st) * t * 1.0;
    };
    const p0 = [nodes[0].x, yFor(nodes[0].x, nodes[0].stiff)];
    const p1 = [nodes[1].x, yFor(nodes[1].x, nodes[1].stiff)];
    const p2 = [nodes[2].x, yFor(nodes[2].x, nodes[2].stiff)];
    const spine =
      `M ${p0[0]} ${p0[1]} Q ${(p0[0]+p1[0])/2} ${p0[1]} ${p1[0]} ${p1[1]} ` +
      `Q ${(p1[0]+p2[0])/2} ${p1[1]} ${p2[0]} ${p2[1]}`;

    // tapering shaft body (top + bottom edges)
    const buttR = 14, tipR = 5;
    const topEdge = `M 20 ${midY - buttR} L 580 ${midY - tipR}`;
    const botEdge = `M 20 ${midY + buttR} L 580 ${midY + tipR}`;

    // section markers
    const dots = nodes.map((n, i) => {
      const y = yFor(n.x, n.stiff);
      const cls = i === 0 ? 'bend-dot-butt' : 'bend-dot-tip';
      return `<circle class="${cls}" cx="${n.x}" cy="${y.toFixed(1)}" r="4"/>` +
             `<text class="bend-num" x="${n.x}" y="${(y-12).toFixed(1)}" text-anchor="middle">${n.stiff}/5</text>`;
    }).join('');

    $('#bend-svg').innerHTML = `
      <path class="bend-body" d="${topEdge} L 580 ${midY + tipR} L 20 ${midY + buttR} Z"/>
      <path class="bend-edge" d="${topEdge}"/>
      <path class="bend-edge" d="${botEdge}"/>
      <path class="bend-spine" d="${spine}" stroke-dasharray="900" stroke-dashoffset="900">
        <animate attributeName="stroke-dashoffset" from="900" to="0" dur="0.9s" fill="freeze"
                 calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/>
      </path>
      ${dots}`;

    $('#bend-summary').textContent =
      `butt ${word(s.butt).toLowerCase()} · mid ${word(s.mid).toLowerCase()} · tip ${word(s.tip).toLowerCase()}`;
  }

  /* ====================================================================
     RECOMMENDATIONS
     ==================================================================== */
  $('#cross-only').addEventListener('change', renderRecos);

  function renderRecos() {
    const base = state.selected;
    if (!base) return;
    const crossOnly = $('#cross-only').checked;
    const target = Number(state.weight);

    const ranked = SHAFTS
      .filter(s => s.id !== base.id)
      .filter(s => !crossOnly || s.mfr !== base.mfr)
      .map(s => ({ shaft: s, score: matchScore(base, s, target) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    $('#reco-grid').innerHTML = ranked.map(({ shaft: s, score }, idx) => {
      const w = nearestWeight(s, target);
      const flexOk = s.flexes.includes(state.flex);
      const deltas = topDeltas(base, s);
      return `
      <article class="reco-card" data-id="${s.id}" style="animation-delay:${idx * 55}ms">
        <div class="reco-top">
          <div>
            <div class="reco-mfr-row"><span class="reco-mfr">${s.mfr}</span>${photoBtn(s)}</div>
            <div class="reco-name">${s.model}</div>
          </div>
          <div class="match-badge"><b>${score}<span style="font-size:0.7rem">%</span></b><i>match</i></div>
        </div>
        <div class="reco-meta">${w}g · ${torqueLabel(s, w, state.flex)} · ${flexOk ? state.flex + ' avail' : 'no ' + state.flex} · $${s.price}</div>
        <div class="reco-diff">
          ${deltas.map(d => `<span class="diff-pill ${d.cls}">${d.arrow} ${d.txt}</span>`).join('')}
        </div>
        <div class="reco-bar"><span data-w="${score}"></span></div>
      </article>`;
    }).join('');

    // animate match bars
    requestAnimationFrame(() => $$('#reco-grid .reco-bar > span')
      .forEach(b => b.style.width = b.dataset.w + '%'));

    // hover → overlay on radar; click → load into bench
    $$('#reco-grid .reco-card').forEach(card => {
      const s = SHAFTS.find(x => x.id === card.dataset.id);
      card.addEventListener('mouseenter', () => {
        drawRadar(base, s);
        $('#radar-alt-name').textContent = s.model;
      });
      card.addEventListener('mouseleave', () => {
        drawRadar(base);
        $('#radar-alt-name').textContent = 'hover an alternative';
      });
      card.addEventListener('click', () => loadShaft(s));
      bindCardPhoto(card, s.id);   // photo shows only when hovering the photo icon
    });
  }

  /* load a shaft into the bench (from reco or library click) */
  function loadShaft(s) {
    selMfr.value = s.mfr; selMfr.dispatchEvent(new Event('change'));
    selModel.value = s.id; selModel.dispatchEvent(new Event('change'));
    // keep weight/flex near previous pick if possible
    const w = nearestWeight(s, Number(state.weight) || s.weights[0]);
    selWeight.value = String(w); state.weight = String(w);
    const flex = s.flexes.includes(state.flex) ? state.flex : s.flexes[Math.min(1, s.flexes.length - 1)];
    selFlex.value = flex; state.flex = flex;
    refreshApply();
    analyze();
  }

  /* ====================================================================
     GOAL FINDER — rank shafts by a target flight window
     ==================================================================== */
  function readGoals() {
    const g = {};
    $$('#finder .goal-group').forEach(grp => {
      const on = grp.querySelector('button.on');
      g[grp.dataset.goal] = on ? on.dataset.val : 'any';
    });
    return g;
  }

  $$('#finder .seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    });
  });

  $('#finder-btn').addEventListener('click', findByGoal);

  function findByGoal() {
    const g = readGoals();
    const tL = { low: 1.7, mid: 3, high: 4.3 }[g.launch];
    const tS = { low: 1.7, mid: 3, high: 4.3 }[g.spin];
    const tW = { light: 47, mid: 62, heavy: 75, any: null }[g.weight];

    const ranked = SHAFTS.map(s => {
      let d = 1.35 * (s.launch - tL) ** 2 + 1.35 * (s.spin - tS) ** 2;
      if (g.feel === 'smooth')     d += 0.8 * (s.feel - 4.7) ** 2;
      else if (g.feel === 'stout') d += 0.6 * (s.feel - 2.2) ** 2 + 0.5 * (s.stability - 4.6) ** 2 + 0.4 * (s.tip - 4.3) ** 2;
      if (tW != null) d += Math.pow(Math.abs(nearestWeight(s, tW) - tW) / 11, 2);
      const pct = Math.max(42, Math.min(99, Math.round(100 * Math.exp(-Math.sqrt(d) / 1.85))));
      return { shaft: s, score: pct };
    }).sort((a, b) => b.score - a.score).slice(0, 8);

    renderFinder(ranked);
  }

  function renderFinder(ranked) {
    $('#finder-grid').innerHTML = ranked.map(({ shaft: s, score }, idx) => {
      const w = s.weights[Math.floor(s.weights.length / 2)];
      const ver = specOf(s.id) ? `<span class="diff-pill same">${CHECK} verified</span>` : '';
      return `
      <article class="reco-card" data-id="${s.id}" style="animation-delay:${idx * 55}ms">
        <div class="reco-top">
          <div><div class="reco-mfr-row"><span class="reco-mfr">${s.mfr}</span>${photoBtn(s)}</div><div class="reco-name">${s.model}</div></div>
          <div class="match-badge"><b>${score}<span style="font-size:0.7rem">%</span></b><i>fit</i></div>
        </div>
        <div class="reco-meta">${w}g · ~${s.torque.toFixed(1)}° · ${s.flexes.join('/')} · $${s.price}</div>
        <div class="reco-diff">
          <span class="diff-pill">${word(s.launch)} launch</span>
          <span class="diff-pill">${word(s.spin)} spin</span>
          <span class="diff-pill">${word(s.feel)} feel</span>
          ${ver}
        </div>
        <div class="reco-bar"><span data-w="${score}"></span></div>
      </article>`;
    }).join('');

    requestAnimationFrame(() => $$('#finder-grid .reco-bar > span')
      .forEach(b => b.style.width = b.dataset.w + '%'));

    $$('#finder-grid .reco-card').forEach(card => {
      const s = SHAFTS.find(x => x.id === card.dataset.id);
      bindCardPhoto(card, s.id);
      card.addEventListener('click', () => loadShaft(s));
    });
  }

  /* profile-card photo chip → focused shaft's photo on hover */
  (function () {
    const pchip = $('#p-photo');
    pchip.addEventListener('mouseenter', e => { if (state.selected) showPhoto(state.selected.id, e); });
    pchip.addEventListener('mousemove', movePhoto);
    pchip.addEventListener('mouseleave', hidePhoto);
  })();

  /* ====================================================================
     THEME TOGGLE (light / dark) — palette is pure CSS via [data-theme]
     ==================================================================== */
  (function () {
    const root = document.documentElement;
    $('#theme-toggle').addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('shaftology-theme', next); } catch (e) {}
      if (state.selected) drawBend(state.selected);   // replay the spine draw in new colours
    });
  })();

  /* ====================================================================
     METHODOLOGY MODAL (profile-DNA info)
     ==================================================================== */
  (function () {
    const modal = $('#dna-modal');
    const onKey = e => { if (e.key === 'Escape') close(); };
    function open() {
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
    }
    function close() {
      modal.hidden = true;
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }
    $('#dna-info').addEventListener('click', open);
    $('#dna-modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  })();

  /* ====================================================================
     LIBRARY / VAULT
     ==================================================================== */
  let libFilter = 'All';
  function buildFilters() {
    const cats = ['All', ...MFRS];
    $('#lib-filters').innerHTML = cats.map(c =>
      `<button class="chip${c === libFilter ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('');
    $$('#lib-filters .chip').forEach(ch => ch.addEventListener('click', () => {
      libFilter = ch.dataset.cat; buildFilters(); renderLibrary();
    }));
  }

  function miniBars(s) {
    return SPECS.map(spec =>
      `<span style="height:${(s[spec.k] / 5) * 100}%" data-tip="${spec.label} · ${s[spec.k]}/5"></span>`).join('');
  }

  function renderLibrary() {
    const list = SHAFTS.filter(s => libFilter === 'All' || s.mfr === libFilter);
    $('#lib-grid').innerHTML = list.map((s, i) => `
      <article class="lib-card" data-id="${s.id}" style="animation:rise .4s ${i * 25}ms both">
        <div class="lc-mfr-row"><span class="lc-mfr">${s.mfr}</span>${photoBtn(s)}</div>
        <div class="lc-name">${s.model}</div>
        <div class="lc-tags">${s.tags.join('  ·  ')}</div>
        <div class="lc-mini">${miniBars(s)}</div>
        <div class="lc-foot">
          <span class="lc-load">${word(s.launch)} launch · ${word(s.spin)} spin</span>
          <span>${s.weights[0]}–${s.weights[s.weights.length-1]}g</span>
        </div>
      </article>`).join('');
    $$('#lib-grid .lib-card').forEach(card => {
      const s = SHAFTS.find(x => x.id === card.dataset.id);
      bindCardPhoto(card, s.id);
      card.addEventListener('click', () => loadShaft(s));
    });
  }

  buildFilters();
  renderLibrary();
})();
