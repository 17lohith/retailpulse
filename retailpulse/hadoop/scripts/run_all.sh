#!/usr/bin/env bash
# Runs jobs J1..J10 sequentially. Summary -> evidence/hadoop/SUMMARY.txt
cd "$(dirname "$0")"; R=./run_job.sh; RAWREV=/retailpulse/raw/reviews/Grocery_and_Gourmet_Food.jsonl; META=/retailpulse/raw/meta/meta_Grocery_and_Gourmet_Food.jsonl
S=/home/allen/IA-3/retailpulse/evidence/hadoop/SUMMARY.txt; : > $S
run() { "$R" "$@" 2>&1 | head -2 | tee -a $S; }
run J1_token_frequency $RAWREV j1_mapper.py sum_reducer_min.py sum_reducer.py -D mapreduce.job.reduces=4
run J2_product_stats $RAWREV j2_mapper.py j2_reducer.py sum_reducer.py -D mapreduce.job.reduces=4
run J6_verified_helpful $RAWREV j6_mapper.py sum_reducer.py sum_reducer.py
run J4_join_reviews_meta "$RAWREV $META" j4_mapper.py j4_reducer.py - -D mapreduce.job.reduces=4
run J4b_priceband_category /retailpulse/out/J4_join_reviews_meta j4b_mapper.py sum_reducer.py sum_reducer.py
run J5_brand_ranking /retailpulse/out/J4_join_reviews_meta j5_mapper.py sum_reducer.py sum_reducer.py
run J7_family_month /retailpulse/raw/store_sales/train.csv j7_mapper.py sum_reducer.py sum_reducer.py
run J8_promo_lift /retailpulse/raw/store_sales/train.csv j8_mapper.py sum_reducer.py sum_reducer.py
run J9_weekday_profile /retailpulse/raw/store_sales/train.csv j9_mapper.py sum_reducer.py sum_reducer.py
EXTRA_FILES=$RP/hadoop/streaming/products_all.jsonl run J10_waste_by_family "/retailpulse/raw/sim/adjustments_demo-a.jsonl /retailpulse/raw/sim/adjustments_demo-b.jsonl" j10_mapper.py sum_reducer.py sum_reducer.py
echo ALL_DONE >> $S
