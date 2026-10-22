#!/usr/bin/env python3
"""MongoDB-backed job worker (no Redis): leases queued 'pipeline' jobs, runs the learning pipeline, records status.
Lease = atomic findOneAndUpdate; heartbeat via leaseUntil; crashed jobs are re-queued after the lease expires; max 3 attempts."""
import datetime as dt, os, sys, time, traceback
from pymongo import MongoClient, ReturnDocument
sys.path.insert(0, os.path.dirname(__file__))
import pipeline

URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true")
DB = MongoClient(URI)[os.environ.get("MONGO_DB", "retailpulse")]
LEASE_S = 1800


def lease():
    now = dt.datetime.utcnow()
    DB.jobs.update_many({"status": "running", "leaseUntil": {"$lt": now}, "attempts": {"$lt": 3}}, {"$set": {"status": "queued"}})
    DB.jobs.update_many({"status": "running", "leaseUntil": {"$lt": now}, "attempts": {"$gte": 3}}, {"$set": {"status": "failed", "error": "lease expired 3 times"}})
    return DB.jobs.find_one_and_update({"status": "queued", "type": "pipeline"}, {"$set": {"status": "running", "startedAt": now, "leaseUntil": now + dt.timedelta(seconds=LEASE_S)}, "$inc": {"attempts": 1}},
                                       sort=[("createdAt", 1)], return_document=ReturnDocument.AFTER)


def main(once=False):
    print("worker started; polling jobs", flush=True)
    while True:
        job = lease()
        if job:
            print(f"job {job['_id']} tenant={job['tenantId']}", flush=True)
            try:
                # collapse duplicate queued jobs for the same tenant (idempotent)
                DB.jobs.update_many({"tenantId": job["tenantId"], "type": "pipeline", "status": "queued", "_id": {"$ne": job["_id"]}}, {"$set": {"status": "superseded"}})
                rep = pipeline.run(job["tenantId"])
                DB.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "done", "finishedAt": dt.datetime.utcnow(), "result": {"series": rep and rep["series"], "recommendations": rep and rep["recommendations"], "seconds": rep and rep["seconds"]}}})
            except Exception as e:
                traceback.print_exc()
                DB.jobs.update_one({"_id": job["_id"]}, {"$set": {"status": "queued" if job.get("attempts", 1) < 3 else "failed", "error": str(e)[:500]}})
        elif once:
            return
        else:
            time.sleep(5)


if __name__ == "__main__":
    main(once="--once" in sys.argv)
