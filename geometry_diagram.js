/* Shared, bounded geometry validation and SVG rendering. No model HTML is used. */
(function (root) {
  'use strict';
  const kinds = { collinear: 3, perpendicular: 4, parallel: 4, equalLength: 4, midpoint: 3, onCircle: 3 };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const operations = { midpoint: 2, projection: 3, reflection: 3, intersection: 4, circumcenter: 3, orthocenter: 3, onCircle: 2, lineCircle: 4, circleCircle: 4, ratio: 2 };
  const idPattern = /^[A-Za-z][A-Za-z0-9_']{0,15}$/;
  const fail = (code, message) => { throw Object.assign(new Error(message), { geometryCode: code }); };
  const finitePoint = p => p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.max(Math.abs(p.x), Math.abs(p.y)) <= 10000;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const minus = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const add = (a, v, t = 1) => ({ x: a.x + t * v.x, y: a.y + t * v.y });
  function project(p, a, b) {
    const u = minus(b, a), v = minus(p, a), length = u.x * u.x + u.y * u.y;
    if (length < 1e-18) fail('DEGENERATE_CONSTRUCTION', 'Projection line has coincident endpoints.');
    return add(a, u, (u.x * v.x + u.y * v.y) / length);
  }
  function intersect(a, b, c, d) {
    const u = minus(b, a), v = minus(d, c), denom = cross(u, v);
    if (Math.abs(denom) <= 1e-10 * distance(a, b) * distance(c, d) || distance(a, b) < 1e-9 || distance(c, d) < 1e-9) fail('DEGENERATE_CONSTRUCTION', 'Intersection lines are parallel or undefined.');
    return add(a, u, cross(minus(c, a), v) / denom);
  }
  function circumcenter(a, b, c) {
    const u = minus(b, a), v = minus(c, a), denom = 2 * cross(u, v);
    if (Math.abs(denom) <= 1e-10 * distance(a, b) * distance(a, c) || distance(a, b) < 1e-9 || distance(a, c) < 1e-9) fail('DEGENERATE_CONSTRUCTION', 'Circumcenter needs a noncollinear triangle.');
    const uu = u.x * u.x + u.y * u.y, vv = v.x * v.x + v.y * v.y;
    return add(a, { x: (uu * v.y - vv * u.y) / denom, y: (u.x * vv - v.x * uu) / denom });
  }
  function construct(type, refs, parameter) {
    const [a, b, c, d] = refs;
    if (type === 'midpoint' || type === 'ratio') return add(a, minus(b, a), type === 'midpoint' ? 0.5 : parameter);
    if (type === 'projection') return project(a, b, c);
    if (type === 'reflection') return add(a, minus(project(a, b, c), a), 2);
    if (type === 'intersection') return intersect(a, b, c, d);
    if (type === 'circumcenter') return circumcenter(a, b, c);
    if (type === 'orthocenter') { const o = circumcenter(a, b, c); return { x: a.x + b.x + c.x - 2 * o.x, y: a.y + b.y + c.y - 2 * o.y }; }
    if (type === 'onCircle') {
      const radius = distance(a, b), angle = parameter * Math.PI / 180;
      if (radius < 1e-9) fail('DEGENERATE_CONSTRUCTION', 'Circle radius is zero.');
      return { x: a.x + radius * Math.cos(angle), y: a.y + radius * Math.sin(angle) };
    }
    const branch = parameter < 0 ? -1 : 1;
    if (type === 'lineCircle') {
      const foot = project(c, a, b), r = distance(c, d), gap = r * r - distance(c, foot) ** 2, u = minus(b, a), len = distance(a, b);
      if (r < 1e-9 || gap < -1e-12 * r * r) fail('MISSING_INTERSECTION', 'Line does not meet the circle.');
      return add(foot, u, branch * Math.sqrt(Math.max(0, gap)) / len);
    }
    if (type === 'circleCircle') {
      const r = distance(a, b), s = distance(c, d), len = distance(a, c), u = minus(c, a);
      if (r < 1e-9 || s < 1e-9 || len < 1e-9 || len > r + s + 1e-10 || len < Math.abs(r - s) - 1e-10) fail('MISSING_INTERSECTION', 'Circles have no unique finite intersection pair.');
      const t = (r * r - s * s + len * len) / (2 * len), h2 = r * r - t * t;
      if (h2 < -1e-10 * r * r) fail('MISSING_INTERSECTION', 'Circles do not intersect.');
      const base = add(a, u, t / len);
      return add(base, { x: -u.y / len, y: u.x / len }, branch * Math.sqrt(Math.max(0, h2)));
    }
    fail('INVALID_CONSTRUCTION', 'Unknown construction operation.');
  }
  function resolve(value) {
    if (!Array.isArray(value.points) || !value.points.length || value.points.length > 40) fail('INVALID_POINTS', 'Expected 1–40 base points.');
    const instructions = value.constructions === undefined ? [] : value.constructions;
    if (!Array.isArray(instructions) || instructions.length + value.points.length > 40) fail('INVALID_CONSTRUCTION', 'At most 40 total points are supported.');
    const ids = new Set();
    for (const p of value.points) {
      if (!p || !idPattern.test(p.id || '') || ids.has(p.id) || !finitePoint(p)) fail('INVALID_POINT', 'Point IDs must be unique and coordinates finite within ±10000.');
      ids.add(p.id);
    }
    for (const op of instructions) {
      if (!op || !idPattern.test(op.id || '') || ids.has(op.id) || !Object.hasOwn(operations, op.type) || !Array.isArray(op.points) || op.points.length !== operations[op.type] || op.points.some(id => typeof id !== 'string') || !Number.isFinite(op.parameter)) fail('INVALID_CONSTRUCTION', 'Invalid construction ID, operation, references or numeric parameter.');
      ids.add(op.id);
    }
    const origin = value.points[0], scale = Math.max(1e-6, ...value.points.map(p => distance(origin, p)));
    const known = new Map(value.points.map(p => [p.id, { x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale }]));
    const points = value.points.map(p => ({ id: p.id, x: p.x, y: p.y, auxiliary: p.auxiliary === true }));
    let pending = [...instructions];
    while (pending.length) {
      const next = [];
      for (const op of pending) {
        if (op.points.some(id => !known.has(id))) { next.push(op); continue; }
        let result;
        try { result = construct(op.type, op.points.map(id => known.get(id)), op.parameter); }
        catch (error) { error.message = `${op.id}: ${error.message}`; throw error; }
        const point = { id: op.id, x: origin.x + result.x * scale, y: origin.y + result.y * scale, auxiliary: op.auxiliary === true };
        if (!finitePoint(point)) fail('INVALID_POINT', `${op.id}: constructed coordinates are outside the supported range.`);
        known.set(op.id, result); points.push(point);
      }
      if (next.length === pending.length) fail('UNRESOLVED_CONSTRUCTION', `Unknown or cyclic references: ${next.map(op => op.id).join(', ')}.`);
      pending = next;
    }
    return { ...value, points };
  }
  function inspect(value) {
    try { return { geometry: validate(value), issues: [] }; }
    catch (error) { return { geometry: null, issues: [{ code: error.geometryCode || 'INVALID_GEOMETRY', message: error.geometryCode ? error.message : 'Invalid diagram data.' }] }; }
  }
  function clean(value) { return inspect(value).geometry; }
  function validate(value) {
    if (!value || value.isGeometry !== true) fail('NOT_PLANAR_GEOMETRY', 'No supported planar diagram was supplied.');
    value = resolve(value);
    if (value.points.length < 3) fail('INVALID_POINTS', 'At least three total points are required.');
    if (!Array.isArray(value.segments) || value.segments.length > 80 || !Array.isArray(value.circles) || value.circles.length > 12 || !Array.isArray(value.constraints) || !value.constraints.length || value.constraints.length > 100) fail('INVALID_COLLECTIONS', 'Expected segments, circles and 1–100 geometric constraints within supported limits.');
    const points = [], byId = new Map();
    for (const p of value.points) {
      if (!p || typeof p.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_']{0,15}$/.test(p.id) || byId.has(p.id) || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.max(Math.abs(p.x), Math.abs(p.y)) > 10000) fail('INVALID_POINT', 'Invalid point label or coordinates.');
      const point = { id: p.id, x: p.x, y: p.y, auxiliary: p.auxiliary === true }; points.push(point); byId.set(p.id, point);
    }
    const span = Math.max(...['x', 'y'].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))));
    if (span < 1e-6) fail('DEGENERATE_GEOMETRY', 'All points coincide.');
    // Work in normalized coordinates so tolerance is independent of diagram scale.
    const origin = points[0];
    const normalized = new Map(points.map(p => [p.id, { x: (p.x - origin.x) / span, y: (p.y - origin.y) / span }]));
    const segments = [], circles = [], constraints = [];
    for (const s of value.segments) {
      if (!s || !byId.has(s.from) || !byId.has(s.to) || distance(normalized.get(s.from), normalized.get(s.to)) < 1e-5) fail('INVALID_SEGMENT', `Segment ${s?.from || '?'}–${s?.to || '?'} has an unknown point or zero length.`);
      segments.push({ from: s.from, to: s.to, auxiliary: s.auxiliary === true });
    }
    for (const c of value.circles) {
      if (!c || !byId.has(c.center) || !byId.has(c.through) || distance(normalized.get(c.center), normalized.get(c.through)) < 1e-5) fail('INVALID_CIRCLE', `Circle ${c?.center || '?'} through ${c?.through || '?'} has an unknown point or zero radius.`);
      circles.push({ center: c.center, through: c.through, auxiliary: c.auxiliary === true });
    }
    if (!segments.length && !circles.length) fail('EMPTY_GEOMETRY', 'No drawable segments or circles.');
    const tol = 1e-4;
    for (const c of value.constraints) {
      if (!c || !Object.hasOwn(kinds, c.type) || !Array.isArray(c.points) || c.points.length !== kinds[c.type] || c.points.some(id => !byId.has(id))) fail('INVALID_CONSTRAINT', 'Constraint has an unsupported relation or unknown point.');
      const [a, b, d, e] = c.points.map(id => normalized.get(id));
      let valid = false;
      if (c.type === 'midpoint') valid = distance(a, { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2 }) <= tol && distance(b, d) > tol;
      else if (c.type === 'onCircle') valid = distance(b, d) > tol && Math.abs(distance(a, b) - distance(b, d)) <= tol;
      else if (c.type === 'collinear') valid = distance(a, b) > tol && Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)) / distance(a, b) <= tol;
      else {
        const u = { x: b.x - a.x, y: b.y - a.y }, v = { x: e.x - d.x, y: e.y - d.y };
        const lu = distance(a, b), lv = distance(d, e);
        if (lu > tol && lv > tol) {
          if (c.type === 'equalLength') valid = Math.abs(lu - lv) <= tol;
          if (c.type === 'perpendicular') valid = Math.abs(u.x * v.x + u.y * v.y) / (lu * lv) <= tol;
          if (c.type === 'parallel') valid = Math.abs(u.x * v.y - u.y * v.x) / (lu * lv) <= tol;
        }
      }
      if (!valid) fail('CONSTRAINT_MISMATCH', `${c.type}(${c.points.join(', ')}) does not hold at normalized tolerance ${tol}.`);
      constraints.push({ type: c.type, points: [...c.points] });
    }
    return { isGeometry: true, caption: typeof value.caption === 'string' ? value.caption.slice(0, 1000) : '', points, segments, circles, constraints };
  }
  function figure(doc, value, english = false) {
    const data = clean(value);
    if (!data) return null;
    const auxiliaryColor = '#dc2626';
    const ns = 'http://www.w3.org/2000/svg';
    const node = (tag, attrs) => { const el = doc.createElementNS(ns, tag); for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, String(val)); return el; };
    const figure = doc.createElement('figure'); figure.className = 'ai-geometry-figure'; figure.style.cssText = 'margin:16px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact;';
    const title = english ? 'Geometry diagram' : 'Hình vẽ bài toán';
    const heading = doc.createElement('strong'); heading.textContent = title; figure.append(heading);
    const svg = node('svg', { viewBox: '0 0 760 500', role: 'img', 'aria-label': title, preserveAspectRatio: 'xMidYMid meet' });
    svg.style.cssText = 'display:block;width:100%;max-height:480px;height:auto;';
    const desc = node('title', {}); desc.textContent = data.caption || title; svg.append(desc);
    const map = new Map(data.points.map(p => [p.id, p]));
    const xs = data.points.map(p => p.x), ys = data.points.map(p => p.y);
    for (const c of data.circles) { const o = map.get(c.center), r = distance(o, map.get(c.through)); xs.push(o.x - r, o.x + r); ys.push(o.y - r, o.y + r); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(660 / Math.max(maxX - minX, 1e-6), 400 / Math.max(maxY - minY, 1e-6));
    const pos = p => ({ x: 380 + (p.x - (minX + maxX) / 2) * scale, y: 250 - (p.y - (minY + maxY) / 2) * scale });
    for (const c of data.circles) { const o = map.get(c.center), p = pos(o); svg.append(node('circle', { cx: p.x, cy: p.y, r: distance(o, map.get(c.through)) * scale, fill: 'none', stroke: c.auxiliary ? auxiliaryColor : '#334155', 'stroke-width': 1.8, 'stroke-dasharray': c.auxiliary ? '6 4' : 'none' })); }
    for (const s of data.segments) { const a = pos(map.get(s.from)), b = pos(map.get(s.to)); svg.append(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: s.auxiliary ? auxiliaryColor : '#0f172a', 'stroke-width': 1.8, 'stroke-dasharray': s.auxiliary ? '6 4' : 'none' })); }
    for (const p of data.points) {
      const a = pos(p), color = p.auxiliary ? auxiliaryColor : '#0f172a';
      svg.append(node('circle', { cx: a.x, cy: a.y, r: 3, fill: color }));
      const label = node('text', { x: a.x + (a.x > 380 ? -7 : 7), y: a.y - 9, 'text-anchor': a.x > 380 ? 'end' : 'start', fill: color, 'font-size': 16, 'font-family': 'serif', 'font-style': 'italic', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }); label.textContent = p.id; svg.append(label);
    }
    figure.append(svg);
    if (data.points.some(p => p.auxiliary) || data.segments.some(s => s.auxiliary) || data.circles.some(c => c.auxiliary)) {
      const legend = doc.createElement('p'); legend.className = 'ai-geometry-legend';
      legend.style.cssText = 'font-size:0.85em;margin:6px 0;color:#dc2626;';
      legend.textContent = english ? 'Red points and dashed red lines: auxiliary elements added in the solution.' : 'Điểm đỏ và đường đỏ nét đứt: phần dựng thêm trong lời giải.';
      figure.append(legend);
    }
    const caption = doc.createElement('figcaption'); caption.style.cssText = 'font-size:0.9em;color:#475569;';
    caption.textContent = (data.caption ? data.caption + ' — ' : '') + (english ? 'Illustration of one configuration; the proof covers all cases.' : 'Hình minh họa một cấu hình; kết luận phải dựa trên chứng minh.'); figure.append(caption);
    return figure;
  }
  root.MathAppGeometry = Object.freeze({ clean, inspect, figure });
})(globalThis);
