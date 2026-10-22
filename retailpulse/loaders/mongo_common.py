import os, pathlib
from pymongo import MongoClient
ROOT = pathlib.Path(__file__).resolve().parents[1]
URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true")
DB = os.environ.get("MONGO_DB", "retailpulse")
def db(): return MongoClient(URI, serverSelectionTimeoutMS=5000)[DB]
def bulk(coll, docs, batch=20000):
    """Insert an iterable of dicts in unordered batches; returns inserted count."""
    buf, n = [], 0
    for d in docs:
        buf.append(d)
        if len(buf) >= batch: coll.insert_many(buf, ordered=False); n += len(buf); buf = []
    if buf: coll.insert_many(buf, ordered=False); n += len(buf)
    return n
