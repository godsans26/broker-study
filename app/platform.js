(function () {
  'use strict';
  const base = new URL(document.documentElement.dataset.appRoot || './', location.href);
  window.StudyBase = base;
  const bar = document.createElement('nav'); bar.className = 'study-bar'; bar.setAttribute('aria-label', '학습실');
  bar.innerHTML = '<a class="study-home-link">← 학습실</a><div class="study-tools"><span id="study-connection" class="study-dot" role="status"></span><button type="button" id="study-update" hidden>새 버전 적용</button><button type="button" data-open-install>설치·도움말</button><button type="button" id="study-account-open">동기화</button></div>';
  bar.querySelector('a').href = new URL('index.html', base).href; document.body.prepend(bar);
  const help = document.createElement('dialog'); help.className = 'study-dialog'; help.id = 'study-install'; help.setAttribute('aria-labelledby', 'study-install-title');
  help.innerHTML = '<header><h2 id="study-install-title">설치·오프라인 사용</h2><button type="button" data-dismiss>닫기</button></header><p><b>아이폰</b><br>Safari에서 이 주소를 열고 공유 → 홈 화면에 추가 → 웹 앱으로 열기를 선택하세요.</p><p><b>맥북</b><br>Safari → 파일 → Dock에 추가(macOS Sonoma 14 이상).</p><p><b>윈도우</b><br>Edge 주소창의 앱 설치 버튼을 누르세요.</p><button type="button" id="study-install-button" class="study-primary" hidden>이 기기에 설치</button><p id="study-offline-help" class="study-message" role="status"></p><p class="study-note">오프라인에서는 저장된 문제와 해설을 사용할 수 있습니다. 외부 근거 링크·원문 PDF 열기와 새 버전 다운로드에는 인터넷이 필요할 수 있습니다. 브라우저 저장 공간을 지우면 다운로드와 기록이 사라질 수 있으므로 JSON 백업도 보관하세요.</p><p class="study-note" id="study-build"></p>';
  document.body.append(help);
  document.querySelectorAll('[data-open-install]').forEach(button => button.addEventListener('click', () => help.showModal()));
  help.querySelector('[data-dismiss]').onclick = () => help.close();
  document.getElementById('study-build').textContent = '앱 버전 ' + window.STUDY_BUILD;
  let prompt;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; document.getElementById('study-install-button').hidden = false; });
  document.getElementById('study-install-button').onclick = async () => { if (!prompt) return; await prompt.prompt(); await prompt.userChoice; prompt = null; document.getElementById('study-install-button').hidden = true; };
  const offlineHelp = document.getElementById('study-offline-help');
  function connection() {
    document.getElementById('study-connection').textContent = location.protocol === 'file:' ? '포터블 · 이 기기에 저장' : navigator.onLine ? '온라인 · 이 기기에 저장' : '오프라인 · 이 기기에 저장';
  }
  connection(); window.addEventListener('online', connection); window.addEventListener('offline', connection);
  if (location.protocol === 'file:') { offlineHelp.textContent = '포터블 버전입니다. 압축을 푼 폴더를 그대로 보관하고 index.html을 여세요. 앱 설치와 자동 업데이트는 배포된 웹 주소에서 사용할 수 있습니다.'; return; }
  if (!('serviceWorker' in navigator)) { offlineHelp.textContent = '이 브라우저는 오프라인 설치를 지원하지 않습니다. 최신 Safari 또는 Edge를 이용하세요.'; return; }
  offlineHelp.textContent = '문제와 해설을 오프라인용으로 준비하고 있습니다…';
  let controlled = Boolean(navigator.serviceWorker.controller), refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const updating = controlled;
    controlled = Boolean(navigator.serviceWorker.controller);
    // First installation can claim the already-loaded page without restarting it.
    if (updating && !refreshing) { refreshing = true; location.reload(); }
  });
  navigator.serviceWorker.register(new URL('sw.js', base), {scope: base.pathname, updateViaCache: 'none'}).then(registration => {
    function waiting() {
      if (!registration.waiting || !navigator.serviceWorker.controller) return;
      const button = document.getElementById('study-update'); button.hidden = false;
      button.onclick = () => {
        if (!confirm('진행 기록을 저장하고 새 버전으로 다시 열까요?')) return;
        window.StudySync?.flushLocal();
        registration.waiting?.postMessage({type: 'ACTIVATE_UPDATE'});
      };
    }
    waiting(); registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed') waiting(); if (worker.state === 'redundant') offlineHelp.textContent = '오프라인 준비를 완료하지 못했습니다. 인터넷에 연결한 뒤 다시 열어 주세요.'; }); });
    navigator.serviceWorker.ready.then(() => { offlineHelp.textContent = '문제와 해설의 오프라인 준비가 끝났습니다. 인터넷 없이도 앱을 다시 열 수 있습니다.'; });
    window.addEventListener('online', () => registration.update().catch(() => {}));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) registration.update().catch(() => {}); });
  }).catch(() => { offlineHelp.textContent = '오프라인 준비에 실패했습니다. HTTPS 주소와 브라우저 저장 공간을 확인한 뒤 다시 열어 주세요.'; });
})();
