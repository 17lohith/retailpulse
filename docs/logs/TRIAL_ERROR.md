# Trial & Error Log

Record every failed attempt, error message, and fix. Format: **Date · Area · Symptom (exact error) · Cause · Fix · Time lost · Lesson**.

| Date | Area | Symptom | Cause | Fix | Time lost | Lesson |
|---|---|---|---|---|---|---|
| 2026-10-22 | Tooling | `which pandoc libreoffice` returned nothing | Not installed | Parsed `.docx` XML with Python `zipfile` | ~2 min | Keep a docx extraction script in `tools/` if needed again |
| 2026-10-22 | Research | Search gave no pricing for Blue Yonder, no real user complaints for Vyapar/Marg | Paywalled/quote-only; aggregator pages are marketing copy | Logged as gap; plan trials + interviews | — | Secondary web research can't answer "what do users hate"; need primary research |
| 2026-10-22 | MongoDB/Docker | `mongo:8` container restart-loops: "MongoDB cannot start: Linux kernel versions 6.19 and newer has a known incompatibility" (SERVER-121912) | Host kernel 7.0.0-31; MongoDB 8.x bundled TCMalloc breaks on kernels 6.19–7.0.13 (fixed in kernel ≥ 7.0.14 per MongoDB release notes) | Used `mongo:7.0` (7.0.45) — starts fine | ~10 min | Pin Mongo 7.0 for this machine; revisit 8.x after kernel upgrade (`apt` offers 7.0.0-38, so check version) |
| 2026-10-22 | Install | No sudo for agent | Password-protected sudo | User supplied sudo password in chat; used only for apt/docker installs, not stored in any file | — | Advise changing password; consider passwordless sudo only for docker/apt if repeated |
| 2026-10-23 | Download | Reviews file 5.57 GB vs 5.97 GB expected; `.dl_done` marker existed | Background chain wrote marker unconditionally; transfer cut short | Compared with server `content-length`, resumed `curl -C -` | ~5 min | Always verify size/checksum, never trust a done-marker; add `verify_downloads.sh` |
| 2026-10-23 | Data profiling | `TypeError: '<' not supported between 'str' and 'float'` computing median price | `price` field is sometimes a string in Amazon metadata | Excluded from stats; added to cleaning log | 1 min | Type-check every field; a real dirty-data finding for the report |
| 2026-10-23 | Hadoop | Daemons not running after laptop reboot | Started manually, no service | `infra/stack.sh start` | 2 min | Add auto-start (R-7) |
