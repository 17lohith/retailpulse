#!/usr/bin/env bash
# Start/stop/status the local RetailPulse stack (MongoDB container + Hadoop single-node).
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 HADOOP_HOME=$HOME/tools/hadoop
export PATH=$HADOOP_HOME/bin:$HADOOP_HOME/sbin:$PATH
case "$1" in
  start) docker start retailpulse-mongo 2>/dev/null || sudo docker start retailpulse-mongo
         hdfs --daemon start namenode; hdfs --daemon start datanode
         yarn --daemon start resourcemanager; yarn --daemon start nodemanager ;;
  stop)  yarn --daemon stop nodemanager; yarn --daemon stop resourcemanager
         hdfs --daemon stop datanode; hdfs --daemon stop namenode
         docker stop retailpulse-mongo 2>/dev/null || sudo docker stop retailpulse-mongo ;;
  status) jps | grep -E "NameNode|DataNode|ResourceManager|NodeManager"; docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null || sudo docker ps --format '{{.Names}} {{.Status}}' ;;
  hadoop-start) hdfs --daemon start namenode; hdfs --daemon start datanode; yarn --daemon start resourcemanager; yarn --daemon start nodemanager ;;
  hadoop-stop) yarn --daemon stop nodemanager; yarn --daemon stop resourcemanager; hdfs --daemon stop datanode; hdfs --daemon stop namenode ;;
  *) echo "usage: $0 start|stop|status|hadoop-start|hadoop-stop"; exit 1 ;;
esac
