/* Runs after the original quiz script; keeps its JSON import/export formats. */
(function () {
  'use strict';
  const past = document.documentElement.dataset.study === 'past';
  const createFresh = () => past ? fresh() : freshState();
  const copy = value => JSON.parse(JSON.stringify(value));
  function flatten(s) {
    const out = {session: {version: s.version, order: s.order, position: s.position}};
    if (past) out.session.filters = s.filters;
    const modes = past ? s.answers : {practice: s.answers};
    for (const [mode, answers] of Object.entries(modes)) for (const [id, answer] of Object.entries(answers)) out['answer:' + mode + ':' + id] = answer;
    for (const id of (past ? s.flags : s.uncertain)) out['flag:' + id] = true;
    return copy(out);
  }
  function materialize(flat) {
    let next = createFresh();
    if (flat.session) {
      next = {...next, ...copy(flat.session), version: next.version};
    }
    next.answers = past ? {original: {}, current: {}} : {};
    next[past ? 'flags' : 'uncertain'] = [];
    for (const [key, value] of Object.entries(flat)) {
      if (key.startsWith('answer:') && value !== null) {
        const [, mode, id] = key.split(':');
        if (!byId.has(id)) continue;
        if (past && ['original', 'current'].includes(mode) && (mode !== 'current' || modern(byId.get(id)))) next.answers[mode][id] = value;
        if (!past && mode === 'practice') next.answers[id] = value;
      } else if (key.startsWith('flag:') && value === true && byId.has(key.slice(5))) next[past ? 'flags' : 'uncertain'].push(key.slice(5));
    }
    if (past) next = compatibleState(next);
    if (!(past ? valid(next) : validState(next))) throw new Error('이 버전의 문제집과 맞지 않는 기록입니다. JSON 백업을 보관해 주세요.');
    return next;
  }
  const originalSave = save;
  window.StudyAdapter = {
    id: (past ? 'past:' : 'practice:') + document.documentElement.dataset.syncVersion,
    get: () => copy(state), fresh: createFresh, flatten, materialize,
    apply(next) {
      state = copy(next);
      if (past) writeForm(state.filters);
      originalSave(); render();
    }
  };
  save = function () {
    originalSave();
    window.StudySync?.changed(state);
  };
})();
