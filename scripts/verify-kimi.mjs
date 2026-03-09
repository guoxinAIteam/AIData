#!/usr/bin/env node
/**
 * 验证 .env.local 中 KIMI_API_KEY 的可用性：调用 Kimi 接口发一条简单请求。
 * 用法：node scripts/verify-kimi.mjs（需在项目根目录执行）
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = value;
    }
    return env;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error("未找到 .env.local，请复制 .env.local.example 为 .env.local 并填写 KIMI_API_KEY");
      process.exit(1);
    }
    throw e;
  }
}

async function main() {
  const env = loadEnvLocal();
  const apiKey = env.KIMI_API_KEY;
  const baseUrl = (env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/$/, "");
  const model = env.KIMI_MODEL || "moonshot-v1-8k";

  if (!apiKey?.trim()) {
    console.error("KIMI_API_KEY 为空，请在 .env.local 中填写");
    process.exit(1);
  }

  console.log("正在验证 Kimi API Key...");
  console.log("  BASE_URL:", baseUrl);
  console.log("  MODEL:", model);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "回复：OK" }],
        max_tokens: 10,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("Kimi 接口返回异常:", res.status, text.slice(0, 300));
      process.exit(1);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("响应非 JSON:", text.slice(0, 200));
      process.exit(1);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (content !== undefined) {
      console.log("验证成功。Kimi 回复:", content);
    } else {
      console.log("验证成功。（无 content，usage:", data.usage ?? "无", ")");
    }
    console.log("API Key 可用。");
  } catch (e) {
    console.error("请求失败:", e.message || e);
    process.exit(1);
  }
}

main();
