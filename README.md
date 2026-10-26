# 손해보험중개사 학습실

예상문제 150개와 9개년 기출 1,080개를 iPhone·Mac·Windows에서 사용하는 설치형 웹앱(PWA)과 포터블 HTML 앱입니다.

- 웹앱: https://godsans26.github.io/broker-study/
- 포터블: https://github.com/godsans26/broker-study/releases/latest/download/broker-study-portable.zip
- 원본 `index.html`과 `기출전용/index.html`은 그대로 유지합니다. `app/`의 설치·동기화 기능을 빌드 시 추가합니다.
- 공개 웹앱·포터블 배포본과 저장소에는 원문 PDF를 포함하지 않으며 PDF 링크를 표시하지 않습니다. 문제와 해설은 HTML에 포함됩니다. 원본 PDF는 기존 로컬 폴더에서 열 수 있습니다.

## 실행과 기존 기록

아이폰은 Safari에서 웹 주소를 열고 **공유 → 홈 화면에 추가 → 웹 앱으로 열기**를 선택합니다. 맥은 Safari의 **Dock에 추가**, Windows는 Edge의 **앱 설치**를 사용합니다. 포터블은 ZIP을 풀어 `index.html`을 더블클릭하세요. 포터블 실행에는 Python·Node·설치 프로그램이 필요하지 않습니다.

기존 로컬 HTML과 새 웹 주소의 브라우저 저장 공간은 다릅니다. 기존 앱에서 JSON 기록을 내보낸 후 새 앱의 같은 문제집에서 불러오세요. 예상문제와 기출의 JSON 형식은 각각 유지됩니다. 로그인 전 기록과 계정 기록은 별도로 보관됩니다. 계정으로 옮길 때는 해당 문제집의 **동기화 → 로그인 전 이 기기 기록 합치기**를 사용하거나 로그인 후 JSON을 불러오세요.

처음 온라인 접속하여 설치 안내에 **오프라인 준비 완료**가 표시된 뒤에는 문제와 해설을 오프라인으로 사용할 수 있습니다. 외부 링크와 온라인 업데이트에는 인터넷이 필요합니다. 브라우저 저장 공간 삭제나 용량 정리 시 캐시가 사라질 수 있으므로 중요한 기록은 JSON으로 백업하세요.

## 기기 간 동기화: 최초 서버 설정

**현재 배포는 Supabase 프로젝트에 연결되어 있습니다.** 앱에서 계정을 만들고 이메일 인증 후 같은 계정으로 로그인하면 됩니다. 아래 과정은 별도 프로젝트로 새로 배포할 때 사용하는 설정 안내입니다. 공개용 연결 설정은 `app/cloud-config.json`에 있으며 비밀 키를 포함하지 않습니다.

1. Supabase에서 프로젝트를 생성합니다.
2. SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다.
3. Authentication → URL Configuration의 Site URL과 Redirect URL에 `https://godsans26.github.io/broker-study/`를 등록합니다.
4. 프로젝트 URL과 **publishable 키 또는 legacy anon 키**를 확인합니다. service_role/secret 키는 절대 웹앱에 넣지 않습니다.
5. GitHub Settings → Secrets and variables → Actions → Variables에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 등록합니다. 두 값은 공개용 설정이며 비밀 키가 아닙니다. Actions → **Deploy study app** → **Run workflow**를 실행합니다.
6. 앱에서 계정을 만들고 필요하면 이메일을 확인한 뒤 모든 기기에서 같은 계정으로 로그인합니다.

임시로 앱의 **동기화 → 동기화 서버 연결**에 두 값을 입력할 수도 있습니다. 이 경우 각 기기마다 설정해야 합니다. `app/cloud-config.json`에 공개용 설정을 넣고 다시 배포하는 방식도 지원합니다.

로그인된 상태에서 앱을 열고 있으면 답변 저장 후, 다시 온라인이 되었을 때, 화면으로 복귀했을 때, 그리고 30초 간격으로 동기화를 시도합니다. **앱이 닫힌 동안의 백그라운드 동기화는 보장하지 않습니다.** 접속 장애 시 로컬 기록을 유지하고 다음에 재시도합니다.

답변/표시마다 논리 시각을 기록하여 서로 다른 문제의 오프라인 수정은 합칩니다. 같은 항목은 논리 시각이 큰 변경이 이기며, 동률은 기기 식별자로 결정합니다. 기기 시계가 크게 어긋나면 사용자가 느끼는 실제 수정 순서와 다를 수 있습니다. 초기화는 tombstone으로 전파되어 예전 답변이 되살아나지 않습니다. SQL RPC는 행 잠금 안에서 병합합니다. RLS로 로그인한 사용자는 자기 기록만 읽고 쓸 수 있습니다.

브라우저에는 계정별 로컬 기록과 로그인 세션이 남습니다. 공유 기기에서 로그아웃만으로 저장 데이터가 삭제되지는 않습니다.

## 개발 및 자동 배포

Node.js 22 이상, Python 3.10 이상이 필요합니다.

```sh
npm ci --ignore-scripts
npm test
npm run build
node tools/serve.cjs dist/web 4173
```

`http://127.0.0.1:4173/broker-study/`에서 확인합니다. 결과물은 `dist/web`, `dist/portable`, `releases/broker-study-portable.zip`입니다. 원문 PDF는 공개하지 않습니다. 원본 PDF가 있는 로컬 폴더에서 개인용으로 만들 때만 `tools/package-app.py --portable-pdfs`를 사용할 수 있으며, 이때 만든 ZIP은 공개 업로드하지 마세요.

GitHub 저장소의 Settings → Pages → Source를 **GitHub Actions**로 설정합니다. `main`에 push하면 병합 테스트, PostgreSQL RLS 테스트, Chromium·WebKit 브라우저 테스트를 통과한 뒤 웹앱을 배포하고 포터블 ZIP을 Releases에 등록합니다. 로컬 파일을 저장하는 것만으로 자동 push되지는 않습니다.

기존 문제집의 HTML 또는 `app/`를 수정하고 빌드·검증한 뒤 저장소에 push하세요. 해설·화면 변경은 기존 기록을 유지합니다. 문제·보기·정답이 변경되면 채점 기준 해시가 달라져 동기화 보관함을 분리합니다. 이전 보관함은 삭제하지 않습니다. 이전 버전 JSON을 새 채점 기준에 무조건 강제로 적용하지 않습니다.

앱은 새 서비스 워커가 준비되면 **새 버전 적용**을 표시합니다. 사용자가 누르면 로컬 기록을 저장하고 다시 엽니다. 최초 오프라인 설치 시에는 문제풀이 화면을 재시작하지 않습니다.

## 검증

```sh
npm test
npx playwright install --with-deps chromium webkit
npm run build
npm run test:browser
```

`tests/database.sql`은 빈 테스트용 PostgreSQL에서만 실행하세요. 테스트 역할·auth 스키마를 만드는 fixture입니다. 실제 Supabase에는 `supabase/schema.sql`만 실행합니다.

브라우저 통합 검증의 Supabase 전송은 모의 서버를 사용합니다. PostgreSQL 테스트는 실제 SQL 병합·계정 격리를 검증합니다. 실제 Supabase 프로젝트 연결과 물리적 iPhone 홈 화면 설치는 별도로 확인해야 합니다. WebKit 테스트는 iPhone 실기기 테스트와 동일하지 않습니다.
