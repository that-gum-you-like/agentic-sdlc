#!/usr/bin/env python3
"""
Embedding generator for agent memory semantic search.
Uses sentence-transformers (local, CPU-only, no cloud API calls).

Usage:
    echo '["text1", "text2"]' | python3 agents/embed.py
    # Outputs JSON array of embedding vectors

    echo '{"query": "search text", "corpus": ["doc1", "doc2"]}' | python3 agents/embed.py --search
    # Outputs JSON array of {index, score} sorted by relevance
"""

import sys
import json

def get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer('all-MiniLM-L6-v2')

def embed_texts(texts):
    model = get_model()
    embeddings = model.encode(texts, normalize_embeddings=True)
    return embeddings.tolist()

def search(query, corpus):
    import numpy as np
    model = get_model()
    q_emb = model.encode([query], normalize_embeddings=True)
    c_emb = model.encode(corpus, normalize_embeddings=True)
    # Cosine similarity (embeddings are normalized, so dot product = cosine)
    scores = np.dot(c_emb, q_emb.T).flatten().tolist()
    results = [{"index": i, "score": s} for i, s in enumerate(scores)]
    results.sort(key=lambda x: x["score"], reverse=True)
    return results

def main():
    mode = "--search" if "--search" in sys.argv else "--embed"
    data = json.loads(sys.stdin.read())

    if mode == "--search":
        results = search(data["query"], data["corpus"])
        print(json.dumps(results))
    else:
        embeddings = embed_texts(data)
        print(json.dumps(embeddings))

if __name__ == "__main__":
    main()
