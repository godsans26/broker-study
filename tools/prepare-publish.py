"""Copy the explicit app source allowlist into the already-cloned publish checkout."""
from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'publish-public'
assert (DEST / '.git').exists(), 'Clone the intended repository into publish first'
files = ['index.html','기출전용/index.html','package.json','package-lock.json','.gitignore','README.md',
         'tools/package-app.py','tools/serve.cjs','tools/prepare-publish.py','.gitattributes']
for directory in ['app','supabase','tests','.github/workflows']:
    files.extend(str(p.relative_to(ROOT)) for p in (ROOT / directory).rglob('*') if p.is_file())
for file in files:
    source = ROOT / file
    target = DEST / file
    assert target.resolve().is_relative_to(DEST.resolve())
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source,target)
print(f'Prepared {len(files)} source files in {DEST}')
