# RetailPulse (code) — local stack
- MongoDB 7.0 in Docker (`retailpulse-mongo`, 127.0.0.1:27017). Not 8.x: kernel 7.0.0-31 incompatibility (see docs/logs/TRIAL_ERROR.md).
- Hadoop 3.4.3 single-node (HDFS + YARN) at ~/tools/hadoop; Web UIs: NameNode http://localhost:9870, YARN http://localhost:8088
- Python 3.12 venv: `source .venv/bin/activate`
- `infra/stack.sh start|stop|status`
- Layout: backend/ frontend/ hadoop/streaming/ loaders/ validation/ cloud/ (teammate, deferred) data/ evidence/
