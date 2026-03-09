/**
 * 从 Excel（4 个指定 Sheet）解析为 Skill 草稿，供 Skill 库导入使用。
 * 依赖 metricsExcelEngine 的 findSheetByName、校验与提取函数。
 */
import * as XLSX from "xlsx";
import {
  findSheetByName,
  getSheetRows,
  validateSkillExcelSheets,
  extractRequirementText,
  extractLexiconFromRequirement,
  extractOutputSpecAndRows,
  extractSqlTemplate,
  type BusinessLexiconEntry,
} from "./metricsExcelEngine";

export interface SkillExcelDraft {
  name: string;
  summary: string;
  content: string;
  tags: string[];
  applicableScenes: string[];
  category: string;
  triggerCondition: string;
  inputSpec: string;
  steps: string;
  checkCriteria: string;
  abortCondition: string;
  recoveryMethod: string;
}

const CHECKLIST_KEYS = [
  "triggerCondition",
  "inputSpec",
  "steps",
  "checkCriteria",
  "abortCondition",
  "recoveryMethod",
] as const;
const CHECKLIST_LABELS: Record<(typeof CHECKLIST_KEYS)[number], string> = {
  triggerCondition: "触发条件",
  inputSpec: "输入",
  steps: "步骤",
  checkCriteria: "检查",
  abortCondition: "中止条件",
  recoveryMethod: "恢复方式",
};

/** 从需求文本中按标题抽取 6 项检查清单（支持 触发条件：、## 触发条件、【触发条件】 等） */
function extractChecklistFromText(text: string): Record<(typeof CHECKLIST_KEYS)[number], string> {
  const result: Record<string, string> = {
    triggerCondition: "",
    inputSpec: "",
    steps: "",
    checkCriteria: "",
    abortCondition: "",
    recoveryMethod: "",
  };
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let currentKey: (typeof CHECKLIST_KEYS)[number] | null = null;
  const currentLines: string[] = [];

  const flush = () => {
    if (currentKey && currentLines.length > 0) {
      result[currentKey] = currentLines.join("\n").trim().slice(0, 2000);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    let matched: (typeof CHECKLIST_KEYS)[number] | null = null;
    for (const key of CHECKLIST_KEYS) {
      const label = CHECKLIST_LABELS[key];
      if (
        trimmed === label ||
        trimmed.startsWith(label + "：") ||
        trimmed.startsWith(label + ":") ||
        trimmed.match(new RegExp("^#+\\s*" + label + "\\s*[：:]?")) ||
        trimmed.match(new RegExp("^【?" + label + "】?\\s*[：:]?"))
      ) {
        matched = key;
        break;
      }
    }
    if (matched) {
      flush();
      currentKey = matched;
      const labelStr = CHECKLIST_LABELS[matched];
      let afterColon = trimmed;
      if (trimmed.startsWith(labelStr + "：")) afterColon = trimmed.slice((labelStr + "：").length).trim();
      else if (trimmed.startsWith(labelStr + ":")) afterColon = trimmed.slice((labelStr + ":").length).trim();
      else if (new RegExp("^#+\\s*" + labelStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[：:]?").test(trimmed)) {
        afterColon = trimmed.replace(new RegExp("^#+\\s*" + labelStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[：:]?\\s*"), "").trim();
      } else if (new RegExp("^【?" + labelStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "】?\\s*[：:]?").test(trimmed)) {
        afterColon = trimmed.replace(new RegExp("^【?" + labelStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "】?\\s*[：:]?\\s*"), "").trim();
      }
      currentLines.length = 0;
      if (afterColon) currentLines.push(afterColon);
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();
  return result as Record<(typeof CHECKLIST_KEYS)[number], string>;
}

/** 校验并解析 Excel 为 Skill 草稿；校验失败时返回 { error }，成功时返回 { draft } */
export function parseExcelToSkillDraft(
  buffer: Buffer,
  filename?: string,
): { draft: SkillExcelDraft } | { error: string } {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const validation = validateSkillExcelSheets(wb);
  if (!validation.ok) {
    return { error: validation.error };
  }

  const reqSheetName = findSheetByName(wb, ["需求说明及知识", "需求说明"]);
  const reqSheet = reqSheetName ? wb.Sheets[reqSheetName] : null;
  const reqRows = reqSheet ? getSheetRows(reqSheet) : [];
  const requirementText = extractRequirementText(reqRows);

  const knowledgeSheetName = findSheetByName(wb, ["知识"]);
  let lexicon: BusinessLexiconEntry[] = extractLexiconFromRequirement(requirementText);
  if (knowledgeSheetName) {
    const knowledgeRows = getSheetRows(wb.Sheets[knowledgeSheetName]);
    const knowledgeText = extractRequirementText(knowledgeRows);
    if (knowledgeText.trim()) {
      const fromKnowledge = extractLexiconFromRequirement(knowledgeText);
      if (fromKnowledge.length > 0) lexicon = fromKnowledge;
    }
  }

  let outputSpecColumns: Array<{ key: string; label: string; dataType: "string" | "number" }> = [];
  const outDataName = findSheetByName(wb, ["输出数据"]);
  if (outDataName) {
    const outRows = getSheetRows(wb.Sheets[outDataName]);
    const parsed = extractOutputSpecAndRows(outRows);
    outputSpecColumns = parsed.spec.columns;
  }

  const sqlSheetName = findSheetByName(wb, ["输出 SQL", "输出sql"]);
  let sqlBlocks: string[] = [];
  if (sqlSheetName) {
    const sqlRows = getSheetRows(wb.Sheets[sqlSheetName]);
    const template = extractSqlTemplate(sqlRows);
    if (template) sqlBlocks.push(template.rawSql);
  }

  const name = buildName(requirementText, filename);
  const summary = buildSummary(requirementText);
  const content = buildContent(requirementText, lexicon, outputSpecColumns, sqlBlocks);
  const tags = buildTags(lexicon, outputSpecColumns);
  const applicableScenes = ["自然语言取数", "经营指标问数"];
  const category = "用户创建";

  const checklist = extractChecklistFromText(requirementText);

  return {
    draft: {
      name,
      summary,
      content,
      tags,
      applicableScenes,
      category,
      triggerCondition: (checklist.triggerCondition || "").trim(),
      inputSpec: (checklist.inputSpec || "").trim(),
      steps: (checklist.steps || "").trim(),
      checkCriteria: (checklist.checkCriteria || "").trim(),
      abortCondition: (checklist.abortCondition || "").trim(),
      recoveryMethod: (checklist.recoveryMethod || "").trim(),
    },
  };
}

function buildName(requirementText: string, filename?: string): string {
  const firstLine = requirementText.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 200) {
    return firstLine.slice(0, 100);
  }
  if (filename) {
    const base = filename.replace(/\.(xlsx|xls)$/i, "").trim();
    return base.slice(0, 100);
  }
  return "未命名 Skill（Excel 导入）";
}

function buildSummary(requirementText: string): string {
  const trimmed = requirementText.trim();
  if (!trimmed) return "从 Excel 导入的自然语言取数 Skill";
  const firstParagraph = trimmed.split(/\n\s*\n/)[0]?.trim() ?? trimmed;
  return firstParagraph.slice(0, 300);
}

function buildContent(
  requirementText: string,
  lexicon: BusinessLexiconEntry[],
  outputSpecColumns: Array<{ key: string; label: string; dataType: string }>,
  sqlBlocks: string[],
): string {
  const sections: string[] = [];

  sections.push("## 需求说明");
  sections.push("");
  sections.push(requirementText.trim() || "（无）");
  sections.push("");

  sections.push("## 业务知识");
  sections.push("");
  if (lexicon.length > 0) {
    sections.push("| 术语/口径 | 定义 | 分类 |");
    sections.push("|-----------|------|------|");
    for (const e of lexicon) {
      const def = (e.definition ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      const cat = e.category ?? "-";
      sections.push("| " + e.term + " | " + def + " | " + cat + " |");
    }
  } else {
    sections.push("（无）");
  }
  sections.push("");

  sections.push("## 输出规范");
  sections.push("");
  if (outputSpecColumns.length > 0) {
    sections.push("| 列 key | 展示名 | 类型 |");
    sections.push("|--------|--------|------|");
    for (const c of outputSpecColumns) {
      sections.push("| " + c.key + " | " + (c.label || c.key) + " | " + c.dataType + " |");
    }
  } else {
    sections.push("（无）");
  }
  sections.push("");

  sections.push("## 标准 SQL");
  sections.push("");
  if (sqlBlocks.length > 0) {
    for (const sql of sqlBlocks) {
      sections.push("```sql");
      sections.push(sql);
      sections.push("```");
      sections.push("");
    }
  } else {
    sections.push("（无）");
  }

  return sections.join("\n");
}

function buildTags(
  lexicon: BusinessLexiconEntry[],
  outputSpecColumns: Array<{ key: string; label: string }>,
): string[] {
  const tags = new Set<string>(["Excel导入", "自然语言取数"]);
  for (const e of lexicon) {
    if (e.category) tags.add(e.category);
  }
  for (let i = 0; i < outputSpecColumns.length && i < 5; i++) {
    const label = (outputSpecColumns[i].label || outputSpecColumns[i].key || "").trim();
    if (label && label.length <= 20) tags.add(label);
  }
  return Array.from(tags);
}
