#!/bin/zsh
# T1.2 文件校验入口：生成 + 独立校验（用法：tests/files/run-file-checks.sh <配置> <环境清单> <datasetId>）
set -e
cd "$(dirname "$0")/../.."
node generator/generate-files.ts --config "$1" --env "$2"
node generator/verify-files.ts --env "$2" --dataset "$3"
