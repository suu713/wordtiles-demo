#!/usr/bin/env python3
"""Build an English lexicon with frequency tiers; no word-length cutoff.

Uses official ESDB word-list output + wordfreq's public API. Data download and
frequency lookup require network access / installed dependencies. The script
never treats missing frequency as a measured very-rare word, and never marks
unreviewed entries as production-approved targets.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
import math
from pathlib import Path
import re
import sys
from typing import Any, Callable
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

VERSION = 'wordtiles-lexicon-grader-1.0.0'
SOURCE_URL = 'https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/en_US-large.txt'
SOURCE_HOME = 'https://github.com/en-wl/wordlist-diff'
SOURCE_LICENSE = 'https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/Copyright'
WF_HOME = 'https://github.com/rspeer/wordfreq'
WF_NOTICE = 'https://raw.githubusercontent.com/rspeer/wordfreq/master/NOTICE.md'
WF_LICENSE = 'https://raw.githubusercontent.com/rspeer/wordfreq/master/LICENSE.txt'
CC_URL = 'https://creativecommons.org/licenses/by-sa/4.0/'
MAX_DOWNLOAD = 32 * 1024 * 1024
ASCII_WORD = re.compile(r'^[A-Za-z]+$')
TIERS = {1: '非常常用', 2: '常用', 3: '一般', 4: '罕见', 5: '非常罕见', 0: '未评级'}
SLUGS = {1: 'very_common', 2: 'common', 3: 'general', 4: 'rare', 5: 'very_rare', 0: 'unrated'}


def classify_zipf(score: float | None) -> int:
    """Project thresholds, not an official five-level linguistic standard."""
    if score is None:
        return 0
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        raise ValueError('Zipf 分数必须是有限数值或 None')
    if not math.isfinite(score) or score < 0:
        raise ValueError('Zipf 分数不能为负数、NaN 或无穷大')
    if score == 0:
        return 0  # wordfreq's missing-value convention, NOT tier 5
    if score >= 5:
        return 1
    if score >= 4:
        return 2
    if score >= 3:
        return 3
    if score >= 2:
        return 4
    return 5


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_or_fetch(url: str, local: Path | None, cache: Path, offline: bool) -> bytes:
    """Use an explicit local input or a cached official file; no silent substitutes."""
    if local is not None:
        data = local.read_bytes()
    elif cache.is_file() and cache.with_name(cache.name + '.url').is_file() and cache.with_name(cache.name + '.url').read_text(encoding='utf-8') == url:
        data = cache.read_bytes()
    else:
        if offline:
            raise RuntimeError(f'离线模式缺少输入：{cache.name}。请用 --source-file / --legal-dir 指定本地文件。')
        request = Request(url, headers={'User-Agent': VERSION})
        with urlopen(request, timeout=45) as response:
            data = response.read(MAX_DOWNLOAD + 1)
    if not data or len(data) > MAX_DOWNLOAD:
        raise ValueError(f'来源文件为空或超过 32MB 限制：{url}')
    stripped = data.lstrip().lower()
    if stripped.startswith((b'<!doctype html', b'<html')):
        raise ValueError(f'下载到 HTML 而不是数据文件：{url}')
    cache.parent.mkdir(parents=True, exist_ok=True)
    if not cache.exists() or sha256(cache.read_bytes()) != sha256(data):
        cache.write_bytes(data)
    cache.with_name(cache.name + '.url').write_text(url, encoding='utf-8')
    return data


def collect_forms(text: str) -> tuple[dict[str, set[str]], list[dict[str, str]]]:
    """Group by A-Z board representation, preserving original case evidence."""
    forms: dict[str, set[str]] = {}
    excluded: list[dict[str, str]] = []
    for raw in text.splitlines():
        word = raw.strip()
        if not word:
            continue
        if not ASCII_WORD.fullmatch(word):
            # Never turn DON'T into DONT, or silently strip accents / hyphens.
            excluded.append({'sourceEntry': word, 'reason': 'not_single_ASCII_letter_word'})
            continue
        forms.setdefault(word.upper(), set()).add(word)
    return forms, excluded


def build_entries(forms: dict[str, set[str]], scorer: Callable[[str], float]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for word in sorted(forms):
        originals = sorted(forms[word])
        score = scorer(word.lower())
        tier = classify_zipf(score)
        measured_score = float(score) if tier else None
        lower_entry = any(item.islower() for item in originals)
        case_review = not lower_entry and word not in {'A', 'I'}
        entries.append({
            'word': word,
            'length': len(word),
            'originalForms': originals,
            'zipf': measured_score,
            'frequencyTier': tier if tier else None,
            'frequencyLabel': TIERS[tier],
            'frequencyStatus': 'measured' if tier else 'not_in_frequency_list',
            'frequencyScope': 'en_combined_not_US_only',
            'hasLowercaseDictionaryEntry': lower_entry,
            'caseReviewRequired': case_review,
            'familiarity': None,
            'reviewStatus': 'pending',
            'targetEnabled': False,
            'reviewPriority': 'high' if tier in (1, 2, 3) and not case_review else 'normal',
        })
    return entries


def write_json(path: Path, value: Any) -> None:
    text = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=Path('lexicon-output'))
    parser.add_argument('--source-file', type=Path, help='已下载的 ESDB 普通词表，一行一个词；不是 Hunspell .dic')
    parser.add_argument('--source-url', default=SOURCE_URL, help='记录来源；无 --source-file 时也用于下载')
    parser.add_argument('--source-name', default='ESDB en_US-large')
    parser.add_argument('--legal-dir', type=Path, help='提供 ESDB_Copyright.txt、wordfreq_NOTICE.md、wordfreq_LICENSE.txt')
    parser.add_argument('--offline', action='store_true', help='不请求网络；所有输入/许可文件必须已缓存或提供')
    args = parser.parse_args()
    try:
        # Import lazily so boundary tests run without external packages.
        from wordfreq import zipf_frequency
    except ImportError:
        print('缺少依赖。先运行：python -m pip install wordfreq==3.1.1', file=sys.stderr)
        return 2
    output = args.out
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'dictionary.master.json').exists():
        print('输出目录已有母词库。请换一个输出目录，避免覆盖版本。', file=sys.stderr)
        return 2
    cache = output / 'sources'
    try:
        raw = read_or_fetch(args.source_url, args.source_file, cache / 'source_wordlist.txt', args.offline)
        legal_specs = [
            ('ESDB_Copyright.txt', SOURCE_LICENSE),
            ('wordfreq_NOTICE.md', WF_NOTICE),
            ('wordfreq_LICENSE.txt', WF_LICENSE),
        ]
        legal_texts: dict[str, str] = {}
        for filename, url in legal_specs:
            local = args.legal_dir / filename if args.legal_dir else None
            contents = read_or_fetch(url, local, cache / filename, args.offline)
            legal_texts[filename] = contents.decode('utf-8-sig')
        forms, excluded = collect_forms(raw.decode('utf-8-sig'))
        if not forms:
            raise ValueError('没有可处理的 A-Z 单词；请检查源文件格式。')
        entries = build_entries(forms, lambda w: zipf_frequency(w, 'en', wordlist='large'))
        wf_version = metadata.version('wordfreq')
        stable_input = '\n'.join([VERSION, sha256(raw), wf_version, 'zipf:5,4,3,2;zero:unrated'])
        data_version = 'en-frequency-v1-' + sha256(stable_input.encode())[:16]
        meta = {
            'version': data_version,
            'builderVersion': VERSION,
            'builtAtUTC': datetime.now(timezone.utc).isoformat(),
            'scope': 'single ASCII-letter entries from configured source; no word-length cutoff',
            'notAFullEnglishDictionary': True,
            'lengthRestricted': False,
            'classification': {
                'method': 'Zipf frequency only; not word length and not validated player difficulty',
                'rules': {'1': 'z >= 5', '2': '4 <= z < 5', '3': '3 <= z < 4',
                          '4': '2 <= z < 3', '5': '0 < z < 2', 'unrated': 'no measured frequency'},
                'thresholdOwner': 'project proposal, not an official five-tier standard',
            },
            'sources': [
                {'name': args.source_name, 'url': args.source_url, 'project': SOURCE_HOME,
                 'sha256': sha256(raw), 'copyrightFile': 'sources/ESDB_Copyright.txt'},
                {'name': 'wordfreq', 'author': 'Robyn Speer', 'url': WF_HOME,
                 'packageVersion': wf_version, 'wordlist': 'large', 'language': 'en',
                 'corpusSnapshot': 'approximately through 2021, not live 2026 language usage',
                 'citation': 'Robyn Speer (2022), rspeer/wordfreq v3.0 (v3.0.2), DOI 10.5281/zenodo.7199437'},
            ],
            'license': {'derivedData': 'CC-BY-SA-4.0', 'url': CC_URL,
                        'wordfreqCode': 'Apache-2.0', 'ESDB': 'MIT-like; retain full original copyright notice',
                        'changes': 'Selected ASCII spellings, grouped case forms, annotated Zipf scores and custom frequency tiers.',
                        'notice': 'Preserve embedded attribution, all notices and source files with redistributions. SUBTLEX is freely available data.'},
            'embeddedNotices': legal_texts,
            'reviewWarning': 'No content-safety, proper-name, abbreviation, theme, lemma, or demographic familiarity audit. All targetEnabled=false.',
        }
        grade_counts = Counter(e['frequencyTier'] or 0 for e in entries)
        length_counts = Counter(e['length'] for e in entries)
        summary = {
            'version': data_version,
            'rawNonemptyLines': sum(bool(s.strip()) for s in raw.decode('utf-8-sig').splitlines()),
            'uniqueASCIIBoardSpellings': len(entries),
            'excludedNonASCIILetterEntries': len(excluded),
            'lengthMin': min(length_counts), 'lengthMax': max(length_counts),
            'longerThan5Letters': sum(e['length'] > 5 for e in entries),
            'tiers': [{'tier': t if t else None, 'label': TIERS[t], 'count': grade_counts[t]} for t in (1,2,3,4,5,0)],
            'lengths': dict(sorted(length_counts.items())),
            'productionApprovedCount': 0,
        }
        for tier in (1, 2, 3, 4, 5, 0):
            selected = [e for e in entries if (e['frequencyTier'] or 0) == tier]
            write_json(output / f'dictionary.{SLUGS[tier]}.json', {'metadata': meta, 'entries': selected})
        write_json(output / 'excluded.entries.json', {'metadata': meta, 'entries': excluded})
        write_json(output / 'summary.json', summary)
        # Write the master last: its existence marks a completed data export.
        write_json(output / 'dictionary.master.json', {'metadata': meta, 'entries': entries})
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (OSError, UnicodeError, ValueError, RuntimeError, URLError, HTTPError) as error:
        print(f'构建失败：{error}\n未完成的输出不可视为合格词库。修正输入后重试或使用新目录。', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
