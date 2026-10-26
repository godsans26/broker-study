"""Build both distributions without changing the original standalone question banks.

Requires Python 3.10+ and `npm ci --ignore-scripts` (vendored Supabase SDK).
Only copies the explicitly listed inputs. PDFs stay out of the public web build.
"""
from pathlib import Path
import argparse, base64, hashlib, html, json, os, re, shutil, struct, zipfile, zlib

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'app'
OUT = ROOT / 'dist'
RELEASES = ROOT / 'releases'
parser = argparse.ArgumentParser()
parser.add_argument('--portable-pdfs', action='store_true', help='Include local source PDFs in the local portable ZIP only; never publish this ZIP')
args = parser.parse_args()

def read(path): return path.read_text(encoding='utf-8')
def put(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
def json_script(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')

practice = read(ROOT / 'index.html')
past = read(ROOT / '기출전용/index.html')
bank = json.loads(re.search(r'<script id="question-bank" type="application/json">(.*?)</script>', past, re.S)[1])
practice_bank = json.loads(re.search(r'<script id="questions" type="application/json">(.*?)</script>', practice, re.S)[1])
assert len(practice_bank) == 150 and len(bank['questions']) == 1080

def grading_version(questions, past=False):
    # Explanations, citations and UI edits do not split a user's learning record.
    grading = []
    for q in questions:
        current = {**q, **q.get('current', {})} if past and q['law']['status'] == 'revised' else q
        keys = ['stem', 'options', 'answers' if past else 'answer']
        def value(v, key):
            # This PDF superscript repair changes typography, not the grading scope.
            # Keep the established cloud record key for this one verified formula.
            # The supplied question sheet fixes a typo without changing its meaning.
            if past and q['id'] == '2025-1-25' and key == 'options':
                return [option.replace('점검', '검검') for option in v[key]]
            if past and q['id'] == '2025-0-39' and key == 'options':
                return [option.replace('(1+0.03)⁵', '(1+0.03)5') for option in v[key]]
            return v[key]
        grading.append([q['id'], *[value(q,k) for k in keys], *[value(current,k) for k in keys]])
    return hashlib.sha256(json.dumps(grading, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:20]

config = json.loads(read(APP / 'cloud-config.json'))
config['url'] = os.environ.get('SUPABASE_URL') or config.get('url', '')
config['publishableKey'] = os.environ.get('SUPABASE_PUBLISHABLE_KEY') or config.get('publishableKey', '')
if bool(config['url']) != bool(config['publishableKey']): raise ValueError('Both Supabase URL and public key are required')
if config['url']:
    assert re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co/?', config['url']), 'Invalid Supabase URL'
    key = config['publishableKey']
    if not key.startswith('sb_publishable_'):
        payload = key.split('.')[1]
        assert json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['role'] == 'anon', 'Never publish a service_role/secret key'
sdk = ROOT / 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'
if not sdk.is_file(): raise SystemExit('Run npm ci --ignore-scripts first.')
sources = [practice, past, json_script(config), *[read(p) for p in sorted(APP.glob('*')) if p.is_file()], read(Path(__file__))]
build = hashlib.sha256(''.join(sources).encode()).hexdigest()[:12]

def png(size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            u, v = x / size, y / size
            color = (41,89,64)
            if .23 < u < .77 and .23 < v < .77: color = (245,246,232)
            if .485 < u < .515 and .22 < v < .78: color = (137,165,122)
            if (.29 < u < .43 or .57 < u < .71) and any(a < v < a+.025 for a in [.35,.45,.55,.65]): color = (137,165,122)
            row.extend(color)
        rows.append(bytes(row))
    def chunk(name, data): return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size,size,8,2,0,0,0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')

def head(prefix):
    return f'<meta name="theme-color" content="#295940"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="중개사 학습실"><link rel="manifest" href="{prefix}manifest.webmanifest"><link rel="apple-touch-icon" href="{prefix}icons/icon-180.png"><link rel="icon" href="{prefix}icons/icon-192.png"><link rel="stylesheet" href="{prefix}platform.css">'

def scripts(prefix, with_adapter=False):
    names = ['vendor/supabase.js', 'sync-core.js'] + (['adapter.js'] if with_adapter else []) + ['platform.js', 'sync-client.js']
    return f'<script>window.STUDY_BUILD={json_script(build)};window.STUDY_CLOUD={json_script(config)};</script>' + ''.join(f'<script src="{prefix}{name}"></script>' for name in names)

def build_page(source, kind, prefix, is_portable):
    version = grading_version(bank['questions'], True) if kind == 'past' else grading_version(practice_bank)
    page = source.replace('<html lang="ko"', f'<html lang="ko" data-study="{kind}" data-app-root="{prefix}" data-sync-version="{version}"', 1)
    page = page.replace('</head>', head(prefix) + '</head>', 1)
    if kind == 'past' and not (is_portable and args.portable_pdfs):
        # Do not publish original PDFs implicitly. The complete portable contains them.
        page = page.replace('</head>', '<style>#question-source,#answer-source{display:none!important}</style></head>', 1)
    return page.replace('</body>', scripts(prefix, True) + '</body>', 1)

for kind in ['web', 'portable']:
    target = OUT / kind
    # Output folders are generated by this script and must stay inside this workspace.
    assert target.resolve().is_relative_to(OUT.resolve()) and target.name in ['web', 'portable']
    if target.exists(): shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in ['platform.css', 'platform.js', 'sync-core.js', 'sync-client.js', 'adapter.js']:
        shutil.copyfile(APP / name, target / name)
    (target / 'vendor').mkdir()
    shutil.copyfile(sdk, target / 'vendor/supabase.js')
    shutil.copyfile(ROOT / 'node_modules/@supabase/supabase-js/LICENSE', target / 'vendor/SUPABASE-LICENSE.txt')
    for size in [180,192,512]:
        icon = target / f'icons/icon-{size}.png'; icon.parent.mkdir(exist_ok=True); icon.write_bytes(png(size))
    manifest = dict(id='./', name='손해보험중개사 학습실', short_name='중개사 학습실', lang='ko', start_url='./index.html', scope='./', display='standalone', background_color='#f5f6f2', theme_color='#295940', icons=[dict(src=f'icons/icon-{size}.png',sizes=f'{size}x{size}',type='image/png',purpose='any maskable') for size in [192,512]])
    put(target / 'manifest.webmanifest', json_script(manifest))
    put(target / 'practice.html', build_page(practice, 'practice', './', kind == 'portable'))
    put(target / 'past/index.html', build_page(past, 'past', '../', kind == 'portable'))
    if kind == 'portable' and args.portable_pdfs:
        for year in range(2017,2026):
            for pdf in (ROOT / '기출전용' / str(year)).glob('*.pdf'):
                destination = target / 'past' / str(year) / pdf.name; destination.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(pdf,destination)
    home = read(APP / 'home.html').replace('data-study="home"', 'data-study="home" data-app-root="./"')
    portable_url = 'https://github.com/godsans26/broker-study/releases/latest/download/broker-study-portable.zip'
    home = home.replace('__PLATFORM_HEAD__', head('./')).replace('__PLATFORM_SCRIPTS__', scripts('./')).replace('__PORTABLE_URL__', portable_url)
    put(target / 'index.html', home)
    put(target / 'setup.html', read(APP / 'setup.html'))
    put(target / '.nojekyll', '')
    put(target / 'version.json', json_script(dict(version=build)))
    precache = ['index.html','practice.html','past/index.html','setup.html','platform.css','platform.js','sync-core.js','sync-client.js','adapter.js','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','vendor/supabase.js']
    worker = read(APP / 'sw-template.js').replace('__VERSION__', build).replace('__PRECACHE__', json_script(precache))
    put(target / 'sw.js', worker)
    put(target / '사용법.txt', '손해보험중개사 학습실\n\n압축을 먼저 풀고 index.html을 더블클릭하세요. Windows와 macOS에서 설치 없이 실행됩니다.\n폴더 안 파일들은 함께 보관하세요. 기존 JSON 진행 기록은 각 문제집에서 불러올 수 있습니다.\n아이폰 앱 설치와 자동 업데이트: https://godsans26.github.io/broker-study/\n동기화 서버가 연결되어야 계정 간 기록 공유가 작동합니다. setup.html을 참고하세요.\n공개 배포본에는 원문 PDF가 포함되지 않습니다. 문제와 해설은 HTML 안에 포함됩니다.\n')

RELEASES.mkdir(exist_ok=True)
with zipfile.ZipFile(RELEASES / 'broker-study-portable.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted((OUT / 'portable').rglob('*')):
        if file.is_file(): archive.write(file, Path('broker-study') / file.relative_to(OUT / 'portable'))
print(json.dumps({'build':build,'practice':len(practice_bank),'past':len(bank['questions']),'web':'dist/web','portable':'releases/broker-study-portable.zip','cloudConfigured':bool(config['url'])}, ensure_ascii=False))
