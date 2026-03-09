/**
 * 本地 Node 能力层：Skill 解析、报告导出、指标导出、本体 OWL/RDF 导入导出、经营指标问数 Excel 知识包。
 * 在 Vite 开发服务器中作为中间件挂载。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import * as fs from "node:fs";
import * as mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import formidable from "formidable";
import {
  getDefaultFixedPath,
  loadKnowledgePackFromPath,
  loadKnowledgePackFromBuffer,
  buildStandardizationDoc,
  matchRuleAndTemplate,
  inferMetricsFromKnowledgePack,
  inferDimensionsFromKnowledgePack,
  buildKnowledgeCollectionFromPack,
  type KnowledgePack,
} from "./metricsExcelEngine";
import { parseExcelToSkillDraft } from "./skillExcelParser";
import { parseReferenceLabels, parseSampleRows, buildExportWorkbook } from "./questionLabelingExcel";
import { Store, Parser, Writer, DataFactory } from "n3";
import type { Quad } from "n3";

const REQUEST_TIMEOUT_MS = 30_000;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, statusCode: number, message: string, detail?: string) {
  sendJson(res, statusCode, { success: false, error: message, detail });
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "未知错误";
}

/** 经营指标问数 Excel 知识包缓存（内存） */
let metricsKnowledgePack: KnowledgePack | null = null;

function getOrLoadMetricsPack(): KnowledgePack | null {
  if (metricsKnowledgePack) return metricsKnowledgePack;
  const path = getDefaultFixedPath();
  try {
    if (fs.existsSync(path)) {
      metricsKnowledgePack = loadKnowledgePackFromPath(path);
      return metricsKnowledgePack;
    }
  } catch {
    // ignore
  }
  return null;
}

/** POST /api/metrics/excel/reload：按固定路径重载知识包 */
async function handleMetricsExcelReload(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = getDefaultFixedPath();
  try {
    if (!fs.existsSync(path)) {
      sendError(res, 404, "固定路径文件不存在", path);
      return true;
    }
    metricsKnowledgePack = loadKnowledgePackFromPath(path);
    sendJson(res, 200, {
      success: true,
      version: metricsKnowledgePack.version,
      updatedAt: metricsKnowledgePack.updatedAt,
      sourcePath: path,
    });
  } catch (e) {
    sendError(res, 500, "重载失败", getErrorMessage(e));
  }
  return true;
}

/** POST /api/metrics/excel/upload：上传 Excel 覆盖当前知识包 */
async function handleMetricsExcelUpload(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return new Promise((resolve) => {
    const form = formidable({ maxFileSize: 20 * 1024 * 1024, maxFiles: 1 });
    form.parse(req, async (err: Error | null, _fields: formidable.Fields, files: formidable.Files) => {
      if (err) {
        sendError(res, 400, "解析表单失败", getErrorMessage(err));
        resolve(true);
        return;
      }
      const fileList = Array.isArray(files.file) ? files.file : files.file ? [files.file] : [];
      const file = fileList[0];
      if (!file || !file.filepath) {
        sendError(res, 400, "未上传文件", "请选择 .xlsx 文件");
        resolve(true);
        return;
      }
      const name = (file.originalFilename || "").toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        sendError(res, 400, "格式不支持", "仅支持 .xlsx / .xls");
        resolve(true);
        return;
      }
      try {
        const buf = fs.readFileSync(file.filepath);
        metricsKnowledgePack = loadKnowledgePackFromBuffer(buf, name);
        sendJson(res, 200, {
          success: true,
          version: metricsKnowledgePack.version,
          updatedAt: metricsKnowledgePack.updatedAt,
          sourcePath: "uploaded",
        });
      } catch (e) {
        sendError(res, 500, "解析 Excel 失败", getErrorMessage(e));
      }
      resolve(true);
    });
  });
}

/** GET /api/metrics/excel/profile：返回知识包摘要 */
async function handleMetricsExcelProfile(_req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pack = getOrLoadMetricsPack();
  if (!pack) {
    sendJson(res, 200, {
      success: true,
      loaded: false,
      message: "未加载知识包，请使用固定路径重载或上传 Excel",
    });
    return true;
  }
  sendJson(res, 200, {
    success: true,
    loaded: true,
    version: pack.version,
    updatedAt: pack.updatedAt,
    sourcePath: pack.sourcePath,
    lexiconCount: pack.lexicon.length,
    dictionaryCount: pack.dataDictionary.length,
    relationsCount: pack.tableRelations.length,
    sqlTemplateCount: pack.sqlTemplates.length,
    outputSpecColumns: pack.outputSpec.columns.map((c) => ({ key: c.key, label: c.label, dataType: c.dataType })),
    outputDataRowCount: pack.outputDataRows.length,
  });
  return true;
}

/** GET /api/metrics/excel/standardization-doc：返回《Excel 内容标准化梳理文档》Markdown */
async function handleMetricsExcelStandardizationDoc(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pack = getOrLoadMetricsPack();
  if (!pack) {
    sendError(res, 404, "未加载知识包", "请先通过重载或上传加载 Excel 知识包");
    return true;
  }
  const markdown = buildStandardizationDoc(pack);
  const url = new URL(req.url!, "http://localhost");
  const download = url.searchParams.get("download") === "1";
  if (download) {
    const buf = Buffer.from(markdown, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Excel内容标准化梳理文档.md"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }
  sendJson(res, 200, { success: true, content: markdown, version: pack.version });
  return true;
}

/** 从 Markdown 文本解析出 Skill 草稿 */
function parseSkillDraftFromMarkdown(text: string): Record<string, unknown> {
  const checklist = extractChecklistFromTextInApi(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let name = "";
  let summary = "";
  const contentParts: string[] = [];
  const tags: string[] = [];
  const applicableScenes: string[] = [];
  const category = "用户创建";
  let inSummary = true;
  let inContent = false;
  let sectionTitle = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (line.startsWith("# ")) {
      name = line.replace(/^#\s+/, "").trim();
      inSummary = true;
      inContent = false;
      continue;
    }
    if (line.startsWith("## ")) {
      sectionTitle = line.replace(/^##\s+/, "").trim();
      inSummary = false;
      inContent = true;
      if (sectionTitle.toLowerCase().includes("tag") || sectionTitle === "标签") {
        const rest = lines.slice(i + 1).join(" ").split(/[,，、\s]+/).filter(Boolean).slice(0, 10);
        tags.push(...rest);
      } else if (sectionTitle.toLowerCase().includes("scene") || sectionTitle === "适用场景") {
        const rest = lines.slice(i + 1).filter((l) => l.startsWith("- ")).map((l) => l.replace(/^-\s+/, "")).slice(0, 8);
        applicableScenes.push(...rest);
      }
      contentParts.push(line);
      continue;
    }
    if (inSummary && !inContent && line.length > 0) {
      summary = line.slice(0, 300);
      inSummary = false;
      inContent = true;
    }
    if (inContent) contentParts.push(line);
  }

  const content = contentParts.join("\n").trim() || text.slice(0, 15000);
  return {
    name: name || "未命名 Skill",
    summary: summary || content.slice(0, 200) || "从文件导入",
    content: content || text,
    tags: tags.length ? tags : ["导入"],
    applicableScenes: applicableScenes.length ? applicableScenes : ["通用"],
    category,
    ...checklist,
  };
}

const CHECKLIST_LABELS_API: Record<string, string> = {
  triggerCondition: "触发条件",
  inputSpec: "输入",
  steps: "步骤",
  checkCriteria: "检查",
  abortCondition: "中止条件",
  recoveryMethod: "恢复方式",
};

function extractChecklistFromTextInApi(text: string): Record<string, string> {
  const keys = ["triggerCondition", "inputSpec", "steps", "checkCriteria", "abortCondition", "recoveryMethod"];
  const result: Record<string, string> = {};
  for (const k of keys) result[k] = "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let currentKey: string | null = null;
  const currentLines: string[] = [];

  const flush = () => {
    if (currentKey && currentLines.length > 0) {
      result[currentKey] = currentLines.join("\n").trim().slice(0, 2000);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    let matched: string | null = null;
    for (const key of keys) {
      const label = CHECKLIST_LABELS_API[key];
      if (
        trimmed === label ||
        trimmed.startsWith(label + "：") ||
        trimmed.startsWith(label + ":") ||
        new RegExp("^#+\\s*" + label + "\\s*[：:]?").test(trimmed) ||
        new RegExp("^【?" + label + "】?\\s*[：:]?").test(trimmed)
      ) {
        matched = key;
        break;
      }
    }
    if (matched) {
      flush();
      currentKey = matched;
      const afterColon = trimmed
        .replace(new RegExp("^((#+\\s*|【?)?)" + CHECKLIST_LABELS_API[matched] + "(】?\\s*[：:]?\\s*)", "i"), "")
        .trim();
      currentLines.length = 0;
      if (afterColon) currentLines.push(afterColon);
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();
  return result;
}

/** 从 Word 纯文本解析草稿（简单启发式） */
function parseSkillDraftFromPlainText(text: string): Record<string, unknown> {
  const checklist = extractChecklistFromTextInApi(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const name = lines[0]?.slice(0, 100) || "未命名 Skill";
  const summary = lines[1]?.slice(0, 300) || lines[0]?.slice(0, 200) || "从文件导入";
  const content = text.slice(0, 15000);
  return {
    name,
    summary,
    content,
    tags: ["导入"],
    applicableScenes: ["通用"],
    category: "用户创建",
    ...checklist,
  };
}

/** POST /api/skills/import/parse：解析 md/doc/docx，返回 Skill 草稿 */
async function handleSkillsImportParse(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return new Promise((resolve) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 1,
    });
    form.parse(req, async (err: Error | null, _fields: formidable.Fields, files: formidable.Files) => {
      if (err) {
        sendError(res, 400, "解析表单失败", getErrorMessage(err));
        resolve(true);
        return;
      }
      const fileList = Array.isArray(files.file) ? files.file : files.file ? [files.file] : [];
      const file = fileList[0];
      if (!file || !file.filepath) {
        sendError(res, 400, "未上传文件", "请上传 .md / .doc / .docx / .pdf / .xlsx / .xls 文件");
        resolve(true);
        return;
      }
      const name = (file.originalFilename || "").toLowerCase();
      const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
      const isPdf = name.endsWith(".pdf");
      if (!name.endsWith(".md") && !name.endsWith(".doc") && !name.endsWith(".docx") && !isPdf && !isExcel) {
        sendError(res, 400, "格式不支持", "仅支持 .md、.doc、.docx、.pdf、.xlsx、.xls");
        resolve(true);
        return;
      }

      try {
        if (isExcel) {
          const fs = await import("node:fs");
          const buffer = fs.readFileSync(file.filepath);
          const result = parseExcelToSkillDraft(buffer, file.originalFilename ?? undefined);
          if ("error" in result) {
            sendError(res, 400, "Excel 校验失败", result.error);
            resolve(true);
            return;
          }
          sendJson(res, 200, { success: true, draft: result.draft });
          resolve(true);
          return;
        }

        let text: string;
        if (name.endsWith(".md")) {
          const fs = await import("node:fs");
          text = fs.readFileSync(file.filepath, "utf-8");
        } else if (isPdf) {
          const fs = await import("node:fs");
          const { PDFParse } = await import("pdf-parse");
          const buffer = fs.readFileSync(file.filepath);
          const parser = new PDFParse({ data: buffer });
          try {
            const result = await parser.getText();
            text = result?.text ?? "";
          } finally {
            await parser.destroy();
          }
        } else {
          const result = await mammoth.extractRawText({ path: file.filepath });
          text = result.value;
        }
        if (!text || !text.trim()) {
          sendError(res, 400, "内容为空", "文件中无有效文本，请检查文件");
          resolve(true);
          return;
        }
        const draft = name.endsWith(".md")
          ? parseSkillDraftFromMarkdown(text)
          : parseSkillDraftFromPlainText(text);
        sendJson(res, 200, { success: true, draft });
      } catch (e) {
        sendError(res, 500, "解析失败", getErrorMessage(e));
      }
      resolve(true);
    });
  });
}

/** 打标任务在能力层内存中的存储，供 GET :jobId 轮询 */
const questionLabelingJobsMap = new Map<
  string,
  {
    id: string;
    name?: string;
    referenceLabels: string[];
    rows: Array<{
      id: string;
      touchpoint: string;
      sessionTag: string;
      sessionSummary: string;
      knowledgeTitle: string;
      knowledgeAnswer: string;
      province: string;
      summary: string;
      modelLabel: string;
      manualLabel?: string;
    }>;
    createdAt: string;
    updatedAt: string;
    createdByUserId?: string;
    createdByName?: string;
    totalPromptTokens?: number;
    totalCompletionTokens?: number;
  }
>();

/** POST /api/question-labeling/parse：解析参考问题分类表 + 样例问题清单两个 Excel */
async function handleQuestionLabelingParse(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  return new Promise((resolve) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 2,
    });
    form.parse(req, async (err: Error | null, _fields: formidable.Fields, files: formidable.Files) => {
      if (err) {
        sendError(res, 400, "解析表单失败", getErrorMessage(err));
        resolve(true);
        return;
      }
      const refList = Array.isArray(files.reference) ? files.reference : files.reference ? [files.reference] : [];
      const sampleList = Array.isArray(files.sample) ? files.sample : files.sample ? [files.sample] : [];
      const refFile = refList[0];
      const sampleFile = sampleList[0];
      if (!refFile?.filepath || !sampleFile?.filepath) {
        sendError(res, 400, "缺少文件", "请同时上传「参考问题分类表」(reference) 和「样例问题清单」(sample) 两个 Excel 文件");
        resolve(true);
        return;
      }
      const refName = (refFile.originalFilename || "").toLowerCase();
      const sampleName = (sampleFile.originalFilename || "").toLowerCase();
      if (!refName.endsWith(".xlsx") && !refName.endsWith(".xls")) {
        sendError(res, 400, "参考问题分类表格式错误", "仅支持 .xlsx / .xls");
        resolve(true);
        return;
      }
      if (!sampleName.endsWith(".xlsx") && !sampleName.endsWith(".xls")) {
        sendError(res, 400, "样例问题清单格式错误", "仅支持 .xlsx / .xls");
        resolve(true);
        return;
      }
      try {
        const fs = await import("node:fs");
        const refBuffer = fs.readFileSync(refFile.filepath);
        const sampleBuffer = fs.readFileSync(sampleFile.filepath);
        const referenceLabels = parseReferenceLabels(refBuffer);
        const sampleRows = parseSampleRows(sampleBuffer);
        sendJson(res, 200, { success: true, referenceLabels, sampleRows });
      } catch (e) {
        sendError(res, 500, "解析失败", getErrorMessage(e));
      }
      resolve(true);
    });
  });
}

/** 调用 Kimi 返回结构化 JSON（用于 generate-checklist 等）；遇 429 时等待后重试一次 */
async function callKimiJson<T>(systemPrompt: string, userContent: string): Promise<{ data: T; promptTokens: number; completionTokens: number }> {
  const apiKey = process.env.KIMI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("未配置 KIMI_API_KEY");
  }
  const baseUrl = (process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1").replace(/\/$/, "");
  const model = process.env.KIMI_MODEL || "moonshot-v1-8k";

  const doRequest = async (): Promise<Response> => {
    return fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });
  };

  let chatRes = await doRequest();
  if (chatRes.status === 429) {
    await new Promise((r) => setTimeout(r, 2500));
    chatRes = await doRequest();
  }

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    throw new Error(`Kimi 接口异常: ${chatRes.status} ${errText.slice(0, 200)}`);
  }
  const chatData = (await chatRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = chatData.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Kimi 返回为空");
  }
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content) as T;
  const usage = chatData.usage;
  return {
    data: parsed,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}

/** POST /api/skills/import/generate-checklist：根据草稿内容调用 Kimi 生成 6 项检查清单 */
async function handleSkillsImportGenerateChecklist(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: { draft?: { name?: string; summary?: string; content?: string } };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const draft = payload.draft ?? {};
  const content = [draft.name, draft.summary, draft.content].filter(Boolean).join("\n\n");
  if (!content.trim()) {
    sendError(res, 400, "草稿内容为空", "请提供 name/summary/content 至少一项");
    return true;
  }
  const systemPrompt = `你是一个 Skill 规范助手。根据用户提供的业务需求或 Skill 草稿内容，生成符合《优秀 Skills 检查清单》的 6 项内容。
请输出**仅一段合法 JSON**，不要 markdown 代码块或多余文字。JSON 必须包含以下字段（均为字符串）：
- triggerCondition: 触发条件（AI 加载该 Skill 的具体场景）
- inputSpec: 输入（执行前必需的信息/参数）
- steps: 步骤（具体可执行的任务流程，可多行）
- checkCriteria: 检查（任务成功完成的验证标准）
- abortCondition: 中止条件（需暂停并询问人类的场景）
- recoveryMethod: 恢复方式（检查失败后的补救流程）
可选：name（Skill 名称优化）、summary（摘要优化）。若内容不足以推断某项，用「待补充」占位。`;
  try {
    const { data } = await callKimiJson<{
      triggerCondition?: string;
      inputSpec?: string;
      steps?: string;
      checkCriteria?: string;
      abortCondition?: string;
      recoveryMethod?: string;
      name?: string;
      summary?: string;
    }>(systemPrompt, `请根据以下内容生成 6 项检查清单：\n\n${content.slice(0, 8000)}`);
    const draftOut = {
      ...draft,
      name: draft.name ?? data.name ?? "未命名 Skill",
      summary: draft.summary ?? data.summary ?? "",
      triggerCondition: (data.triggerCondition ?? "").trim() || "待补充",
      inputSpec: (data.inputSpec ?? "").trim() || "待补充",
      steps: (data.steps ?? "").trim() || "待补充",
      checkCriteria: (data.checkCriteria ?? "").trim() || "待补充",
      abortCondition: (data.abortCondition ?? "").trim() || "待补充",
      recoveryMethod: (data.recoveryMethod ?? "").trim() || "待补充",
    };
    sendJson(res, 200, { success: true, draft: draftOut });
  } catch (e) {
    sendError(res, 502, "生成检查清单失败", getErrorMessage(e));
  }
  return true;
}

/** 单条问题：Kimi 总结 + 分类打标（label 必为 referenceLabels 之一或「未分类」）；返回 token 消耗 */
async function callKimiQuestionLabel(
  row: { sessionTag: string; sessionSummary: string; knowledgeTitle: string; knowledgeAnswer: string },
  referenceLabels: string[],
): Promise<{ summary: string; label: string; promptTokens: number; completionTokens: number }> {
  const content = [
    row.sessionTag && `会话标签：${row.sessionTag}`,
    row.sessionSummary && `会话摘要：${row.sessionSummary}`,
    row.knowledgeTitle && `知识标题：${row.knowledgeTitle}`,
    row.knowledgeAnswer && `知识答案：${row.knowledgeAnswer}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const labelsStr = referenceLabels.length ? referenceLabels.join("、") : "（无）";
  const systemPrompt = `你是一个问题分类助手。根据用户提供的一条会话/问题内容，完成两件事：
1. 用一句话总结该问题的核心内容（summary）。
2. 从给定的分类标签中选出最匹配的一个作为该问题的分类（label）；若没有合适匹配则使用「未分类」。

请输出**仅一段合法 JSON**，不要 markdown 代码块或多余文字。JSON 必须包含：
- summary: 字符串，问题总结
- label: 字符串，必须是下面「分类标签列表」中的某一个，或「未分类」

分类标签列表：${labelsStr}，未分类`;
  const userContent = `请对以下问题进行总结并打上分类标签：\n\n${content.slice(0, 3000)}`;
  const { data, promptTokens, completionTokens } = await callKimiJson<{ summary?: string; label?: string }>(systemPrompt, userContent);
  let label = (data.label ?? "").trim();
  if (label && !referenceLabels.includes(label) && label !== "未分类") {
    const found = referenceLabels.find((l) => l === label || l.includes(label) || label.includes(l));
    if (found) label = found;
    else label = "未分类";
  }
  if (!label) label = "未分类";
  return {
    summary: (data.summary ?? "").trim() || "—",
    label,
    promptTokens,
    completionTokens,
  };
}

/** POST /api/question-labeling/run：创建任务并立即返回 stub，后台异步执行 Kimi 打标（列表可轮询 GET :jobId 获取进度） */
async function handleQuestionLabelingRun(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: {
    name?: string;
    referenceLabels?: string[];
    sampleRows?: Array<{
      touchpoint: string;
      sessionTag: string;
      sessionSummary: string;
      knowledgeTitle: string;
      knowledgeAnswer: string;
      province: string;
    }>;
    createdByUserId?: string;
    createdByName?: string;
  };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const referenceLabels = payload.referenceLabels ?? [];
  const sampleRows = payload.sampleRows ?? [];
  if (sampleRows.length === 0) {
    sendError(res, 400, "样例行为空", "请提供 sampleRows");
    return true;
  }
  const jobId = `ql-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const stubRows = sampleRows.map((row, i) => ({
    id: `qlr-${jobId}-${i}`,
    touchpoint: row.touchpoint ?? "",
    sessionTag: row.sessionTag ?? "",
    sessionSummary: row.sessionSummary ?? "",
    knowledgeTitle: row.knowledgeTitle ?? "",
    knowledgeAnswer: row.knowledgeAnswer ?? "",
    province: row.province ?? "",
    summary: "",
    modelLabel: "",
  }));
  const stubJob = {
    id: jobId,
    name: payload.name ?? `打标任务 ${now}`,
    referenceLabels,
    rows: stubRows,
    createdAt: now,
    updatedAt: now,
    createdByUserId: payload.createdByUserId,
    createdByName: payload.createdByName,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
  };
  questionLabelingJobsMap.set(jobId, { ...stubJob, rows: stubRows.map((r) => ({ ...r })) });
  sendJson(res, 200, { success: true, jobId, job: stubJob });

  void runQuestionLabelingInBackground(jobId, referenceLabels, sampleRows, {
    name: stubJob.name,
    createdByUserId: payload.createdByUserId,
    createdByName: payload.createdByName,
  });
  return true;
}

async function runQuestionLabelingInBackground(
  jobId: string,
  referenceLabels: string[],
  sampleRows: Array<{
    touchpoint: string;
    sessionTag: string;
    sessionSummary: string;
    knowledgeTitle: string;
    knowledgeAnswer: string;
    province: string;
  }>,
  _meta: { name?: string; createdByUserId?: string; createdByName?: string },
): Promise<void> {
  const job = questionLabelingJobsMap.get(jobId);
  if (!job) return;
  const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
  for (let i = 0; i < sampleRows.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 3200));
    }
    try {
      const row = sampleRows[i];
      const { summary, label, promptTokens, completionTokens } = await callKimiQuestionLabel(
        {
          sessionTag: row.sessionTag,
          sessionSummary: row.sessionSummary,
          knowledgeTitle: row.knowledgeTitle,
          knowledgeAnswer: row.knowledgeAnswer,
        },
        referenceLabels,
      );
      const current = questionLabelingJobsMap.get(jobId);
      if (!current) return;
      const nextRows = current.rows.slice();
      nextRows[i] = {
        ...nextRows[i],
        summary,
        modelLabel: label,
      };
      const nextPrompt = (current.totalPromptTokens ?? 0) + promptTokens;
      const nextCompletion = (current.totalCompletionTokens ?? 0) + completionTokens;
      questionLabelingJobsMap.set(jobId, {
        ...current,
        rows: nextRows,
        updatedAt: now(),
        totalPromptTokens: nextPrompt,
        totalCompletionTokens: nextCompletion,
      });
    } catch (e) {
      const current = questionLabelingJobsMap.get(jobId);
      if (current) {
        const nextRows = current.rows.slice();
        nextRows[i] = {
          ...nextRows[i],
          summary: "—",
          modelLabel: "未分类",
        };
        questionLabelingJobsMap.set(jobId, { ...current, rows: nextRows, updatedAt: now() });
      }
    }
  }
}

/** GET /api/question-labeling/:jobId：轮询打标进度（能力层内存中的任务） */
function handleQuestionLabelingGetJob(res: ServerResponse, jobId: string): boolean {
  const job = questionLabelingJobsMap.get(jobId);
  if (!job) {
    sendJson(res, 404, { success: false, error: "任务不存在或已过期" });
    return true;
  }
  sendJson(res, 200, { success: true, job });
  return true;
}

/** POST /api/question-labeling/export：根据 job 生成三 Sheet Excel 并返回文件流 */
async function handleQuestionLabelingExport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: { job?: { rows?: Array<{ touchpoint: string; province: string; modelLabel: string; manualLabel?: string }> } };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const job = payload.job;
  if (!job?.rows?.length) {
    sendError(res, 400, "job 或 rows 为空", "请提供完整的 job 对象及 rows");
    return true;
  }
  try {
    const wb = buildExportWorkbook(job.rows);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `打标结果_${Date.now()}.xlsx`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.end(buffer);
  } catch (e) {
    sendError(res, 500, "导出失败", getErrorMessage(e));
  }
  return true;
}

/** POST /api/knowledge/:systemId/extract-metrics-dimensions：从文档内容中抽取指标与维度 */
async function handleKnowledgeExtractMetricsDimensions(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
  _systemId: string,
): Promise<boolean> {
  let payload: { content?: string };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const content = payload.content?.trim();
  if (!content) {
    sendError(res, 400, "内容为空", "请提供 content");
    return true;
  }
  const systemPrompt = `你是一个业务数据建模助手。根据用户提供的文档或业务描述，提取「业务指标」与「数据维度」。
请输出**仅一段合法 JSON**，不要 markdown 代码块或多余文字。JSON 格式：
{
  "metrics": [{"name":"指标名称","metricType":"基础指标|复合指标","definition":"业务定义","code":"英文编码"}],
  "dimensions": [{"name":"维度名称","code":"英文编码","parentName":"父维度或-","valueConstraint":"取值说明"}]
}
若某项无法从内容推断可省略或留空。metrics 和 dimensions 均为数组，每项至少包含 name。`;
  try {
    const { data } = await callKimiJson<{ metrics?: Array<{ name?: string; metricType?: string; definition?: string; code?: string }>; dimensions?: Array<{ name?: string; code?: string; parentName?: string; valueConstraint?: string }> }>(
      systemPrompt,
      `请从以下内容中提取业务指标与数据维度：\n\n${content.slice(0, 6000)}`,
    );
    const metrics = (data.metrics ?? []).filter((m) => m.name);
    const dimensions = (data.dimensions ?? []).filter((d) => d.name);
    sendJson(res, 200, { success: true, metrics, dimensions });
  } catch (e) {
    sendError(res, 502, "抽取失败", getErrorMessage(e));
  }
  return true;
}

/** POST /api/knowledge/parse-excel：解析 Excel 为知识集合 + 指标 + 维度（供前端同步到知识库） */
async function handleKnowledgeParseExcel(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return new Promise((resolve) => {
    const form = formidable({ maxFileSize: 20 * 1024 * 1024, maxFiles: 1 });
    form.parse(req, async (err: Error | null, _fields: formidable.Fields, files: formidable.Files) => {
      if (err) {
        sendError(res, 400, "解析表单失败", getErrorMessage(err));
        resolve(true);
        return;
      }
      const fileList = Array.isArray(files.file) ? files.file : files.file ? [files.file] : [];
      const file = fileList[0];
      if (!file || !file.filepath) {
        sendError(res, 400, "未上传文件", "请选择 .xlsx 文件");
        resolve(true);
        return;
      }
      const name = (file.originalFilename || "").toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        sendError(res, 400, "格式不支持", "仅支持 .xlsx / .xls");
        resolve(true);
        return;
      }
      try {
        const buf = fs.readFileSync(file.filepath);
        const pack = loadKnowledgePackFromBuffer(buf, name);
        const knowledgeCollection = buildKnowledgeCollectionFromPack(pack);
        const metrics = inferMetricsFromKnowledgePack(pack);
        const dimensions = inferDimensionsFromKnowledgePack(pack);
        sendJson(res, 200, {
          success: true,
          knowledgeCollection,
          metrics,
          dimensions,
        });
      } catch (e) {
        sendError(res, 500, "解析 Excel 失败", getErrorMessage(e));
      }
      resolve(true);
    });
  });
}

/** POST /api/reports/export：导出 Word / PDF / Markdown */
async function handleReportsExport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: { format?: string; title?: string; sections?: Array<{ type?: string; title?: string; content?: string }> };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const format = (payload.format || "markdown").toLowerCase();
  const title = payload.title || "根因分析报告";
  const sections = payload.sections || [];

  if (format === "markdown") {
    const lines: string[] = [`# ${title}`, ""];
    for (const s of sections) {
      lines.push(`## ${s.title || "未命名"}`, "");
      lines.push((s.content || "").replace(/\n/g, "\n"), "", "");
    }
    const buf = Buffer.from(lines.join("\n"), "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.md"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }

  if (format === "word" || format === "docx") {
    const children: Paragraph[] = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 400 },
      }),
    ];
    for (const s of sections) {
      children.push(
        new Paragraph({
          text: s.title || "未命名",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: s.content || "", break: 1 })],
          spacing: { after: 200 },
        }),
      );
    }
    const doc = new Document({
      sections: [{ children }],
    });
    const buf = await Packer.toBuffer(doc);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.docx"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }

  if (format === "pdf") {
    const htmlParts = [
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body>`,
      `<h1>${escapeHtml(title)}</h1>`,
    ];
    for (const s of sections) {
      htmlParts.push(`<h2>${escapeHtml(s.title || "未命名")}</h2>`, `<div>${escapeHtml((s.content || "").replace(/\n/g, "<br/>"))}</div>`);
    }
    htmlParts.push("</body></html>");
    const html = htmlParts.join("");
    const buf = Buffer.from(html, "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(title)}.html"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }

  sendError(res, 400, "不支持的导出格式", "支持 format: markdown | word | docx | pdf（实际返回 HTML 可另存为 PDF）");
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** POST /api/metrics/export：导出 Excel / CSV */
async function handleMetricsExport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: { format?: string; columns?: string[]; rows?: Record<string, unknown>[] };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const format = (payload.format || "csv").toLowerCase();
  const columns = payload.columns || [];
  const rows = payload.rows || [];

  if (format === "csv") {
    const header = columns.join(",");
    const lines = [header, ...rows.map((r) => columns.map((c) => csvCell((r[c] as string) ?? "")).join(","))];
    const buf = Buffer.from("\uFEFF" + lines.join("\r\n"), "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"metrics.csv\"");
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }

  if (format === "excel" || format === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns.length ? columns : undefined });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "指标数据");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=\"metrics.xlsx\"");
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    return true;
  }

  sendError(res, 400, "不支持的格式", "支持 format: csv | excel | xlsx");
  return true;
}

function csvCell(v: string): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 经营指标问数：Kimi 返回的 JSON 需符合此结构（最小契约） */
interface KimiMetricResult {
  resolvedIntent?: string;
  resolvedMetricCodes?: string[];
  metrics?: Array<{
    id?: string;
    metricCode?: string;
    metricName?: string;
    unit?: string;
    region?: string;
    period?: string;
    value?: number;
    trend?: number;
    description?: string;
    sqlTemplate?: string;
  }>;
  trend?: Array<{ period?: string; value?: number }>;
  generatedSql?: string;
  explanation?: string;
  appliedSkills?: Array<{ id?: string; name?: string }>;
  ruleTrace?: string;
  chainOfThoughtSteps?: string[];
  candidateSqls?: string[];
  /** 兼容 Kimi 可能返回的 snake_case 或中文 key */
  chain_of_thought?: string[];
  思维链?: string[];
}

const METRIC_CODES = ["revenue", "arpu", "activeUsers", "ticketRate"] as const;
const REGIONS = ["全国", "华北", "华东", "华南"] as const;
const PERIODS = ["本月", "上月", "本季度"] as const;

/** Kimi 计费：元/1K tokens（可改为从 process.env 读取） */
const KIMI_INPUT_PER_1K = Number(process.env.KIMI_INPUT_PRICE_PER_1K) || 0.012;
const KIMI_OUTPUT_PER_1K = Number(process.env.KIMI_OUTPUT_PRICE_PER_1K) || 0.012;

function computeKimiCost(promptTokens: number, completionTokens: number): number {
  return Number(
    (KIMI_INPUT_PER_1K * (promptTokens / 1000) + KIMI_OUTPUT_PER_1K * (completionTokens / 1000)).toFixed(6),
  );
}

function normalizeMetricsQueryResult(raw: KimiMetricResult, payload: { question?: string }): {
  resolvedIntent: string;
  resolvedMetricCodes: string[];
  metrics: Array<{
    id: string;
    metricCode: "revenue" | "arpu" | "activeUsers" | "ticketRate";
    metricName: string;
    unit: string;
    region: "全国" | "华北" | "华东" | "华南";
    period: "本月" | "上月" | "本季度";
    value: number;
    trend: number;
    description: string;
    sqlTemplate: string;
  }>;
  trend: Array<{ period: string; value: number }>;
  generatedSql: string;
  explanation: string;
  appliedSkills?: { id: string; name: string }[];
  ruleTrace?: string;
  chainOfThoughtSteps?: string[];
  candidateSqls?: string[];
} {
  const metrics = (raw.metrics ?? []).map((m, i) => ({
    id: m.id ?? `bm-${i + 1}`,
    metricCode: (METRIC_CODES.includes(m.metricCode as (typeof METRIC_CODES)[number]) ? m.metricCode : "revenue") as "revenue" | "arpu" | "activeUsers" | "ticketRate",
    metricName: m.metricName ?? "指标",
    unit: m.unit ?? "",
    region: (REGIONS.includes(m.region as (typeof REGIONS)[number]) ? m.region : "全国") as "全国" | "华北" | "华东" | "华南",
    period: (PERIODS.includes(m.period as (typeof PERIODS)[number]) ? m.period : "本月") as "本月" | "上月" | "本季度",
    value: typeof m.value === "number" ? m.value : 0,
    trend: typeof m.trend === "number" ? m.trend : 0,
    description: m.description ?? "",
    sqlTemplate: m.sqlTemplate ?? "SELECT 1",
  }));
  const trend = (raw.trend ?? []).map((p) => ({
    period: p.period ?? "",
    value: typeof p.value === "number" ? p.value : 0,
  }));
  if (trend.length === 0) {
    const v = metrics[0]?.value ?? 0;
    trend.push(
      { period: "T-5", value: Number((v * 0.88).toFixed(2)) },
      { period: "T-4", value: Number((v * 0.93).toFixed(2)) },
      { period: "T-3", value: Number((v * 0.96).toFixed(2)) },
      { period: "T-2", value: Number((v * 1.01).toFixed(2)) },
      { period: "T-1", value: Number((v * 0.98).toFixed(2)) },
      { period: "T", value: Number(v.toFixed(2)) },
    );
  }
  const appliedSkills = (raw.appliedSkills ?? []).map((s) => ({ id: s.id ?? "", name: s.name ?? "" })).filter((s) => s.id || s.name);

  const rawAny = raw as Record<string, unknown>;
  const chainFromRaw =
    Array.isArray(raw.chainOfThoughtSteps) ? raw.chainOfThoughtSteps
    : Array.isArray(rawAny.chain_of_thought) ? rawAny.chain_of_thought as string[]
    : Array.isArray(rawAny.思维链) ? rawAny.思维链 as string[]
    : undefined;
  const defaultCotSteps = [
    "解析自然语言：提取指标、维度与筛选条件",
    "匹配 Skill/知识：取数口径与 SQL 模板",
    "推理补全：表关联与缺失条件",
    "生成候选 SQL 并校验输出规范",
  ];
  const chainOfThoughtSteps =
    chainFromRaw && chainFromRaw.length > 0 ? chainFromRaw : defaultCotSteps;

  const generatedSql = raw.generatedSql ?? metrics.map((m) => m.sqlTemplate.replace("${month}", "2026-03")).join(";\n");
  const candidateSqlsFromRaw =
    Array.isArray(raw.candidateSqls) && raw.candidateSqls.length > 0 ? raw.candidateSqls : undefined;
  const candidateSqls = candidateSqlsFromRaw ?? (generatedSql ? [generatedSql] : undefined);

  return {
    resolvedIntent: raw.resolvedIntent ?? (payload.question ? `识别到“${payload.question}”的查询意图` : "按筛选条件检索经营指标"),
    resolvedMetricCodes: (raw.resolvedMetricCodes ?? []).filter((c): c is (typeof METRIC_CODES)[number] => METRIC_CODES.includes(c as (typeof METRIC_CODES)[number])).length
      ? (raw.resolvedMetricCodes as (typeof METRIC_CODES)[number][])
      : (metrics.map((m) => m.metricCode) as (typeof METRIC_CODES)[number][]),
    metrics,
    trend,
    generatedSql,
    explanation: raw.explanation ?? "由 Kimi 大模型解析问数意图并生成结果。",
    appliedSkills: appliedSkills.length > 0 ? appliedSkills : undefined,
    ruleTrace: raw.ruleTrace,
    chainOfThoughtSteps,
    candidateSqls: candidateSqls ?? undefined,
  };
}

/** 将知识包回放数据转为问数结果结构（兼容前端 BusinessMetricQueryResult） */
function buildReplayResult(
  pack: KnowledgePack,
  intent: string,
  explanation: string,
  templateId: string,
): { result: Parameters<typeof sendJson>[2]; durationMs: number } {
  const start = Date.now();
  const template = pack.sqlTemplates.find((t) => t.id === templateId) ?? pack.sqlTemplates[0];
  const sql = template?.rawSql ?? "";
  const cols = pack.outputSpec.columns;
  const rows = pack.outputDataRows;
  const nameCol = cols[0];
  const valueCol = cols[1];
  const metrics = rows.map((row, i) => {
    const regionVal = String(row[nameCol?.key ?? "province_name"] ?? "").trim() || "全国";
    const numVal = typeof row[valueCol?.key ?? ""] === "number" ? Number(row[valueCol?.key ?? ""]) : 0;
    const region: "全国" | "华北" | "华东" | "华南" =
      regionVal === "华北" || regionVal === "华东" || regionVal === "华南" ? regionVal : "全国";
    return {
      id: `replay-${i + 1}`,
      metricCode: "revenue" as const,
      metricName: valueCol?.label ?? "新发展用户数",
      unit: "",
      region,
      period: "本月" as const,
      value: numVal,
      trend: 0,
      description: regionVal,
      sqlTemplate: sql,
    };
  });
  const trend = metrics.length > 0
    ? [
        { period: "T-2", value: Math.round(metrics[0].value * 0.98) },
        { period: "T-1", value: Math.round(metrics[0].value * 1.01) },
        { period: "T", value: metrics[0].value },
      ]
    : [];
  const durationMs = Date.now() - start;
  const result = {
    resolvedIntent: intent,
    resolvedMetricCodes: ["revenue"] as const,
    metrics,
    trend,
    generatedSql: sql,
    explanation,
    ruleTrace: explanation,
    chainOfThoughtSteps: [
      "解析自然语言：识别取数需求与维度",
      "匹配 Skill/规则：命中知识包取数口径与 SQL 模板",
      "生成 SQL：输出标准查询语句",
      "验证优化：按输出规范校验列与顺序",
    ],
    candidateSqls: sql ? [sql] : [],
    resultFormat: "excel_replay" as const,
    outputSpec: pack.outputSpec,
    outputDataRows: pack.outputDataRows,
  };
  return { result, durationMs };
}

/** POST /api/metrics/query：规则优先 NL2SQL + 回放，未命中则调用 Kimi */
async function handleMetricsQuery(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  const startTotal = Date.now();
  let payload: {
    question?: string;
    region?: string;
    period?: string;
    metricCode?: string;
    skillIds?: string[];
    qaSessionId?: string;
    knowledgeVersion?: string;
  };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }

  const pack = getOrLoadMetricsPack();
  const question = (payload.question ?? "").trim();

  if (pack && question) {
    const match = matchRuleAndTemplate(pack, question);
    if (match.matched && match.templateId) {
      const { result, durationMs } = buildReplayResult(pack, match.intent, match.explanation, match.templateId);
      sendJson(res, 200, {
        success: true,
        result,
        matchedRule: true,
        sqlTemplateId: match.templateId,
        knowledgeVersion: pack.version,
        durationMs,
      });
      return true;
    }
  }

  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey?.trim()) {
    sendError(res, 503, "未配置 KIMI_API_KEY", "请在 .env.local 中设置 KIMI_API_KEY 后重启");
    return true;
  }

  const baseUrl = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/$/, "");
  const model = process.env.KIMI_MODEL || "moonshot-v1-8k";

  const systemPrompt = `你是一个经营指标问数助手。用户会用自然语言提问（如“本月全国营收”“华东ARPU趋势”）。
请按**思维链**步骤推理，最后输出**仅一段合法 JSON**，不要 markdown 代码块或多余文字。JSON 必须包含以下字段：
- resolvedIntent: string，简要说明识别的意图；
- resolvedMetricCodes: string[]，可选值为 "revenue"|"arpu"|"activeUsers"|"ticketRate"；
- metrics: 数组，每项含 id, metricCode, metricName, unit, region, period, value, trend, description, sqlTemplate（region 可选 全国|华北|华东|华南，period 可选 本月|上月|本季度）；
- trend: 数组，每项含 period, value，表示趋势点；
- generatedSql: string，推荐的可执行 SQL 草案（取 candidateSqls 中最优一条）；
- explanation: string，简短说明；
- appliedSkills: 数组，每项含 id, name（若本次问数绑定了 Skill）；
- ruleTrace: string（可选），说明受哪些 Skill 约束；
- chainOfThoughtSteps: string[]，推理步骤简述，如 ["解析自然语言：提取指标与维度", "匹配 Skill 取数口径", "推理补全表关联", "生成候选 SQL", "校验输出规范"]；
- candidateSqls: string[]，1～3 条候选 SQL，generatedSql 应为其中最优一条。`;

  const userContent = [
    `用户问题：${payload.question ?? "（无问题，按筛选条件）"}`,
    `筛选：区域=${payload.region ?? "全部"}，周期=${payload.period ?? "全部"}，指标=${payload.metricCode ?? "all"}`,
    payload.skillIds?.length ? `绑定 Skill 数量：${payload.skillIds.length}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const chatRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      sendError(res, 502, "Kimi 接口异常", `[${baseUrl}] ${chatRes.status} ${errText.slice(0, 200)}`);
      return true;
    }

    const chatData = (await chatRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    const content = chatData.choices?.[0]?.message?.content?.trim();
    if (!content) {
      sendError(res, 502, "Kimi 返回为空", chatData.error?.message ?? "无 content");
      return true;
    }

    const usageRaw = chatData.usage;
    const promptTokens = usageRaw?.prompt_tokens ?? 0;
    const completionTokens = usageRaw?.completion_tokens ?? 0;
    const totalTokens = (usageRaw?.total_tokens ?? promptTokens + completionTokens) || 0;
    const cost = computeKimiCost(promptTokens, completionTokens);

    let parsed: KimiMetricResult;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    try {
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content) as KimiMetricResult;
    } catch (e) {
      sendError(res, 502, "Kimi 返回非合法 JSON", getErrorMessage(e));
      return true;
    }

    const result = normalizeMetricsQueryResult(parsed, payload);
    const durationMs = Date.now() - startTotal;
    sendJson(res, 200, {
      success: true,
      result,
      matchedRule: false,
      durationMs,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
      },
    });
  } catch (e) {
    sendError(res, 500, "问数请求失败", getErrorMessage(e));
  }
  return true;
}

/** POST /api/metrics/execute-sql：只读执行用户编辑的 SQL，返回符合输出规范的结果（POC：用知识包回放数据） */
async function handleMetricsExecuteSql(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: { sql?: string };
  try {
    payload = JSON.parse(body) as { sql?: string };
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const sql = (payload.sql ?? "").trim();
  if (!sql) {
    sendError(res, 400, "请提供 sql 字段");
    return true;
  }
  if (/(\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bTRUNCATE\b)/i.test(sql)) {
    sendError(res, 400, "仅支持 SELECT 只读查询");
    return true;
  }
  const pack = getOrLoadMetricsPack();
  if (!pack) {
    sendError(res, 503, "暂无知识包", "请先加载 Excel 数据源或使用问数生成 SQL");
    return true;
  }
  sendJson(res, 200, {
    success: true,
    outputSpec: pack.outputSpec,
    outputDataRows: pack.outputDataRows,
  });
  return true;
}

/** POST /api/ontology/import：解析 OWL/RDF 文本，返回结构化 JSON */
async function handleOntologyImport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  const store = new Store();
  const parser = new Parser();
  let quads: Quad[];
  try {
    quads = parser.parse(body) as Quad[];
    store.addQuads(quads);
  } catch (e) {
    sendError(res, 400, "RDF/OWL 解析失败", getErrorMessage(e));
    return true;
  }
  const libraries: Array<{ id: string; name: string; description?: string }> = [];
  const concepts: Array<{ id: string; libraryId: string; name: string; parentId?: string }> = [];
  const relations: Array<{ id: string; libraryId: string; sourceConceptId: string; targetConceptId: string; relationType: string }> = [];
  const libId = "ol-imported";
  libraries.push({ id: libId, name: "导入的本体", description: "从 RDF/OWL 文件导入" });
  const subjectMap = new Map<string, string>();
  let conceptIndex = 0;
  const allQuads = store.getQuads(null, null, null, null);
  for (const q of allQuads) {
    const sub = q.subject.value;
    const pred = q.predicate.value;
    const predLocal = pred.split(/[/#]/).pop() || pred;
    if (predLocal === "label" || predLocal === "name" || predLocal === "title") {
      const name = q.object.termType === "Literal" ? (q.object as { value: string }).value : String(q.object.value);
      if (!subjectMap.has(sub)) {
        conceptIndex += 1;
        const cid = `oc-${conceptIndex}`;
        subjectMap.set(sub, cid);
        concepts.push({ id: cid, libraryId: libId, name });
      }
    }
  }
  let relIndex = 0;
  for (const q of allQuads) {
    const predLocal = q.predicate.value.split(/[/#]/).pop() || "";
    if (predLocal === "type" || predLocal === "label") continue;
    const srcId = subjectMap.get(q.subject.value);
    const tgtId = subjectMap.get(q.object.value);
    if (srcId && tgtId) {
      relIndex += 1;
      relations.push({
        id: `orel-${relIndex}`,
        libraryId: libId,
        sourceConceptId: srcId,
        targetConceptId: tgtId,
        relationType: predLocal,
      });
    }
  }
  sendJson(res, 200, {
    success: true,
    ontology: { libraries, concepts, relations },
    message: "解析成功，可保存到本体库",
  });
  return true;
}

/** POST /api/ontology/export：将本体 JSON 导出为 RDF Turtle */
async function handleOntologyExport(
  _req: IncomingMessage,
  res: ServerResponse,
  body: string,
): Promise<boolean> {
  let payload: {
    libraries?: Array<{ id: string; name: string }>;
    concepts?: Array<{ id: string; libraryId: string; name: string; parentId?: string }>;
    relations?: Array<{ sourceConceptId: string; targetConceptId: string; relationType: string }>;
  };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    sendError(res, 400, "请求体不是合法 JSON");
    return true;
  }
  const base = "http://example.org/ontology/";
  const { namedNode, literal, quad, defaultGraph } = DataFactory;
  const quads: Quad[] = [];
  for (const lib of payload.libraries || []) {
    const sub = namedNode(base + "library/" + lib.id);
    quads.push(quad(sub, namedNode(base + "name"), literal(lib.name), defaultGraph()));
  }
  for (const c of payload.concepts || []) {
    const sub = namedNode(base + "concept/" + c.id);
    quads.push(quad(sub, namedNode(base + "name"), literal(c.name), defaultGraph()));
    quads.push(quad(sub, namedNode(base + "libraryId"), literal(c.libraryId), defaultGraph()));
  }
  for (const r of payload.relations || []) {
    const sub = namedNode(base + "concept/" + r.sourceConceptId);
    const pred = namedNode(base + r.relationType);
    const obj = namedNode(base + "concept/" + r.targetConceptId);
    quads.push(quad(sub, pred, obj, defaultGraph()));
  }
  const writer = new Writer({ format: "Turtle" });
  writer.addQuads(quads);
  writer.end((err: Error | null, result: string) => {
    if (err) {
      sendError(res, 500, "RDF 序列化失败", getErrorMessage(err));
      return;
    }
    const buf = Buffer.from(result || "", "utf-8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/turtle; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"ontology.ttl\"");
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  });
  return true;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => reject(new Error("请求超时")), REQUEST_TIMEOUT_MS);
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    req.on("error", (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

export function createCapabilityApiPlugin(): Plugin {
  return {
    name: "vite-capability-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        const url = new URL(req.url, "http://localhost");
        const pathname = url.pathname;

        const isReportsExport = req.method === "POST" && pathname === "/api/reports/export";
        const isMetricsExport = req.method === "POST" && pathname === "/api/metrics/export";
        const isMetricsQuery = req.method === "POST" && pathname === "/api/metrics/query";
        const isMetricsExcelReload = req.method === "POST" && pathname === "/api/metrics/excel/reload";
        const isMetricsExcelUpload = req.method === "POST" && pathname === "/api/metrics/excel/upload";
        const isMetricsExcelProfile = req.method === "GET" && pathname === "/api/metrics/excel/profile";
        const isMetricsExcelDoc = req.method === "GET" && pathname.startsWith("/api/metrics/excel/standardization-doc");
        const isOntologyImport = req.method === "POST" && pathname === "/api/ontology/import";
        const isOntologyExport = req.method === "POST" && pathname === "/api/ontology/export";
        const isSkillsImportParse = req.method === "POST" && pathname === "/api/skills/import/parse";
        const isSkillsImportGenerateChecklist =
          req.method === "POST" && pathname === "/api/skills/import/generate-checklist";
        const isQuestionLabelingParse = req.method === "POST" && pathname === "/api/question-labeling/parse";
        const isQuestionLabelingRun = req.method === "POST" && pathname === "/api/question-labeling/run";
        const isQuestionLabelingExport = req.method === "POST" && pathname === "/api/question-labeling/export";
        const questionLabelingGetJobMatch = pathname.match(/^\/api\/question-labeling\/([^/]+)$/);
        const isQuestionLabelingGetJob = req.method === "GET" && questionLabelingGetJobMatch !== null;
        const isMetricsExecuteSql = req.method === "POST" && pathname === "/api/metrics/execute-sql";
        const extractMetricsDimensionsMatch = pathname.match(/^\/api\/knowledge\/([^/]+)\/extract-metrics-dimensions$/);
        const isKnowledgeExtractMetricsDimensions =
          req.method === "POST" && extractMetricsDimensionsMatch !== null;
        const isKnowledgeParseExcel = req.method === "POST" && pathname === "/api/knowledge/parse-excel";

        if (isMetricsExcelProfile || isMetricsExcelDoc) {
          try {
            if (isMetricsExcelProfile) await handleMetricsExcelProfile(req, res);
            else await handleMetricsExcelStandardizationDoc(req, res);
          } catch (e) {
            sendError(res, 500, "请求失败", getErrorMessage(e));
          }
          return;
        }
        if (isMetricsExcelReload) {
          try {
            await handleMetricsExcelReload(req, res);
          } catch (e) {
            sendError(res, 500, "重载失败", getErrorMessage(e));
          }
          return;
        }
        if (isMetricsExcelUpload) {
          try {
            await handleMetricsExcelUpload(req, res);
          } catch (e) {
            sendError(res, 500, "上传失败", getErrorMessage(e));
          }
          return;
        }
        if (isSkillsImportParse) {
          try {
            await handleSkillsImportParse(req, res);
          } catch (e) {
            sendError(res, 500, "解析失败", getErrorMessage(e));
          }
          return;
        }
        if (isSkillsImportGenerateChecklist) {
          readBody(req)
            .then(async (body) => {
              await handleSkillsImportGenerateChecklist(req, res, body);
            })
            .catch((e) => sendError(res, 500, "请求处理失败", getErrorMessage(e)));
          return;
        }
        if (isQuestionLabelingGetJob) {
          handleQuestionLabelingGetJob(res, questionLabelingGetJobMatch![1]);
          return;
        }
        if (isQuestionLabelingParse) {
          try {
            await handleQuestionLabelingParse(req, res);
          } catch (e) {
            sendError(res, 500, "解析失败", getErrorMessage(e));
          }
          return;
        }
        if (isQuestionLabelingRun) {
          readBody(req)
            .then(async (body) => {
              await handleQuestionLabelingRun(req, res, body);
            })
            .catch((e) => sendError(res, 500, "请求处理失败", getErrorMessage(e)));
          return;
        }
        if (isQuestionLabelingExport) {
          readBody(req)
            .then(async (body) => {
              await handleQuestionLabelingExport(req, res, body);
            })
            .catch((e) => sendError(res, 500, "导出失败", getErrorMessage(e)));
          return;
        }
        if (isKnowledgeExtractMetricsDimensions && extractMetricsDimensionsMatch) {
          const systemIdFromPath = extractMetricsDimensionsMatch[1];
          readBody(req)
            .then(async (body) => {
              await handleKnowledgeExtractMetricsDimensions(req, res, body, systemIdFromPath);
            })
            .catch((e) => sendError(res, 500, "请求处理失败", getErrorMessage(e)));
          return;
        }
        if (isKnowledgeParseExcel) {
          try {
            await handleKnowledgeParseExcel(req, res);
          } catch (e) {
            sendError(res, 500, "解析失败", getErrorMessage(e));
          }
          return;
        }

        if (isReportsExport || isMetricsExport || isMetricsQuery || isMetricsExecuteSql || isOntologyImport || isOntologyExport) {
          readBody(req)
            .then(async (body) => {
              if (isReportsExport) await handleReportsExport(req, res, body);
              else if (isMetricsExport) await handleMetricsExport(req, res, body);
              else if (isMetricsQuery) await handleMetricsQuery(req, res, body);
              else if (isMetricsExecuteSql) await handleMetricsExecuteSql(req, res, body);
              else if (isOntologyImport) await handleOntologyImport(req, res, body);
              else if (isOntologyExport) await handleOntologyExport(req, res, body);
            })
            .catch((e) => sendError(res, 500, "请求处理失败", getErrorMessage(e)));
          return;
        }

        next();
      });
    },
  };
}
