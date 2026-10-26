(function () {
  'use strict';
  const M = window.StudyMerge, adapter = window.StudyAdapter;
  const $ = id => document.getElementById(id);
  const namespace = 'broker-study:' + window.StudyBase.pathname;
  const ownerKey = namespace + ':owner', configKey = namespace + ':cloud';
  let storageOK = true, client = null, authenticated = null, owner = 'guest', generation = 0;
  let doc, snapshot, timer, busy = false, rerun = false, debounce, initialized = false;
  let device = 'device-' + Math.random().toString(36).slice(2);
  const dialog = document.createElement('dialog'); dialog.className = 'study-dialog'; dialog.id = 'study-account'; dialog.setAttribute('aria-labelledby', 'study-account-title');
  dialog.innerHTML = `<header><h2 id="study-account-title">학습 기록 동기화</h2><button type="button" id="study-account-close">닫기</button></header>
    <p id="study-account-message" class="study-message" role="status"></p>
    <div id="study-signed-in" hidden><p id="study-identity"></p><div class="study-tools"><button id="study-sync-now" type="button" class="study-primary">지금 동기화</button><button id="study-sign-out" type="button">로그아웃</button></div><button id="study-merge-guest" type="button" style="margin-top:12px" hidden>로그인 전 이 기기 기록 합치기</button><p class="study-note">계정별 기록은 분리됩니다. 로그아웃하면 로그인 전 이 기기의 기록으로 돌아갑니다. 오프라인 기록은 연결된 상태에서 앱을 열면 동기화됩니다.</p></div>
    <form id="study-login"><label>이메일<input id="study-email" type="email" autocomplete="username" required maxlength="254"></label><label>비밀번호<input id="study-password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"></label><div class="study-tools"><button type="submit" class="study-primary">로그인</button><button id="study-sign-up" type="button">계정 만들기</button></div><p class="study-note">모든 기기에서 같은 계정을 사용하세요. 계정을 만들면 확인 메일이 도착할 수 있습니다.</p></form>
    <details id="study-cloud-settings"><summary>동기화 서버 연결</summary><p class="study-note">앱 관리자가 최초 한 번 설정합니다. 아직 서버를 연결하지 않아도 문제풀이와 JSON 기록 이동은 사용할 수 있습니다.</p><form id="study-config-form"><label>프로젝트 URL<input id="study-cloud-url" type="url" placeholder="https://프로젝트.supabase.co" autocomplete="off" required></label><label>공개용 publishable / anon 키<input id="study-cloud-key" type="text" autocomplete="off" required spellcheck="false"></label><p class="study-note">secret 또는 service_role 키를 입력하지 마세요. 공개용 키와 개인별 접근 제한을 사용합니다.</p><button type="submit">이 기기에 연결 설정 저장</button></form><p><a id="study-setup-guide" target="_blank" rel="noopener">서버 설정 안내 열기</a></p></details>`;
  document.body.append(dialog);
  $('study-setup-guide').href = new URL('setup.html', window.StudyBase).href;
  $('study-account-open').onclick = () => dialog.showModal();
  $('study-account-close').onclick = () => dialog.close();
  function message(text) { $('study-account-message').textContent = text; }
  function status(text) { $('study-account-open').textContent = text; }
  function read(key) {
    try { return localStorage.getItem(key); } catch { storageOK = false; return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); return true; } catch {
      storageOK = false; status('저장 공간 확인'); message('기록을 기기에 저장하지 못했습니다. 문제집의 기록 내보내기로 JSON을 보관하세요.'); return false;
    }
  }
  const savedDevice = read(namespace + ':device');
  if (savedDevice) device = savedDevice; else write(namespace + ':device', device);
  const bucket = who => namespace + ':' + who + ':' + adapter.id;
  function stored(who) { const raw = read(bucket(who)); return raw ? M.validate(JSON.parse(raw)) : null; }
  function applyDoc(next) {
    const nextState = adapter.materialize(M.values(next));
    doc = next; timer.observe(doc); snapshot = adapter.flatten(nextState);
    write(bucket(owner), JSON.stringify(doc)); adapter.apply(nextState);
  }
  function attach() {
    if (!adapter) return;
    timer = M.clock(device);
    // The guest snapshot is taken only once; subsequent account switches cannot seed it.
    const initialOwner = read(ownerKey) || 'guest';
    if (!stored('guest') && initialOwner === 'guest') write(bucket('guest'), JSON.stringify(M.seed(adapter.flatten(adapter.get()), device)));
    owner = initialOwner;
    doc = stored(owner) || M.seed(adapter.flatten(adapter.fresh()), device);
    applyDoc(doc);
  }
  function switchOwner(nextOwner) {
    if (owner === nextOwner) return;
    generation++; owner = nextOwner; write(ownerKey, owner);
    if (adapter) applyDoc(stored(owner) || M.seed(adapter.flatten(adapter.fresh()), device));
  }
  function commit(state) {
    if (!adapter || !doc || !storageOK) return;
    try {
      const after = adapter.flatten(state);
      const durable = stored(owner);
      if (durable) doc = M.merge(doc, durable);
      doc = M.update(doc, snapshot, after, timer);
      applyDoc(doc);
      if (authenticated) { status('동기화 대기'); schedule(); }
    } catch (error) { message(error.message); status('기록 확인 필요'); }
  }
  function schedule() { clearTimeout(debounce); debounce = setTimeout(sync, 700); }
  function validConfig(candidate) {
    if (!candidate || typeof candidate.url !== 'string' || typeof candidate.publishableKey !== 'string') throw new Error('서버 주소와 공개용 키를 입력하세요.');
    const url = new URL(candidate.url.trim());
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new Error('Supabase 프로젝트의 HTTPS 주소를 입력하세요.');
    const key = candidate.publishableKey.trim();
    if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) {
      let role;
      try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch {}
      if (role !== 'anon') throw new Error('공개용 publishable 또는 anon 키만 사용할 수 있습니다. secret/service_role 키는 허용하지 않습니다.');
    }
    return {url: url.origin, publishableKey: key};
  }
  function renderAuth() {
    $('study-signed-in').hidden = !authenticated; $('study-login').hidden = !!authenticated || !client;
    $('study-identity').textContent = authenticated?.email || '';
    $('study-sync-now').disabled = !adapter;
    $('study-merge-guest').hidden = !adapter || !authenticated;
    if (authenticated && !adapter) message('로그인했습니다. 문제집을 열면 그 문제집의 기록을 동기화합니다.');
  }
  async function sync() {
    if (!client || !authenticated || !adapter || !doc || !storageOK || owner !== authenticated.id) return;
    if (document.hidden || !navigator.onLine) { status('오프라인 · 동기화 대기'); return; }
    if (busy) { rerun = true; return; }
    busy = true; const epoch = generation, who = owner;
    try {
      doc = M.merge(doc, stored(owner) || M.empty());
      const sent = M.clone(doc); status('동기화 중…');
      const {data, error} = await client.rpc('merge_study_progress', {p_document: adapter.id, p_payload: sent});
      if (epoch !== generation || who !== owner) return;
      if (error) throw error;
      const durable = stored(owner) || M.empty();
      const next = M.merge(M.merge(doc, durable), M.validate(data));
      applyDoc(next);
      rerun = !M.same(next, data);
      status(rerun ? '동기화 대기' : '동기화 완료');
      message('마지막 동기화: ' + new Date().toLocaleString('ko-KR') + '\n답변·헷갈림 표시·풀이 위치를 저장했습니다.');
    } catch (error) {
      if (epoch === generation) {
        status('동기화 대기');
        const reason = error.code === 'PGRST202' || /function.*not find|Could not find.*function/i.test(error.message || '') ? '서버 설정을 먼저 완료해야 합니다. 서버 설정 안내의 SQL을 실행해 주세요.' : '연결 또는 로그인 상태를 확인해 주세요. 잠시 후 앱을 열거나 지금 동기화를 누르면 다시 시도합니다.';
        message('기기에 저장한 기록은 유지됩니다.\n' + reason);
      }
    } finally {
      busy = false;
      if (rerun) { rerun = false; schedule(); }
    }
  }
  window.StudySync = {changed: commit, flushLocal: () => { if (adapter) commit(adapter.get()); }};
  try { attach(); } catch { storageOK = false; message('저장된 동기화 기록을 읽지 못했습니다. 기존 기록을 덮어쓰지 않습니다. 문제집에서 JSON을 내보내 보관하세요.'); status('기록 확인 필요'); }
  let config = window.STUDY_CLOUD || {};
  try { config = JSON.parse(read(configKey)) || config; } catch {}
  function authChanged(session) {
    if (!initialized) return;
    try {
      authenticated = session?.user || null;
      switchOwner(authenticated?.id || 'guest'); renderAuth();
      if (authenticated) { status('동기화 대기'); sync(); }
      else { status('동기화 로그인'); message('로그인하면 다른 기기에서도 이어서 풀 수 있습니다. 로그인 전 기록은 별도로 보관됩니다.'); }
    } catch (error) { message(error.message); status('기록 확인 필요'); }
  }
  try {
    config = validConfig(config);
    $('study-cloud-url').value = config.url; $('study-cloud-key').value = config.publishableKey;
    client = window.supabase.createClient(config.url, config.publishableKey, {auth: {storageKey: namespace + ':auth:' + new URL(config.url).hostname, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
    initialized = true;
    client.auth.onAuthStateChange((event, session) => { if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') setTimeout(() => authChanged(session), 0); });
    message('로그인 상태를 확인하고 있습니다…');
  } catch {
    message('아직 동기화 서버가 연결되지 않았습니다. 문제풀이는 지금 바로 사용할 수 있고, 기록은 이 기기에 저장됩니다. 서버 연결 후 같은 계정으로 로그인하면 기기 간 동기화를 사용할 수 있습니다.');
    status('동기화 설정'); $('study-cloud-settings').open = true;
  }
  renderAuth();
  $('study-config-form').onsubmit = async event => {
    event.preventDefault();
    try {
      const next = validConfig({url: $('study-cloud-url').value, publishableKey: $('study-cloud-key').value});
      if (client && !confirm('동기화 서버를 바꿀까요? 기존 계정 기록은 이 기기에 별도로 보관됩니다.')) return;
      if (!write(configKey, JSON.stringify(next))) return;
      write(ownerKey, 'guest'); location.reload();
    } catch (error) { message(error.message); }
  };
  async function signIn(create) {
    if (!client) return;
    if (!$('study-login').reportValidity()) return;
    const credentials = {email: $('study-email').value.trim(), password: $('study-password').value};
    const buttons = [...$('study-login').querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
    try {
      const response = create ? await client.auth.signUp({...credentials, options: {emailRedirectTo: location.protocol === 'file:' ? undefined : window.StudyBase.href}}) : await client.auth.signInWithPassword(credentials);
      if (response.error) throw response.error;
      $('study-password').value = '';
      if (create && !response.data.session) message('이메일로 전송된 가입 확인 링크를 누른 뒤 로그인해 주세요. 이미 가입했다면 로그인 버튼을 이용하세요.');
    } catch { message(create ? '계정을 만들지 못했습니다. 이메일·비밀번호와 서버의 가입 설정을 확인해 주세요.' : '로그인하지 못했습니다. 이메일·비밀번호·가입 확인 여부와 인터넷 연결을 확인해 주세요.'); }
    finally { buttons.forEach(button => button.disabled = false); }
  }
  $('study-login').onsubmit = event => { event.preventDefault(); signIn(false); };
  $('study-sign-up').onclick = () => signIn(true);
  $('study-sync-now').onclick = sync;
  $('study-sign-out').onclick = async () => {
    if (!client) return;
    await sync();
    if (!confirm('로그아웃할까요? 아직 동기화하지 못한 기록도 이 기기의 계정별 보관함에 유지됩니다.')) return;
    const {error} = await client.auth.signOut({scope: 'local'});
    if (error) message('로그아웃하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
  };
  $('study-merge-guest').onclick = () => {
    if (!adapter || !authenticated) return;
    if (!confirm('이 문제집의 로그인 전 기록을 현재 계정에 합칠까요? 같은 문제에 두 기록이 있으면 현재 계정의 답을 유지합니다.')) return;
    try {
      const guest = stored('guest'); if (!guest) return message('합칠 로그인 전 기록이 없습니다.');
      const flat = adapter.flatten(adapter.get());
      for (const [key, value] of Object.entries(M.values(guest))) if (key !== 'session' && value !== null && (flat[key] === undefined || key.startsWith('flag:') && value === true)) flat[key] = value;
      commit(adapter.materialize(flat)); sync();
    } catch (error) { message(error.message); }
  };
  window.addEventListener('storage', event => {
    try {
      if (adapter && event.key === bucket(owner) && event.newValue) applyDoc(M.merge(doc, M.validate(JSON.parse(event.newValue))));
    } catch { message('다른 창의 기록을 읽지 못했습니다. JSON 백업을 보관해 주세요.'); }
  });
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(() => { if (!document.hidden) sync(); }, 30000);
})();
