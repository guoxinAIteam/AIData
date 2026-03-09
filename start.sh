#!/usr/bin/env bash
# 本地启动脚本：进入项目目录并启动 Vite 开发服务器
# 经营指标问数需配置 Kimi：复制 .env.local.example 为 .env.local，填写 KIMI_API_KEY 等（不写死 key，仅从环境读取）
cd "$(dirname "$0")"
echo "正在启动语义知识平台..."
npm run start
