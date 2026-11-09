#!/usr/bin/env python3
"""
PII scrubber using Microsoft Presidio with regex fallback.

Reads JSON from stdin: {"text": "..."}
Writes JSON to stdout: {"scrubbed": "...", "entities": [...], "presidio_available": bool}

When Presidio is unavailable (import fails), falls back to regex-based PII
detection for common types (email, phone, SSN, credit card, IP). The regex
layer is always available.

Usage:
    echo '{"text": "Call jane@example.com"}' | python3 agents/pii-scrub.py
    # -> {"scrubbed": "Call <EMAIL_ADDRESS>", "entities": [...]}
"""

import sys
import json
import re
import warnings as _warnings

# ---------------------------------------------------------------------------
# Regex fallback patterns (always available)
# Prioritised: more specific patterns first so longer matches win dedup.
# ---------------------------------------------------------------------------

REGEX_PATTERNS = [
    # Email addresses
    (re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'), 'EMAIL_ADDRESS'),
    # US SSN (try before phone since both can match digit-dash patterns)
    (re.compile(r'\b\d{3}[-]\d{2}[-]\d{4}\b'), 'US_SSN'),
    # Phone numbers (various formats)
    (re.compile(r'\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}'), 'PHONE_NUMBER'),
    # Credit card numbers (Luhn-checkable patterns)
    (re.compile(r'\b(?:\d[ -]*?){13,19}\b'), 'CREDIT_CARD'),
    # IP addresses
    (re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b'), 'IP_ADDRESS'),
    # Simple US ZIP+4 (keep as low-priority to avoid catching everything)
    (re.compile(r'\b\d{5}(?:-\d{4})?\b'), 'ADDRESS'),
]

# SSN without dashes (after the dashed version is checked)
REGEX_PATTERNS.append(
    (re.compile(r'\b\d{9}\b'), 'US_SSN')
)


def _dedup_and_replace(text, entities):
    """
    Deduplicate overlapping entity spans and replace them with typed
    placeholders. Longer (more specific) spans win; contained spans are
    discarded. Replacement is done from end to start so string indices
    remain valid.
    """
    if not entities:
        return text, []

    # Sort by span length descending — longest = most specific
    entities.sort(key=lambda e: -(e['end'] - e['start']))

    kept = []
    for ent in entities:
        overlaps = False
        for k in kept:
            if ent['start'] < k['end'] and ent['end'] > k['start']:
                overlaps = True
                break
        if not overlaps:
            kept.append(ent)

    # Replace from end to start
    kept.sort(key=lambda e: e['start'], reverse=True)
    pieces = list(text)
    for ent in kept:
        placeholder = f"<{ent['type']}>"
        pieces[ent['start']:ent['end']] = placeholder

    return ''.join(pieces), kept


def regex_scrub(text):
    """Scrub PII using regex patterns. Always available."""
    raw = []
    for pattern, label in REGEX_PATTERNS:
        for match in pattern.finditer(text):
            raw.append({
                'type': label,
                'start': match.start(),
                'end': match.end(),
                'score': 1.0,
                'source': 'regex',
            })

    scrubbed, entities = _dedup_and_replace(text, raw)
    return scrubbed, entities


# ---------------------------------------------------------------------------
# Presidio (optional, higher quality)
# ---------------------------------------------------------------------------

_PRESIDIO_ANALYZER = None
_PRESIDIO_ANONYMIZER = None
_PRESIDIO_AVAILABLE = False
_PRESIDIO_ERROR = None


def _init_presidio():
    """Import Presidio once, gracefully."""
    global _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER, _PRESIDIO_AVAILABLE, _PRESIDIO_ERROR

    if _PRESIDIO_AVAILABLE or _PRESIDIO_ERROR is not None:
        return  # already tried

    with _warnings.catch_warnings():
        _warnings.simplefilter('ignore')
        try:
            from presidio_analyzer import AnalyzerEngine as _AE
        except ImportError as exc:
            _PRESIDIO_ERROR = str(exc)
            return

        try:
            _PRESIDIO_ANALYZER = _AE()
            _PRESIDIO_AVAILABLE = True
        except Exception as exc:
            _PRESIDIO_ERROR = str(exc)


_PRESIDIO_ENTITIES = [
    'EMAIL_ADDRESS',
    'PHONE_NUMBER',
    'PERSON',
    'CREDIT_CARD',
    'US_SSN',
    'US_BANK_NUMBER',
    'ADDRESS',
    'DATE_TIME',
    'NRP',
    'LOCATION',
    'AGE',
    'IP_ADDRESS',
]


def _presidio_scrub(text):
    """Scrub using Presidio AnalyzerEngine."""
    results = _PRESIDIO_ANALYZER.analyze(
        text=text,
        entities=_PRESIDIO_ENTITIES,
        language='en',
    )

    entity_list = [
        {'type': r.entity_type, 'start': r.start, 'end': r.end, 'score': r.score, 'source': 'presidio'}
        for r in results
    ]

    # Replace with typed placeholders from end to start
    sorted_results = sorted(results, key=lambda r: r.start, reverse=True)
    pieces = list(text)
    for r in sorted_results:
        placeholder = f"<{r.entity_type}>"
        pieces[r.start:r.end] = placeholder
    scrubbed = ''.join(pieces)

    return scrubbed, entity_list


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main():
    data = json.loads(sys.stdin.read())
    text = data.get('text', '')

    if not isinstance(text, str):
        print(json.dumps({'error': '"text" must be a string'}))
        sys.exit(1)

    if not text.strip():
        print(json.dumps({'scrubbed': text, 'entities': []}))
        return

    # Try Presidio first; fall back to regex
    _init_presidio()

    if _PRESIDIO_AVAILABLE:
        scrubbed, entities = _presidio_scrub(text)
    else:
        scrubbed, entities = regex_scrub(text)

    print(json.dumps({
        'scrubbed': scrubbed,
        'entities': entities,
        'presidio_available': _PRESIDIO_AVAILABLE,
    }))


if __name__ == '__main__':
    main()