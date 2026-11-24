// Strength page: reads strength.json (converted from a Crimpd export by tools/crimpd_import.py).
// Loads are ADDED weight in lb. Targets below are working numbers: edit them as you progress.

const BENCH = [
  { key: 'maxhang', label: 'Max hang, 20mm', unit: 'lb', target: 55, note: '~10 s, added weight' },
  { key: 'repeat', label: '7:3 repeaters, 20mm', unit: 'lb', target: 20, note: 'added weight' },
  { key: 'pullup', label: 'Weighted pull-up', unit: 'lb', target: 50, note: '≤3 reps, added weight' },
  { key: 'board', label: 'Board, hardest', unit: 'V', target: 7, note: 'problem sent in a session' }
];
const RECENT_DAYS = 365;          // "current" best looks back this far
const TYPES = ['Strength & Power', 'Power Endurance', 'Endurance', 'Conditioning & Mobility'];

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const parse = d3.timeParse('%Y-%m-%d');
const fmt = d3.timeFormat('%b %-d, %Y');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tip = d3.select('body').append('div').attr('class', 'tip');
const showTip = (ev, html) => tip.html(html).style('display', 'block')
  .style('left', Math.min(ev.clientX + 12, innerWidth - 270) + 'px').style('top', ev.clientY + 12 + 'px');
const hideTip = () => tip.style('display', 'none');

// One measurement per session for each benchmark
function measures(s) {
  const out = {};
  for (const e of s.ex) {
    const edge20 = /20mm/.test(e.n);
    if (edge20 && e.load != null && e.work && e.work <= 12) out.maxhang = Math.max(out.maxhang ?? -Infinity, e.load);
    if (edge20 && e.load != null && /7:3/.test(s.name)) out.repeat = Math.max(out.repeat ?? -Infinity, e.load);
    if (/^Pull-up/.test(e.n) && e.load != null && e.loadReps <= 3) out.pullup = Math.max(out.pullup ?? -Infinity, e.load);
    if (/Board/i.test(s.name) && e.vmax != null) out.board = Math.max(out.board ?? -Infinity, e.vmax);
  }
  return out;
}

d3.json('strength.json').then(data => {
  const sessions = data.sessions.map(s => ({ ...s, d: parse(s.date), m: measures(s) }));
  benchmarks(sessions);
  fingers(sessions);
  weekly(sessions);
  board(sessions);
  tests(sessions);
  log(sessions, data.updated);
});

function benchmarks(sessions) {
  const since = d3.timeDay.offset(new Date(), -RECENT_DAYS);
  const rows = BENCH.map(b => {
    const hits = sessions.filter(s => s.m[b.key] != null);
    const all = d3.greatest(hits, s => s.m[b.key]);
    const recent = d3.greatest(hits.filter(s => s.d >= since), s => s.m[b.key]);
    const last = hits[hits.length - 1];
    return { b, all, recent, last };
  });
  const show = (b, v) => b.unit === 'V' ? 'V' + v : (v > 0 ? '+' : '') + v + ' lb';
  d3.select('#bench').selectAll('.tile').data(rows).join('div').attr('class', 'tile').html(({ b, all, recent, last }) => {
    const cur = recent ? recent.m[b.key] : null;
    const stale = cur == null && all;
    const pct = cur == null ? 0 : Math.max(0, Math.min(100, 100 * cur / b.target));
    return `<div class="k">${b.label}</div>
      <div class="v">${cur == null ? '—' : show(b, cur)}<small>/ ${show(b, b.target)}</small></div>
      ${stale ? `<div class="s">not tested in the last ${RECENT_DAYS / 365 > 1 ? RECENT_DAYS + ' days' : 'year'}</div>` : ''}
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="s">best ever ${all ? show(b, all.m[b.key]) + ' (' + all.d.getFullYear() + ')' : '—'} · last ${last ? fmt(last.d) : '—'}</div>`;
  });
}

function fingers(sessions) {
  const el = document.getElementById('fingers');
  const series = [
    { key: 'maxhang', name: 'Max hangs (~10 s)', color: css('--c0') },
    { key: 'repeat', name: '7:3 repeaters', color: css('--c2') }
  ];
  const pts = series.flatMap(sr => sessions.filter(s => s.m[sr.key] != null).map(s => ({ sr, s, v: s.m[sr.key] })));
  const W = 1000, H = 280, m = { t: 12, r: 12, b: 26, l: 40 };
  const x = d3.scaleTime().domain(d3.extent(pts, p => p.s.d)).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([Math.min(-5, d3.min(pts, p => p.v)), Math.max(60, d3.max(pts, p => p.v) + 5)]).nice().range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d => (d > 0 ? '+' : '') + d));
  svg.append('g').selectAll('line').data(y.ticks(6)).join('line').attr('x1', m.l).attr('x2', W - m.r)
    .attr('y1', y).attr('y2', y).attr('stroke', css('--line')).attr('stroke-dasharray', '2 4');
  const tgt = BENCH[0].target;
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(tgt)).attr('y2', y(tgt)).attr('stroke', css('--c3')).attr('stroke-dasharray', '6 4');
  svg.append('text').attr('x', W - m.r).attr('y', y(tgt) - 5).attr('text-anchor', 'end').style('fill', css('--c3')).text(`max-hang target +${tgt} lb`);
  for (const sr of series) {
    const p = pts.filter(q => q.sr === sr);
    // running best line
    let best = -Infinity;
    const run = p.map(q => ({ d: q.s.d, v: (best = Math.max(best, q.v)) }));
    svg.append('path').datum(run).attr('fill', 'none').attr('stroke', sr.color).attr('stroke-opacity', 0.45).attr('stroke-width', 1.5)
      .attr('d', d3.line().curve(d3.curveStepAfter).x(d => x(d.d)).y(d => y(d.v)));
    svg.append('g').selectAll('circle').data(p).join('circle').attr('cx', q => x(q.s.d)).attr('cy', q => y(q.v)).attr('r', 3.5)
      .attr('fill', sr.color)
      .on('mousemove', (ev, q) => showTip(ev, `<b>${esc(q.s.name)}</b><br>${fmt(q.s.d)} · ${q.v > 0 ? '+' : ''}${q.v} lb`))
      .on('mouseleave', hideTip);
  }
  d3.select(el).append('div').attr('class', 'legend')
    .html(series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('') + '<span>line = running best</span>');
}

function weekly(sessions) {
  const el = document.getElementById('weekly');
  const end = d3.timeWeek.ceil(new Date()), start = d3.timeWeek.offset(end, -52);
  const weeks = d3.timeWeek.range(start, end);
  const colors = Object.fromEntries(TYPES.map((t, i) => [t, css(['--c0', '--c3', '--c2', '--c4'][i])]));
  const rows = weeks.map(w => {
    const v = sessions.filter(s => +d3.timeWeek(s.d) === +w);
    return { w, ...Object.fromEntries(TYPES.map(t => [t, v.filter(s => s.type === t).length])) };
  });
  const W = 500, H = 220, m = { t: 8, r: 6, b: 24, l: 26 };
  const x = d3.scaleBand().domain(weeks).range([m.l, W - m.r]).padding(0.2);
  const y = d3.scaleLinear().domain([0, Math.max(3, d3.max(rows, r => d3.sum(TYPES, t => r[t])))]).nice().range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickValues(weeks.filter((w, i) => i % 8 === 0)).tickFormat(d3.timeFormat('%b')));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(y.domain()[1]).tickFormat(d3.format('d')));
  svg.append('g').selectAll('g').data(d3.stack().keys(TYPES)(rows)).join('g').attr('fill', d => colors[d.key])
    .selectAll('rect').data(d => d.map(p => Object.assign(p, { key: d.key }))).join('rect')
    .attr('x', p => x(p.data.w)).attr('width', x.bandwidth()).attr('y', p => y(p[1])).attr('height', p => y(p[0]) - y(p[1]))
    .on('mousemove', (ev, p) => showTip(ev, `Week of ${fmt(p.data.w)}<br>${TYPES.filter(t => p.data[t]).map(t => `${t}: ${p.data[t]}`).join('<br>') || 'none'}`))
    .on('mouseleave', hideTip);
  d3.select(el).append('div').attr('class', 'legend').html(TYPES.map(t => `<span><i style="background:${colors[t]}"></i>${t}</span>`).join(''));
}

function board(sessions) {
  const el = document.getElementById('board');
  const pts = sessions.filter(s => s.m.board != null);
  if (!pts.length) { el.textContent = 'No board sessions logged yet.'; return; }
  const W = 500, H = 220, m = { t: 8, r: 10, b: 24, l: 30 };
  const x = d3.scaleTime().domain(d3.extent(pts, s => s.d)).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([0, Math.max(BENCH[3].target, d3.max(pts, s => s.m.board)) + 0.5]).range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(8).tickFormat(d => 'V' + d));
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(BENCH[3].target)).attr('y2', y(BENCH[3].target))
    .attr('stroke', css('--c3')).attr('stroke-dasharray', '6 4');
  svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', s => x(s.d)).attr('cy', s => y(s.m.board)).attr('r', 4.5)
    .attr('fill', css('--c2'))
    .on('mousemove', (ev, s) => showTip(ev, `<b>${esc(s.name)}</b><br>${fmt(s.d)} · top V${s.m.board} · ${s.min} min`))
    .on('mouseleave', hideTip);
}

function tests(sessions) {
  const t = sessions.filter(s => /test/i.test(s.name)).reverse();
  const result = s => {
    const parts = [];
    for (const e of s.ex) {
      if (e.load != null) parts.push(`${e.n.replace('Dead Hang: ', '')}: ${e.load > 0 ? '+' : ''}${e.load} lb${e.loadReps > 1 ? ' × ' + e.loadReps : ''}`);
      else if (e.vmax != null) parts.push(`${e.n}: V${e.vmax}`);
      else parts.push(`${e.n}: ${e.sets} sets`);
    }
    return parts.join(' · ');
  };
  d3.select('#tests').html('<tr><th>Date</th><th>Test</th><th>Top result</th></tr>' +
    t.map(s => `<tr><td>${fmt(s.d)}</td><td>${esc(s.name)}</td><td>${esc(result(s))}</td></tr>`).join(''));
}

function log(sessions, updated) {
  const recent = sessions.slice(-20).reverse();
  d3.select('#logsub').text(`latest 20 of ${sessions.length} · export from ${updated}`);
  const chip = e => {
    const parts = [e.n.replace('Dead Hang: ', '')];
    if (e.load != null) parts.push(`${e.load > 0 ? '+' : ''}${e.load} lb`);
    if (e.vmax != null) parts.push(`top V${e.vmax}`);
    if (/boulder/i.test(e.n)) parts.push(`${e.sets === 1 ? e.reps : e.sets} problems`);
    else if (/hang|edge/i.test(e.n) && e.work) parts.push(`${e.sets}×${e.work}s`);
    else if (e.reps > e.sets && e.reps % e.sets === 0) parts.push(`${e.sets}×${e.reps / e.sets}`);
    else parts.push(`${e.sets} sets`);
    return `<span class="chip">${esc(parts.join(' · '))}</span>`;
  };
  d3.select('#log').selectAll('li').data(recent).join('li').html(s =>
    `<span class="d">${d3.timeFormat('%b %-d, %Y')(s.d)}</span>
     <span class="n">${esc(s.name)}<span>${s.min} min</span></span>
     <span class="chips">${s.ex.map(chip).join('')}</span>`);
}
