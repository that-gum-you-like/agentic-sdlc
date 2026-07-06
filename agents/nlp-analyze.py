#!/usr/bin/env python3
"""nlp-analyze.py — semantic similarity scoring for identifier near-misses.

Companion to agents/nlp-analyzer.mjs (which does the code parsing and the
edit-distance gate). This script only scores semantic similarity between
identifier word-sequences using spaCy word vectors — LOCAL, CPU-only.
Privacy: no network calls, no cloud SDKs; identifiers never leave the machine.

stdin (JSON):  {"pairs": [["full name", "fullname"], ...]}
stdout (JSON): {"similarities": [0.94, ...]}

Exits 0 with {"error": "..."} on stdout if spaCy (or its model) is missing —
the JS caller falls back to its deterministic lexical similarity.
"""
import json
import sys


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as exc:  # malformed input — report, never crash the caller
        print(json.dumps({"error": f"bad input: {exc}"}))
        return

    pairs = payload.get("pairs", [])

    try:
        import spacy  # local install via agents/requirements-nlp.txt
    except ImportError:
        print(json.dumps({"error": "spacy not installed"}))
        return

    nlp = None
    for model in ("en_core_web_md", "en_core_web_sm"):
        try:
            nlp = spacy.load(model)
            break
        except Exception:
            continue
    if nlp is None:
        print(json.dumps({"error": "no spaCy model available"}))
        return

    similarities = []
    for a, b in pairs:
        da, db = nlp(str(a)), nlp(str(b))
        if not da.vector_norm or not db.vector_norm:
            similarities.append(0.0)
        else:
            similarities.append(round(float(da.similarity(db)), 4))

    print(json.dumps({"similarities": similarities}))


if __name__ == "__main__":
    main()
