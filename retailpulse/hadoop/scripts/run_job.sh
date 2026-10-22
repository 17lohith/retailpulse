#!/usr/bin/env bash
# usage: run_job.sh NAME "INPUT1 [INPUT2..]" MAPPER REDUCER [COMBINER|-] [extra streaming args...]
# Runs a Hadoop Streaming job; logs counters+timing to evidence/hadoop/NAME.log; copies output to data/clean/mr/NAME.tsv
source "$(dirname "$0")/env.sh"
NAME=$1; INPUTS=$2; MAP=$3; RED=$4; COMB=${5:--}; shift 5 2>/dev/null
LOG=$RP/evidence/hadoop/$NAME.log; mkdir -p $RP/data/clean/mr $RP/evidence/hadoop
OUT=/retailpulse/out/$NAME; hdfs dfs -rm -r -f -skipTrash $OUT >/dev/null 2>&1
INARGS=""; for i in $INPUTS; do INARGS="$INARGS -input $i"; done
FILES="$RP/hadoop/streaming/common.py,$RP/hadoop/streaming/$MAP,$RP/hadoop/streaming/$RED"
[ -n "$EXTRA_FILES" ] && FILES="$FILES,$EXTRA_FILES"
CARG=""; if [ "$COMB" != "-" ]; then CARG="-combiner $COMB"; FILES="$FILES,$RP/hadoop/streaming/$COMB"; fi
START=$(date +%s)
{ echo "# JOB $NAME  $(date -Is)"; echo "# inputs: $INPUTS  mapper=$MAP reducer=$RED combiner=$COMB extra=$*"; } > $LOG
hadoop jar $STREAMING_JAR -D mapreduce.job.name=rp-$NAME "${@}" \
  -files "$FILES" -cmdenv PYTHONPATH=. $INARGS -output $OUT -mapper "python3 $MAP" -reducer "python3 $RED" $CARG >> $LOG 2>&1
RC=$?
END=$(date +%s)
echo "# exit=$RC elapsed_s=$((END-START))" >> $LOG
hdfs dfs -cat "$OUT/part-*" > $RP/data/clean/mr/$NAME.tsv 2>/dev/null
echo "$NAME exit=$RC elapsed=$((END-START))s rows=$(wc -l < $RP/data/clean/mr/$NAME.tsv)"
grep -E "Cleaning|Join|Map input records|Reduce output records|HDFS: Number of bytes read|Launched map tasks|Launched reduce tasks|CPU time" $LOG | sed 's/^\s*//' | tr '\n' ';' | cut -c1-900; echo
