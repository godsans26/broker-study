"""Import the three supplied PDFs, checking every answer against both sources.

Usage: python tools/import-finance.py SOURCE_DIRECTORY [finance|risk] (requires pypdf).
Original PDFs are never copied into the public distribution.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
subject = sys.argv[2] if len(sys.argv) > 2 else 'finance'
assert subject in {'finance', 'risk'}
name, first, footer, boxes = ('위험관리론', 31, '3 1 ~ 3 5 번', {(4, 34), (6, 34), (8, 34)}) if subject == 'risk' else ('세제재무설계', 36, '3 6 ~ 4 0 번', {(1, 38), (2, 39), (4, 37)})
symbols = '①②③④'
paths = [source / f'{name}_예상문제_10회분_{kind}.pdf' for kind in ['문제지', '정답표', '해설지']]
qr, ar, er = [PdfReader(p) for p in paths]
compact = lambda text: re.sub(r'\s+', '', text)
join = lambda text: ' '.join(text.split())
answers = {}
for page in ar.pages:
    for row in re.finditer(r'제(\d+)회\s+([①②③④\s]+)\s*/\s*5', page.extract_text()):
        values = re.findall('[①②③④]', row[2])
        assert len(values) == 5
        answers.update({(int(row[1]), n): symbols.index(v) for n, v in enumerate(values, first)})
bank = []
assert len(qr.pages) == len(er.pages) == 10
for round_no, (qp, ep) in enumerate(zip(qr.pages, er.pages), 1):
    qt = qp.extract_text().split(f'제{round_no}회', 1)[1]
    qt = qt.split(footer, 1)[0].strip()
    et = ep.extract_text().split(f'제{round_no}회 해설', 1)[1]
    et = et.split('정 답', 1)[0].strip()
    qs = list(re.finditer(r'(?m)^(\d+)\.\s*', qt))
    es = list(re.finditer(r'(?m)^(\d+)번 (.+?) 정답 ([①②③④])\s*\n', et))
    assert [int(m[1]) for m in qs] == [int(m[1]) for m in es] == list(range(first, first + 5))
    for i, (qm, em) in enumerate(zip(qs, es)):
        number = int(qm[1])
        raw = qt[qm.end():qs[i+1].start() if i < 4 else len(qt)].strip()
        pieces = re.split(r'(?m)^([①②③④])\s*', raw)
        assert pieces[1::2] == list(symbols)
        # Only these source questions have a separate case box; other wraps are prose.
        stem_parts = pieces[0].strip().split('\n', 1) if (round_no, number) in boxes else [join(pieces[0])]
        stem, conditions = stem_parts[0], stem_parts[1] if len(stem_parts) > 1 else ''
        options = [join(t) for t in pieces[2::2]]
        answer = symbols.index(em[3])
        assert answers[round_no, number] == answer
        explanation_raw = et[em.end():es[i+1].start() if i < 4 else len(et)].strip()
        prefix = compact(stem + conditions + symbols[answer] + options[answer])
        assert compact(explanation_raw).startswith(prefix), (round_no, number, explanation_raw)
        # Locate the end of the repeated question and answer without relying on wrapping.
        count = 0
        for end, char in enumerate(explanation_raw, 1):
            if not char.isspace():
                count += 1
            if count == len(prefix):
                break
        explanation = join(explanation_raw[end:])
        assert explanation and all(options)
        assert compact(raw) == compact(stem + conditions + ''.join(s+o for s, o in zip(symbols, options)))
        assert compact(explanation_raw) == prefix + compact(explanation)
        bank.append(dict(id=f'{subject}-{round_no}-{number}', round=round_no, number=number,
                         stem=stem, conditions=conditions, options=options, answer=answer,
                         explanation=explanation, tag=em[2], questionPage=round_no, explanationPage=round_no))
assert len(bank) == len(answers) == 50
assert len({q['id'] for q in bank}) == 50
(root / 'data').mkdir(exist_ok=True)
(root / f'data/{subject}.json').write_text(json.dumps(bank, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
report = dict(questions=50, answerTableMatches=50, explanationMatches=50,
              nonWhitespaceContentPreserved=True,
              sources={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
(root / f'data/{subject}-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
