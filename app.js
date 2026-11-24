// Climbing page: reads ticks.csv (raw Mountain Project export) and todo.json.
// Columns are read by name, so extra or reordered columns are fine.

const TARGET = { label: '5.12', lo: 12.0, hi: 12.99 };   // target band for "clean leads"
const CLEAN = new Set(['onsight', 'flash', 'redpoint', 'pinkpoint']);
const STYLES = ['Onsight', 'Flash', 'Redpoint', 'Pinkpoint'];

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const styleColor = s => ({ Onsight: css('--c2'), Flash: css('--c1'), Redpoint: css('--c0'), Pinkpoint: css('--c3') }[s] || css('--c4'));

// "5.11b", "5.10b/c", "5.11+", "5.9", "5.12a PG13" -> numeric (11.25 etc.), or null
function yds(rating) {
  const m = /5\.(\d{1,2})([abcd])?(?:\/[abcd])?([+-])?/.exec(rating || '');
  if (!m) return null;
  const n = +m[1];
  if (n < 10) return n + (m[3] === '+' ? 0.5 : 0);
  if (m[2]) return n + { a: 0, b: 0.25, c: 0.5, d: 0.75 }[m[2]];
  return n + (m[3] === '-' ? 0.1 : m[3] === '+' ? 0.6 : 0.4);
}
function gradeLabel(g) {
  if (g == null) return '?';
  const n = Math.floor(g);
  if (n < 10) return '5.' + n;
  return '5.' + n + 'abcd'[Math.min(3, Math.round((g - n) / 0.25))];
}
// Pyramid bucket: letter grades for 5.10+, whole numbers below
const bucket = g => (g < 10 ? Math.floor(g) : Math.floor(g * 4) / 4);

function isClean(t) {
  return /lead/i.test(t.style) && CLEAN.has((t.leadStyle || '').toLowerCase());
}
function isRoped(t) { return /sport|trad/i.test(t.type); }

const tip = d3.select('body').append('div').attr('class', 'tip');
function showTip(ev, html) {
  tip.html(html).style('display', 'block')
    .style('left', Math.min(ev.clientX + 12, innerWidth - 270) + 'px')
    .style('top', ev.clientY + 12 + 'px');
}
const hideTip = () => tip.style('display', 'none');

Promise.all([
  d3.csv('ticks.csv'),
  d3.json('todo.json').catch(() => [])
]).then(([rows, todo]) => {
  const ticks = rows.map(r => ({
    date: d3.timeParse('%Y-%m-%d')(r['Date']),
    route: r['Route'] || '',
    rating: r['Rating'] || '',
    url: r['URL'] || '',
    pitches: +r['Pitches'] || 1,
    location: r['Location'] || '',
    style: r['Style'] || '',
    leadStyle: r['Lead Style'] || '',
    type: r['Route Type'] || '',
    code: +r['Rating Code'] || 0
  })).filter(t => t.date);
  ticks.forEach(t => { t.g = yds(t.rating); });
  ticks.sort((a, b) => a.date - b.date);

  const clean = ticks.filter(t => isClean(t) && isRoped(t) && t.g != null);
  tiles(ticks, clean);
  progression(clean);
  pyramid(clean);
  byYear(ticks);
  todoList(todo, clean);
});

function tiles(ticks, clean) {
  const year = new Date().getFullYear();
  // Hardest redpoint: sort by Rating Code (MP's own ordering), fall back to parsed grade
  const rp = clean.filter(t => t.leadStyle.toLowerCase() === 'redpoint')
    .sort((a, b) => (b.code - a.code) || (b.g - a.g))[0];
  const band = clean.filter(t => t.g >= TARGET.lo && t.g <= TARGET.hi);
  const leads = ticks.filter(t => /lead/i.test(t.style) && isRoped(t));
  const osf = leads.filter(t => /onsight|flash/i.test(t.leadStyle)).length;
  const data = [
    { k: 'Ticks', v: ticks.length, s: `${d3.sum(ticks, t => t.pitches)} pitches` },
    { k: 'Hardest redpoint', v: rp ? rp.rating.split(' ')[0] : '—', s: rp ? rp.route : '' },
    { k: `Clean leads at ${TARGET.label}`, v: band.length, s: band.length ? 'latest: ' + band[band.length - 1].route : 'goal: 5.12d' },
    { k: 'Onsight / flash share', v: leads.length ? Math.round(100 * osf / leads.length) + '%' : '—', s: 'of roped leads' },
    { k: `Ticks in ${year}`, v: ticks.filter(t => t.date.getFullYear() === year).length, s: '' }
  ];
  d3.select('#tiles').selectAll('.tile').data(data).join('div').attr('class', 'tile')
    .html(d => `<div class="k">${d.k}</div><div class="v">${d.v}</div><div class="s">${esc(d.s)}</div>`);
}

function progression(clean) {
  const el = document.getElementById('progression');
  if (!clean.length) { el.textContent = 'No clean roped leads yet.'; return; }
  const W = 1000, H = 280, m = { t: 10, r: 10, b: 28, l: 48 };
  const floorG = 10; // hide easy months (moderates, mileage days) so the top end has room
  const months = d3.rollups(clean, v => d3.greatest(v, t => t.g), t => +d3.timeMonth(t.date))
    .map(([k, t]) => ({ date: new Date(k), t })).filter(d => d.t.g >= floorG).sort((a, b) => a.date - b.date);
  let best = -Infinity;
  const running = months.map(d => ({ date: d.date, g: (best = Math.max(best, d.t.g)) }));

  const x = d3.scaleTime().domain(d3.extent(months, d => d.date)).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([floorG - 0.25, Math.max(13, d3.max(months, d => d.t.g) + 0.25)]).range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const ticksY = d3.range(Math.ceil(y.domain()[0] * 2) / 2, y.domain()[1] + 0.01, 0.5);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(ticksY).tickFormat(gradeLabel));
  svg.append('g').selectAll('line').data(ticksY).join('line')
    .attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', css('--line')).attr('stroke-dasharray', '2 4');
  // goal line
  svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(12.75)).attr('y2', y(12.75))
    .attr('stroke', css('--c3')).attr('stroke-dasharray', '6 4');
  svg.append('text').attr('x', W - m.r).attr('y', y(12.75) - 5).attr('text-anchor', 'end').style('fill', css('--c3')).text('goal 5.12d');

  svg.append('path').datum(running).attr('fill', 'none').attr('stroke', css('--c4')).attr('stroke-width', 1.5)
    .attr('d', d3.line().curve(d3.curveStepAfter).x(d => x(d.date)).y(d => y(d.g)));
  svg.append('g').selectAll('circle').data(months).join('circle')
    .attr('cx', d => x(d.date)).attr('cy', d => y(d.t.g)).attr('r', 5)
    .attr('fill', d => styleColor(cap(d.t.leadStyle)))
    .on('mousemove', (ev, d) => showTip(ev, `<b>${esc(d.t.route)}</b> ${esc(d.t.rating)}<br>${cap(d.t.leadStyle)} · ${d3.timeFormat('%b %Y')(d.date)}`))
    .on('mouseleave', hideTip);
  legend(el);
}

function pyramid(clean) {
  const el = document.getElementById('pyramid');
  if (!clean.length) return;
  const buckets = d3.rollups(clean, v => d3.rollup(v, w => w.length, t => cap(t.leadStyle)), t => bucket(t.g))
    .sort((a, b) => b[0] - a[0]);
  const rows = buckets.map(([b, m]) => ({ b, ...Object.fromEntries(STYLES.map(s => [s, m.get(s) || 0])) }));
  const stack = d3.stack().keys(STYLES)(rows);
  const rowH = 22, W = 500, m = { t: 4, r: 30, b: 4, l: 52 }, H = rows.length * rowH + m.t + m.b;
  const x = d3.scaleLinear().domain([0, d3.max(rows, r => d3.sum(STYLES, s => r[s]))]).range([0, W - m.l - m.r]);
  const y = d3.scaleBand().domain(rows.map(r => r.b)).range([m.t, H - m.b]).padding(0.18);
  const cx = m.l + (W - m.l - m.r) / 2;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('g').selectAll('g').data(stack).join('g').attr('fill', d => styleColor(d.key))
    .selectAll('rect').data(d => d.map(p => Object.assign(p, { key: d.key }))).join('rect')
    .attr('y', p => y(p.data.b)).attr('height', y.bandwidth()).attr('rx', 2)
    .attr('x', p => cx - x(d3.sum(STYLES, s => p.data[s])) / 2 + x(p[0]))
    .attr('width', p => x(p[1]) - x(p[0]))
    .on('mousemove', (ev, p) => showTip(ev, `${gradeLabel(p.data.b)} · ${p.key}: ${p.data[p.key]}`))
    .on('mouseleave', hideTip);
  svg.append('g').selectAll('text').data(rows).join('text')
    .attr('x', 6).attr('y', r => y(r.b) + y.bandwidth() / 2 + 4).text(r => gradeLabel(r.b));
  svg.append('g').selectAll('text').data(rows).join('text').attr('text-anchor', 'start')
    .attr('x', r => cx + x(d3.sum(STYLES, s => r[s])) / 2 + 6).attr('y', r => y(r.b) + y.bandwidth() / 2 + 4)
    .text(r => d3.sum(STYLES, s => r[s]));
  legend(el);
}

function byYear(ticks) {
  const el = document.getElementById('byyear');
  if (!ticks.length) return;
  const cat = t => isRoped(t) ? 'Roped' : /boulder/i.test(t.type) ? 'Boulder' : 'Other';
  const keys = ['Roped', 'Boulder', 'Other'];
  const colors = { Roped: css('--c0'), Boulder: css('--c2'), Other: css('--c4') };
  const years = d3.range(ticks[0].date.getFullYear(), new Date().getFullYear() + 1);
  const rows = years.map(yr => {
    const v = ticks.filter(t => t.date.getFullYear() === yr);
    return { yr, ...Object.fromEntries(keys.map(k => [k, v.filter(t => cat(t) === k).length])) };
  });
  const W = 500, H = 240, m = { t: 10, r: 6, b: 24, l: 34 };
  const x = d3.scaleBand().domain(years).range([m.l, W - m.r]).padding(0.25);
  const y = d3.scaleLinear().domain([0, d3.max(rows, r => d3.sum(keys, k => r[k])) || 1]).nice().range([H - m.b, m.t]);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickFormat(d3.format('d')));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5));
  svg.append('g').selectAll('g').data(d3.stack().keys(keys)(rows)).join('g').attr('fill', d => colors[d.key])
    .selectAll('rect').data(d => d.map(p => Object.assign(p, { key: d.key }))).join('rect')
    .attr('x', p => x(p.data.yr)).attr('width', x.bandwidth())
    .attr('y', p => y(p[1])).attr('height', p => y(p[0]) - y(p[1])).attr('rx', 2)
    .on('mousemove', (ev, p) => showTip(ev, `${p.data.yr} · ${p.key}: ${p.data[p.key]}`))
    .on('mouseleave', hideTip);
  d3.select(el).append('div').attr('class', 'legend')
    .html(keys.map(k => `<span><i style="background:${colors[k]}"></i>${k}</span>`).join(''));
}

function todoList(todo, clean) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const items = todo.map(it => {
    const hit = clean.find(t => (it.url && t.url && t.url === it.url) || norm(t.route) === norm(it.route));
    return { ...it, hit };
  }).sort((a, b) => (b.code || 0) - (a.code || 0) || (yds(b.grade) - yds(a.grade)));
  // Goal-band projects first; the rest behind a "show all" toggle
  const focus = items.filter(d => (yds(d.grade) ?? 0) >= TARGET.lo);
  const doneN = focus.filter(d => d.hit).length;
  const head = d3.select('#todo').node().previousElementSibling.querySelector('.sub');
  if (head) head.textContent = `${doneN} of ${focus.length} 5.12+ projects sent · checks itself off when a clean lead is ticked`;
  let showAll = false;
  const btn = d3.select('#todo').node().parentNode.appendChild(document.createElement('button'));
  btn.className = 'more';
  btn.onclick = () => { showAll = !showAll; draw(); };
  draw();
  function draw() {
    btn.textContent = showAll ? `Show 5.12+ only` : `Show all ${items.length}`;
    const list = showAll ? items : focus;
  d3.select('#todo').selectAll('li').data(list, d => d.url || d.route).join('li').classed('done', d => !!d.hit)
    .html(d => `<span class="box"></span><span class="grade">${esc(d.grade)}</span>
      <span class="name">${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.route)}</a>` : esc(d.route)}
      ${d.note ? `<span class="meta" style="margin-left:6px">— ${esc(d.note)}</span>` : ''}</span>
      <span class="meta">${d.hit ? `${cap(d.hit.leadStyle)} ${d3.timeFormat('%b %-d, %Y')(d.hit.date)}` : esc(d.area || '')}</span>`);
  }
  if (!items.length) d3.select('#todo').append('li').text('Add routes to todo.json.');
}

function legend(el) {
  d3.select(el).append('div').attr('class', 'legend')
    .html(STYLES.map(s => `<span><i style="background:${styleColor(s)}"></i>${s}</span>`).join(''));
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
