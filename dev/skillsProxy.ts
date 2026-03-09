import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const SKILLS_SITE_ORIGIN = "https://skills.sh";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SKILL_ROWS = 200;

type SkillMode = "all" | "trending" | "hot";

interface ParsedLeaderboardSkill {
  id: string;
  rank: number;
  name: string;
  owner: string;
  repository: string;
  skill: string;
  path: string;
  detailUrl: string;
  installsText: string;
  installsCount: number;
}

interface ParsedSkillDetail {
  summary: string;
  content: string;
  tags: string[];
  applicableScenes: string[];
}

const modePathMap: Record<SkillMode, string> = {
  all: "/",
  trending: "/trending",
  hot: "/hot",
};

const entityMap: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

function nowText() {
  return new Date().toISOString();
}

function toSkillMode(input: string | null): SkillMode {
  if (input === "trending" || input === "hot") {
    return input;
  }
  return "all";
}

function toLimit(input: string | null) {
  if (!input) {
    return 80;
  }
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 80;
  }
  return Math.min(parsed, MAX_SKILL_ROWS);
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (raw) => entityMap[raw] ?? raw);
}

function cleanText(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseInstallCount(text: string) {
  const normalized = text.trim().replace(/,/g, "").toUpperCase();
  const numeric = Number.parseFloat(normalized);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  if (normalized.endsWith("K")) {
    return Math.round(numeric * 1_000);
  }
  if (normalized.endsWith("M")) {
    return Math.round(numeric * 1_000_000);
  }
  if (normalized.endsWith("B")) {
    return Math.round(numeric * 1_000_000_000);
  }
  return Math.round(numeric);
}

function makeOfficialSkillId(owner: string, repository: string, skill: string) {
  const safe = `${owner}-${repository}-${skill}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `skill-official-${safe}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "未知错误";
}

function extractBalancedDiv(html: string, startIndex: number): string | null {
  const openIndex = html.indexOf("<div", startIndex);
  if (openIndex < 0) {
    return null;
  }

  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = openIndex;
  let depth = 0;
  let sectionStart = -1;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    if (sectionStart < 0) {
      sectionStart = match.index;
    }
    if (match[0].startsWith("</")) {
      depth -= 1;
    } else {
      depth += 1;
    }
    if (depth === 0 && sectionStart >= 0) {
      return html.slice(sectionStart, tagRegex.lastIndex);
    }
  }

  return null;
}

function htmlToReadableText(html: string): string {
  const content = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<h1[^>]*>/gi, "\n# ")
    .replace(/<h2[^>]*>/gi, "\n## ")
    .replace(/<h3[^>]*>/gi, "\n### ")
    .replace(/<h4[^>]*>/gi, "\n#### ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(h1|h2|h3|h4|h5|h6|p|li|div|section|article|pre|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<code[^>]*>/gi, "`")
    .replace(/<\/code>/gi, "`")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(content).replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function dedupeTextList(list: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  list.forEach((item) => {
    const cleaned = item.trim();
    if (!cleaned) {
      return;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(cleaned);
  });
  return result;
}

function parseSkillDetail(html: string): ParsedSkillDetail {
  const skillMdMarker = html.indexOf("<span>SKILL.md</span>");
  let detailBlock = "";
  if (skillMdMarker >= 0) {
    const proseStart = html.indexOf("<div class=\"prose", skillMdMarker);
    if (proseStart >= 0) {
      detailBlock = extractBalancedDiv(html, proseStart) ?? "";
    }
  }
  if (!detailBlock) {
    const mainStart = html.indexOf("<main");
    detailBlock =
      mainStart >= 0
        ? html.slice(mainStart, Math.min(html.length, mainStart + 18_000))
        : html.slice(0, 18_000);
  }

  const readable = htmlToReadableText(detailBlock);
  const lines = readable
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summary =
    lines.find((line) => !line.startsWith("#") && !line.startsWith("-")) ??
    "来自 skills.sh 的 Skill 详情。";
  const headings = lines
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, ""))
    .slice(0, 6);
  const bullets = lines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2))
    .slice(0, 10);
  const tags = dedupeTextList(
    headings.map((item) => item.replace(/[.,，。:：].*$/, "")).filter((item) => item.length <= 20),
  ).slice(0, 8);
  const applicableScenes = dedupeTextList(bullets).slice(0, 6);

  return {
    summary: summary.slice(0, 220),
    content: readable.slice(0, 16_000),
    tags,
    applicableScenes:
      applicableScenes.length > 0 ? applicableScenes : ["Agent 能力扩展", "工作流自动化", "知识增强"],
  };
}

function parseLeaderboard(html: string): ParsedLeaderboardSkill[] {
  const rows: ParsedLeaderboardSkill[] = [];
  const seenPath = new Set<string>();
  const anchorRegex = /<a[^>]+href="\/([^"/?#]+)\/([^"/?#]+)\/([^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const owner = decodeURIComponent(match[1]);
    const repository = decodeURIComponent(match[2]);
    const skill = decodeURIComponent(match[3]);
    const path = `/${owner}/${repository}/${skill}`;
    if (seenPath.has(path)) {
      continue;
    }

    const block = match[4];
    const nameMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const repoMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const spanTexts = Array.from(block.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi))
      .map((item) => cleanText(item[1]))
      .filter(Boolean);

    const name = cleanText(nameMatch?.[1] ?? skill);
    const repoText = cleanText(repoMatch?.[1] ?? `${owner}/${repository}`);
    if (!repoText.includes("/")) {
      continue;
    }

    const rankText = spanTexts.find((item) => /^\d+$/.test(item)) ?? `${rows.length + 1}`;
    const installsText =
      [...spanTexts].reverse().find((item) => /^\d+(\.\d+)?[KMB]?$/.test(item)) ?? "0";

    rows.push({
      id: makeOfficialSkillId(owner, repository, skill),
      rank: Number.parseInt(rankText, 10) || rows.length + 1,
      name,
      owner,
      repository,
      skill,
      path,
      detailUrl: `${SKILLS_SITE_ORIGIN}${path}`,
      installsText,
      installsCount: parseInstallCount(installsText),
    });
    seenPath.add(path);

    if (rows.length >= MAX_SKILL_ROWS) {
      break;
    }
  }

  if (rows.length === 0) {
    throw new Error("未从 skills.sh 解析到榜单，请检查页面结构是否变化");
  }

  return rows.sort((a, b) => a.rank - b.rank);
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SemanticKnowledgePlatform/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`上游返回 ${response.status} ${response.statusText}`);
    }
    return response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`请求 skills.sh 超时（>${REQUEST_TIMEOUT_MS}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadLeaderboard(mode: SkillMode) {
  const path = modePathMap[mode];
  const html = await fetchText(`${SKILLS_SITE_ORIGIN}${path}`);
  return parseLeaderboard(html);
}

async function loadSkillDetail(owner: string, repository: string, skill: string) {
  const detailUrl = `${SKILLS_SITE_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(
    repository,
  )}/${encodeURIComponent(skill)}`;
  const html = await fetchText(detailUrl);
  const detail = parseSkillDetail(html);
  return {
    detailUrl,
    ...detail,
  };
}

function sendJson(res: ServerResponse<IncomingMessage>, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function createSkillsProxyPlugin(): Plugin {
  return {
    name: "vite-skills-local-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }

        const requestUrl = new URL(req.url, "http://localhost");
        if (!requestUrl.pathname.startsWith("/api/skills")) {
          next();
          return;
        }

        // 文件解析由 capabilityApi 处理，交给下一个中间件
        if (req.method === "POST" && requestUrl.pathname === "/api/skills/import/parse") {
          next();
          return;
        }

        try {
          if (req.method === "GET" && requestUrl.pathname === "/api/skills/list") {
            const mode = toSkillMode(requestUrl.searchParams.get("mode"));
            const limit = toLimit(requestUrl.searchParams.get("limit"));
            const rows = await loadLeaderboard(mode);
            sendJson(res, 200, {
              success: true,
              mode,
              fetchedAt: nowText(),
              total: rows.length,
              items: rows.slice(0, limit),
            });
            return;
          }

          if (req.method === "POST" && requestUrl.pathname === "/api/skills/sync") {
            const mode = toSkillMode(requestUrl.searchParams.get("mode"));
            const rows = await loadLeaderboard(mode);
            sendJson(res, 200, {
              success: true,
              mode,
              lastSyncAt: nowText(),
              total: rows.length,
              items: rows,
            });
            return;
          }

          if (req.method === "GET" && requestUrl.pathname === "/api/skills/detail") {
            const owner = requestUrl.searchParams.get("owner")?.trim();
            const repository = requestUrl.searchParams.get("repo")?.trim();
            const skill = requestUrl.searchParams.get("skill")?.trim();
            if (!owner || !repository || !skill) {
              sendJson(res, 400, {
                success: false,
                error: "缺少必要参数：owner/repo/skill",
              });
              return;
            }
            const detail = await loadSkillDetail(owner, repository, skill);
            sendJson(res, 200, {
              success: true,
              fetchedAt: nowText(),
              item: {
                owner,
                repository,
                skill,
                ...detail,
              },
            });
            return;
          }

          sendJson(res, 404, {
            success: false,
            error: "未找到 API 路由",
          });
        } catch (error) {
          sendJson(res, 502, {
            success: false,
            error: getErrorMessage(error),
          });
        }
      });
    },
  };
}
