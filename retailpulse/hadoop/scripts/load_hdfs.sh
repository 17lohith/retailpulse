#!/usr/bin/env bash
# Stage raw/simulated files into HDFS (idempotent).
source "$(dirname "$0")/env.sh"
hdfs dfs -mkdir -p /retailpulse/raw/{reviews,meta,store_sales,sim,fine_foods}
hdfs dfs -put -f $RP/data/raw/amazon2023/Grocery_and_Gourmet_Food.jsonl /retailpulse/raw/reviews/
hdfs dfs -put -f $RP/data/raw/amazon2023/meta_Grocery_and_Gourmet_Food.jsonl /retailpulse/raw/meta/
hdfs dfs -put -f $RP/data/raw/store_sales/train.csv /retailpulse/raw/store_sales/
for t in demo-a demo-b; do [ -f $RP/data/clean/sim/$t/stock_adjustments.jsonl ] && hdfs dfs -put -f $RP/data/clean/sim/$t/stock_adjustments.jsonl /retailpulse/raw/sim/adjustments_$t.jsonl; done
hdfs dfs -ls -R -h /retailpulse/raw
