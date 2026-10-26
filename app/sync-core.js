/* Per-field last-writer-wins records. Null tombstones preserve resets offline. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudyMerge = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const validKey = key => key === 'session' || /^(answer|flag):[a-zA-Z0-9:_-]{1,160}$/.test(key);
  const validStamp = stamp => typeof stamp === 'string' && /^\d{15}:\d{6}:[a-zA-Z0-9-]{1,64}$/.test(stamp);
  function validate(doc) {
    if (!doc || doc.schema !== 1 || !doc.entries || typeof doc.entries !== 'object' || Array.isArray(doc.entries)) throw new Error('기록 형식을 확인할 수 없습니다.');
    if (Object.keys(doc.entries).length > 8000 || JSON.stringify(doc).length > 2000000) throw new Error('기록이 너무 큽니다.');
    for (const [key, entry] of Object.entries(doc.entries)) {
      if (!validKey(key) || !entry || !validStamp(entry.stamp) || !Object.hasOwn(entry, 'value')) throw new Error('기록 항목이 올바르지 않습니다.');
      if (key.startsWith('answer:') && entry.value !== null && !(Number.isInteger(entry.value) && entry.value >= 0 && entry.value < 4)) throw new Error('답변 기록이 올바르지 않습니다.');
      if (key.startsWith('flag:') && entry.value !== null && typeof entry.value !== 'boolean') throw new Error('표시 기록이 올바르지 않습니다.');
    }
    return doc;
  }
  const empty = () => ({schema: 1, entries: {}});
  function merge(a, b) {
    validate(a); validate(b);
    const out = clone(a);
    for (const [key, entry] of Object.entries(b.entries)) {
      if (!out.entries[key] || entry.stamp > out.entries[key].stamp) out.entries[key] = clone(entry);
    }
    return canonical(out);
  }
  function clock(device, now = Date.now) {
    let ms = 0, sequence = 0;
    return {
      observe(doc) {
        for (const entry of Object.values(doc.entries)) {
          const [m, s] = entry.stamp.split(':').map(Number);
          if (m > ms) { ms = m; sequence = s; } else if (m === ms) sequence = Math.max(sequence, s);
        }
      },
      tick() {
        const current = now();
        if (current > ms) { ms = current; sequence = 0; } else sequence++;
        if (sequence > 999999) { ms++; sequence = 0; }
        return String(ms).padStart(15, '0') + ':' + String(sequence).padStart(6, '0') + ':' + device;
      }
    };
  }
  function update(doc, before, after, timer) {
    const next = clone(doc); timer.observe(doc);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const previous = before[key] ?? null, value = after[key] ?? null;
      if (!same(previous, value)) next.entries[key] = {value: clone(value), stamp: timer.tick()};
    }
    return canonical(validate(next));
  }
  function values(doc) {
    validate(doc);
    return Object.fromEntries(Object.entries(doc.entries).map(([key, entry]) => [key, clone(entry.value)]));
  }
  function seed(flat, device) {
    return canonical({schema: 1, entries: Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, {value: clone(value), stamp: '000000000000000:000000:' + device}]))});
  }
  return {clone, same, empty, validate, merge, clock, update, values, seed};
});
