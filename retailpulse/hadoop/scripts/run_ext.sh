#!/usr/bin/env bash
# External-dataset Hadoop jobs (X1..X8). Summary -> evidence/hadoop/SUMMARY_EXT.txt
cd "$(dirname "$0")"; source ./env.sh; R=./run_job.sh; X=$RP/data/raw/external; C=$RP/data/clean/ext; ST=$RP/hadoop/streaming
S=$RP/evidence/hadoop/SUMMARY_EXT.txt; : > $S
run() { "$R" "$@" 2>&1 | head -2 | tee -a $S; }
hdfs dfs -mkdir -p /retailpulse/ext
for f in "instacart/order_products__prior.csv:$X/instacart-market-basket-analysis/order_products__prior.csv" "instacart/orders.csv:$X/instacart-market-basket-analysis/orders.csv" "dunnhumby/transaction_data.csv:$X/dunnhumby-the-complete-journey/transaction_data.csv" \
         "retail/online_retail_II.csv:$X/online-retail-ii-uci/online_retail_II.csv" "m5/m5_sales.csv:$C/m5_sales.csv" "supermarket/inventory_management.csv:$X/supermarket-inventory-and-demand-synthetic/inventory_management.csv" "rc/rc_superstore.jsonl:$C/rc_superstore.jsonl"; do
  d=/retailpulse/ext/${f%%:*}; hdfs dfs -mkdir -p $(dirname $d); hdfs dfs -put -f ${f#*:} $d; done
E=/retailpulse/ext
# --- Instacart: Apriori-style chain (support -> baskets of frequent items -> pair counts)
run X1_item_support $E/instacart/order_products__prior.csv x1_support_mapper.py sum_reducer_min.py sum_reducer.py -D mapreduce.reduce.env=MIN_COUNT=3000 -D mapreduce.job.reduces=2
cp $RP/data/clean/mr/X1_item_support.tsv $ST/frequent_items.txt
EXTRA_FILES=$ST/frequent_items.txt run X1b_frequent_baskets $E/instacart/order_products__prior.csv x1b_baskets_mapper.py x1b_baskets_reducer.py - -D mapreduce.job.reduces=6
run X1c_pair_counts /retailpulse/out/X1b_frequent_baskets x1c_pairs_mapper.py sum_reducer_min.py sum_reducer.py -D mapreduce.reduce.env=MIN_COUNT=300 -D mapreduce.job.reduces=4
EXTRA_FILES=$X/instacart-market-basket-analysis/products.csv run X2_reorder_by_department $E/instacart/order_products__prior.csv x2_reorder_mapper.py sum_reducer.py sum_reducer.py
run X3_order_timing $E/instacart/orders.csv x3_orders_mapper.py sum_reducer.py sum_reducer.py
# --- Dunnhumby
EXTRA_FILES=$X/dunnhumby-the-complete-journey/product.csv run X4_discount_depth $E/dunnhumby/transaction_data.csv x4_dh_mapper.py sum_reducer.py sum_reducer.py -D mapreduce.job.reduces=2
run X4b_basket_sizes $E/dunnhumby/transaction_data.csv x4b_basket_mapper.py x4b_basket_reducer.py - -D mapreduce.job.reduces=4
run X4c_basket_size_histogram /retailpulse/out/X4b_basket_sizes x4c_passthrough_mapper.py sum_reducer.py sum_reducer.py
# --- Online Retail II
run X5_online_retail $E/retail/online_retail_II.csv x5_retail_mapper.py sum_reducer.py sum_reducer.py
# --- M5
run X6_m5_demand_classes $E/m5/m5_sales.csv x6_m5_mapper.py x6_m5_reducer.py sum_reducer.py -D mapreduce.job.reduces=4
run X6b_class_by_department /retailpulse/out/X6_m5_demand_classes x6b_class_mapper.py sum_reducer.py sum_reducer.py
# --- synthetic supermarket waste + RC Superstore price drift
run X7_supermarket_waste $E/supermarket/inventory_management.csv x7_waste_mapper.py sum_reducer.py sum_reducer.py
run X8_price_drift $E/rc/rc_superstore.jsonl x8_rc_mapper.py x8_rc_reducer.py - -D mapreduce.job.reduces=2
echo ALL_DONE >> $S
