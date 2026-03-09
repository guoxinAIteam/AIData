/**
 * 经营指标问数 Excel 标准化解析引擎。
 * 解析「需求说明及知识」「输出数据」「输出 SQL」及 5 个关联表 Sheet，产出知识包与标准化文档。
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";

/** 业务知识词典条目（取数口径、指标定义、术语） */
export interface BusinessLexiconEntry {
  term: string;
  definition: string;
  category?: "取数口径" | "指标定义" | "术语解释" | "账期规则" | "过滤条件";
}

/** 单表字段定义 */
export interface DataDictionaryField {
  tableName: string;
  fieldEn: string;
  fieldCn: string;
  dataType: string;
  length?: string;
  isPartition: boolean;
  ruleSummary?: string;
}

/** 表间关联 */
export interface TableRelation {
  leftTable: string;
  rightTable: string;
  leftKey: string;
  rightKey: string;
  joinType: "JOIN" | "LEFT JOIN";
  description?: string;
}

/** 标准 SQL 模板 */
export interface SqlTemplate {
  id: string;
  rawSql: string;
  description?: string;
  outputColumns: string[];
}

/** 输出规范（列名、顺序、类型） */
export interface OutputSpec {
  columns: Array<{ key: string; label: string; dataType: "string" | "number" }>;
  orderBy?: string;
}

/** 问数知识包（缓存结构） */
export interface KnowledgePack {
  version: string;
  updatedAt: string;
  sourcePath?: string;
  requirementText: string;
  lexicon: BusinessLexiconEntry[];
  dataDictionary: DataDictionaryField[];
  tableRelations: TableRelation[];
  sqlTemplates: SqlTemplate[];
  outputSpec: OutputSpec;
  /** 输出数据 Sheet 的样本行（用于回放） */
  outputDataRows: Record<string, unknown>[];
}

const DEFAULT_FIXED_PATH =
  process.env.METRICS_EXCEL_PATH ||
  "/Users/anzp/Documents/智能取数/国信试点树江方案/25年12月分省公众渠道新发展用户数（去除副卡产品）.xlsx";

const TABLE_SHEET_NAMES = [
  "dwa_v_m_cus_cb_user_info",
  "dwd_d_mrt_al_chl_channel",
  "DWD_D_PRD_CB_PRODUCT_ITEM",
  "dwd_d_prd_cb_product",
  "dim_province",
] as const;

function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

/** 按名称模糊匹配 Sheet：返回第一个名称包含任一 patterns 的 Sheet 名 */
export function findSheetByName(wb: XLSX.WorkBook, patterns: string[]): string | null {
  const names = wb.SheetNames || [];
  for (const p of patterns) {
    const exact = names.find((n) => (n || "").trim() === p);
    if (exact) return exact;
  }
  for (const p of patterns) {
    const fuzzy = names.find((n) => (n || "").includes(p));
    if (fuzzy) return fuzzy;
  }
  return null;
}

/** 供外部调用的 sheet 转行数组 */
export function getSheetRows(ws: XLSX.WorkSheet): unknown[][] {
  return sheetToRows(ws);
}

export function extractRequirementText(rows: unknown[][]): string {
  const flat = rows.flat();
  const first = flat.find((v) => String(v).trim() !== "") as string | undefined;
  return first?.trim() ?? "";
}

export function extractLexiconFromRequirement(text: string): BusinessLexiconEntry[] {
  const entries: BusinessLexiconEntry[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.includes("账期")) {
      entries.push({ term: "账期", definition: line.slice(0, 200), category: "账期规则" });
    }
    if (line.includes("is_stat") || line.includes("真实用户")) {
      entries.push({ term: "is_stat", definition: "1-真实用户，0-测试用户", category: "过滤条件" });
    }
    if (line.includes("is_this_dev") || line.includes("新发展")) {
      entries.push({ term: "is_this_dev", definition: "0-存量用户，1-新发展用户", category: "过滤条件" });
    }
    if (line.includes("公众渠道") || line.includes("chnl_kind_id")) {
      entries.push({
        term: "公众渠道",
        definition: "政企渠道编码排除：1020200,1010500,2050400,2020200；其余为公众渠道",
        category: "术语解释",
      });
    }
    if (line.includes("副卡") || line.includes("PRODUCT_00_TYPE")) {
      entries.push({
        term: "副卡产品",
        definition: "attr_code='PRODUCT_00_TYPE' AND attr_value='13'",
        category: "术语解释",
      });
    }
    if (line.includes("移网") || line.includes("net_type_cbss")) {
      entries.push({ term: "移网", definition: "net_type_cbss='50'", category: "术语解释" });
    }
    if (line.includes("基本产品") || line.includes("product_mode")) {
      entries.push({ term: "基本产品", definition: "product_mode='00'", category: "术语解释" });
    }
  }
  if (entries.length === 0) {
    entries.push({ term: "需求说明", definition: text.slice(0, 500), category: "取数口径" });
  }
  return entries;
}

export function extractOutputSpecAndRows(rows: unknown[][]): { spec: OutputSpec; dataRows: Record<string, unknown>[] } {
  const headerRow = rows[0] as string[];
  const dataRows: Record<string, unknown>[] = [];
  const columns: OutputSpec["columns"] = [];
  const headerKeys = headerRow.map((h, i) => {
    const key = String(h ?? "").trim().replace(/^[a-z]\./i, "") || `col_${i}`;
    columns.push({
      key,
      label: key.includes("province") ? "省分名称" : String(h ?? "").trim() || key,
      dataType: key.includes("用户数") || key.includes("数") ? "number" : "string",
    });
    return key;
  });
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const obj: Record<string, unknown> = {};
    headerKeys.forEach((k, j) => {
      const v = row[j];
      if (columns[j].dataType === "number" && typeof v === "number") obj[k] = v;
      else obj[k] = v != null ? String(v) : "";
    });
    if (Object.values(obj).some((v) => v !== "" && v != null)) dataRows.push(obj);
  }
  return {
    spec: { columns },
    dataRows,
  };
}

export function extractSqlTemplate(rows: unknown[][]): SqlTemplate | null {
  let sql = "";
  for (const row of rows) {
    for (const cell of row as unknown[]) {
      const s = String(cell ?? "").trim();
      if (/^\s*select\s+/i.test(s)) {
        sql = s;
        break;
      }
    }
    if (sql) break;
  }
  if (!sql) return null;
  const outputColumns = ["省分名称", "新发展用户数"];
  return {
    id: "template_1",
    rawSql: sql,
    description: "分省公众渠道新发展用户数（去副卡）",
    outputColumns,
  };
}

function parseTableSheetFields(
  wb: XLSX.WorkBook,
  sheetName: string,
  headerEnKey: string,
  headerCnKey: string,
): DataDictionaryField[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = sheetToRows(ws);
  const headerRow = rows[0] as string[];
  const idxEn = headerRow.findIndex((h) => String(h).includes(headerEnKey) || String(h) === "模型字段英文名称");
  const idxCn = headerRow.findIndex((h) => String(h).includes(headerCnKey) || String(h) === "模型字段中文名称");
  const idxType = headerRow.findIndex((h) => String(h).includes("字段类型"));
  const idxLen = headerRow.findIndex((h) => String(h).includes("字段长度"));
  const idxPart = headerRow.findIndex((h) => String(h).includes("分区"));
  const idxRule = headerRow.findIndex((h) => String(h).includes("口径说明"));
  if (idxEn === -1) return [];
  const fields: DataDictionaryField[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const en = String(r[idxEn] ?? "").trim();
    if (!en || en.length > 80) continue;
    fields.push({
      tableName: sheetName,
      fieldEn: en,
      fieldCn: String(r[idxCn] ?? "").trim(),
      dataType: String(r[idxType] ?? "string").trim(),
      length: r[idxLen] != null ? String(r[idxLen]) : undefined,
      isPartition: String(r[idxPart] ?? "").trim() === "1",
      ruleSummary: r[idxRule] != null ? String(r[idxRule]).trim().slice(0, 120) : undefined,
    });
  }
  return fields;
}

function parseDimProvince(ws: XLSX.WorkSheet): DataDictionaryField[] {
  const rows = sheetToRows(ws);
  const headerIdx = rows.findIndex((r) => Array.isArray(r) && (r as string[]).includes("col_name"));
  if (headerIdx < 0) return [];
  const header = (rows[headerIdx] as string[]).map((h) => String(h ?? ""));
  const idxCol = header.indexOf("col_name");
  const idxType = header.indexOf("data_type");
  const idxComment = header.indexOf("comment");
  if (idxCol < 0) return [];
  const fields: DataDictionaryField[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const col = String(r[idxCol] ?? "").trim();
    if (!col || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) continue;
    fields.push({
      tableName: "dim_province",
      fieldEn: col,
      fieldCn: String(r[idxComment] ?? "").trim(),
      dataType: String(r[idxType] ?? "string").trim(),
      isPartition: false,
    });
  }
  return fields;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- static relations
function buildTableRelations(_requirementText: string): TableRelation[] {
  return [
    {
      leftTable: "dwa_v_m_cus_cb_user_info",
      rightTable: "dwd_d_mrt_al_chl_channel",
      leftKey: "develop_channel_id",
      rightKey: "chnl_id",
      joinType: "JOIN",
      description: "用户发展渠道与渠道表关联",
    },
    {
      leftTable: "dwa_v_m_cus_cb_user_info",
      rightTable: "dwd_d_prd_cb_product_item",
      leftKey: "product_id",
      rightKey: "product_id",
      joinType: "LEFT JOIN",
      description: "副卡产品过滤（left join 后 is null 排除副卡）",
    },
    {
      leftTable: "dwa_v_m_cus_cb_user_info",
      rightTable: "dwd_d_prd_cb_product",
      leftKey: "product_id",
      rightKey: "product_id",
      joinType: "JOIN",
      description: "移网主产品",
    },
    {
      leftTable: "dwa_v_m_cus_cb_user_info",
      rightTable: "dim_province",
      leftKey: "prov_id",
      rightKey: "province_id",
      joinType: "LEFT JOIN",
      description: "省分名称",
    },
  ];
}

/** 校验 Excel 是否包含 Skill 导入所需的 4 个指定 Sheet（或 3 个当「需求说明及知识」合并时） */
export function validateSkillExcelSheets(
  wb: XLSX.WorkBook,
): { ok: true } | { ok: false; error: string } {
  const reqSheetName = findSheetByName(wb, ["需求说明及知识", "需求说明"]);
  if (!reqSheetName) {
    return { ok: false, error: "缺少「需求说明」或「需求说明及知识」Sheet，请补充后重新导入。" };
  }
  const reqRows = sheetToRows(wb.Sheets[reqSheetName]);
  const requirementText = extractRequirementText(reqRows);
  if (!requirementText || !requirementText.trim()) {
    return { ok: false, error: "「需求说明」Sheet 内容为空，请补充后重新导入。" };
  }

  const outDataName = findSheetByName(wb, ["输出数据"]);
  if (!outDataName) {
    return { ok: false, error: "缺少「输出数据」Sheet，请补充后重新导入。" };
  }
  const outRows = sheetToRows(wb.Sheets[outDataName]);
  if (!outRows.length || outRows[0] == null) {
    return { ok: false, error: "「输出数据」Sheet 缺少表头行，请补充后重新导入。" };
  }

  const sqlSheetName = findSheetByName(wb, ["输出 SQL", "输出sql"]);
  if (!sqlSheetName) {
    return { ok: false, error: "缺少「输出 SQL」Sheet，请补充后重新导入。" };
  }
  const sqlRows = sheetToRows(wb.Sheets[sqlSheetName]);
  const sqlTemplate = extractSqlTemplate(sqlRows);
  if (!sqlTemplate) {
    return { ok: false, error: "「输出 SQL」Sheet 中未解析到有效 SELECT 查询语句，请补充后重新导入。" };
  }

  return { ok: true };
}

/** 从本地路径加载 Excel 并解析为知识包 */
export function loadKnowledgePackFromPath(filePath: string): KnowledgePack {
  const buf = fs.readFileSync(filePath);
  return loadKnowledgePackFromBuffer(buf, filePath);
}

/** 从 Buffer 加载 Excel 并解析为知识包 */
export function loadKnowledgePackFromBuffer(buffer: Buffer, sourcePath?: string): KnowledgePack {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const version = `v1-${Date.now()}`;

  let requirementText = "";
  let outputSpec: OutputSpec = { columns: [] };
  let outputDataRows: Record<string, unknown>[] = [];
  let sqlTemplate: SqlTemplate | null = null;

  const reqSheetName = findSheetByName(wb, ["需求说明及知识", "需求说明"]);
  if (reqSheetName) {
    const reqSheet = wb.Sheets[reqSheetName];
    const reqRows = sheetToRows(reqSheet);
    requirementText = extractRequirementText(reqRows);
  }

  const outSheetName = findSheetByName(wb, ["输出数据"]);
  if (outSheetName) {
    const outSheet = wb.Sheets[outSheetName];
    const outRows = sheetToRows(outSheet);
    const parsed = extractOutputSpecAndRows(outRows);
    outputSpec = parsed.spec;
    outputDataRows = parsed.dataRows;
  }

  const sqlSheetName = findSheetByName(wb, ["输出 SQL", "输出sql"]);
  if (sqlSheetName) {
    const sqlSheet = wb.Sheets[sqlSheetName];
    sqlTemplate = extractSqlTemplate(sheetToRows(sqlSheet));
  }

  const lexicon = extractLexiconFromRequirement(requirementText);
  const dataDictionary: DataDictionaryField[] = [];
  for (const name of TABLE_SHEET_NAMES) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    if (name === "dim_province") {
      dataDictionary.push(...parseDimProvince(ws));
    } else {
      dataDictionary.push(
        ...parseTableSheetFields(wb, name, "模型字段英文名称", "模型字段中文名称"),
      );
    }
  }
  const tableRelations = buildTableRelations(requirementText);

  const sqlTemplates: SqlTemplate[] = sqlTemplate ? [sqlTemplate] : [];

  return {
    version,
    updatedAt: now,
    sourcePath,
    requirementText,
    lexicon,
    dataDictionary,
    tableRelations,
    sqlTemplates,
    outputSpec,
    outputDataRows,
  };
}

/** 生成《Excel 内容标准化梳理文档》Markdown */
export function buildStandardizationDoc(pack: KnowledgePack): string {
  const lines: string[] = [
    "# Excel 内容标准化梳理文档",
    "",
    "## 指定 Sheet 命名规范与模糊识别规则",
    "",
    "本知识包由以下指定 Sheet 生成，系统按名称模糊匹配（无需与下表完全一致）：",
    "",
    "| Sheet 用途 | 匹配规则（任一即可） | 说明 |",
    "|------------|----------------------|------|",
    "| 需求说明 | 名称包含「需求说明及知识」或「需求说明」 | 业务需求、取数口径、指标定义等 |",
    "| 知识 | 名称包含「知识」 | 可选；可与需求说明合并为「需求说明及知识」 |",
    "| 输出数据 | 名称包含「输出数据」 | 表头为列名，以下为数据行 |",
    "| 输出 SQL | 名称包含「输出 SQL」或「输出sql」 | 至少包含一条 SELECT 语句 |",
    "",
    "5 个关联表 Sheet 的梳理与自然语言取数一致，见下方数据字典与表关联逻辑。",
    "",
    "---",
    "",
    `生成时间：${pack.updatedAt} | 知识包版本：${pack.version}`,
    "",
    "## 一、业务知识词典",
    "",
    "| 术语/口径 | 定义 | 分类 |",
    "|-----------|------|------|",
  ];
  for (const e of pack.lexicon) {
    const def = e.definition.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const cat = e.category ?? "-";
    lines.push("| " + e.term + " | " + def + " | " + cat + " |");
  }
  lines.push("", "## 二、数据字典（关联表字段）", "");
  const byTable = new Map<string, DataDictionaryField[]>();
  for (const f of pack.dataDictionary) {
    const list = byTable.get(f.tableName) ?? [];
    list.push(f);
    byTable.set(f.tableName, list);
  }
  for (const [tableName, fields] of byTable) {
    lines.push("### " + tableName, "");
    lines.push("| 英文字段名 | 中文名 | 类型 | 长度 | 分区 | 口径说明 |");
    lines.push("|------------|--------|------|------|------|----------|");
    for (const f of fields) {
      const cn = (f.fieldCn ?? "").replace(/\|/g, "\\|");
      const rule = (f.ruleSummary ?? "").slice(0, 40);
      lines.push("| " + f.fieldEn + " | " + cn + " | " + f.dataType + " | " + (f.length ?? "-") + " | " + (f.isPartition ? "是" : "否") + " | " + rule + " |");
    }
    lines.push("");
  }
  lines.push("## 三、表关联逻辑手册", "");
  lines.push("| 左表 | 右表 | 关联字段 | 关联方式 | 说明 |");
  lines.push("|------|------|----------|----------|------|");
  for (const r of pack.tableRelations) {
    const desc = r.description ?? "-";
    lines.push("| " + r.leftTable + " | " + r.rightTable + " | " + r.leftKey + "=" + r.rightKey + " | " + r.joinType + " | " + desc + " |");
  }
  lines.push("", "## 四、标准 SQL 模板库", "");
  for (const t of pack.sqlTemplates) {
    lines.push("### " + t.id + " " + (t.description ?? ""), "");
    lines.push("```sql", t.rawSql, "```", "");
  }
  lines.push("## 五、输出数据规范", "");
  lines.push("| 列 key | 展示名 | 类型 |");
  lines.push("|--------|--------|------|");
  for (const c of pack.outputSpec.columns) {
    lines.push("| " + c.key + " | " + c.label + " | " + c.dataType + " |");
  }
  return lines.join("\n");
}

/** 规则化 NL：根据自然语言匹配是否命中当前场景并返回模板 ID 与解释 */
export function matchRuleAndTemplate(
  pack: KnowledgePack,
  question: string,
): { matched: boolean; templateId: string | null; intent: string; explanation: string } {
  const q = (question || "").toLowerCase().trim();
  const hasNewDev = /新(增)?发展?用户|新发展|用户数/.test(q) || q.includes("新用户");
  const hasPublic = /公众|渠道/.test(q) || q.includes("分省");
  const hasProvince = /省|分省|各省/.test(q);
  if (pack.sqlTemplates.length === 0) {
    return {
      matched: false,
      templateId: null,
      intent: "未配置标准 SQL 模板",
      explanation: "Excel 中「输出 SQL」Sheet 未解析到有效 SQL，无法规则匹配。",
    };
  }
  const template = pack.sqlTemplates[0];
  const matched = hasNewDev || hasPublic || hasProvince;
  const intent = matched ? "分省公众渠道新发展用户数（去除副卡产品）" : "未命中当前规则场景，可尝试：分省新发展用户数、公众渠道用户数等表述。";
  const explanation = matched
    ? "命中模板「" + (template.description ?? "") + "」，将使用标准 SQL 返回「输出数据」规范结果。"
    : "未命中预设规则，可切换模型兜底或补充 Excel 规则。";
  return {
    matched,
    templateId: matched ? template.id : null,
    intent,
    explanation,
  };
}

/** 默认固定路径（可被 METRICS_EXCEL_PATH 覆盖） */
export function getDefaultFixedPath(): string {
  return DEFAULT_FIXED_PATH;
}

/** 从知识包推断指标（供语义知识库回写，不含 id） */
export function inferMetricsFromKnowledgePack(pack: KnowledgePack): Array<{
  name: string;
  metricType: "基础指标" | "复合指标";
  definition: string;
  code: string;
}> {
  const results: Array<{ name: string; metricType: "基础指标" | "复合指标"; definition: string; code: string }> = [];
  const seen = new Set<string>();
  for (const col of pack.outputSpec.columns) {
    const label = (col.label || col.key || "").trim();
    const key = (col.key || label).trim();
    if (!key || seen.has(key)) continue;
    const isMetric =
      col.dataType === "number" ||
      /数|率|值|额|量|占比|渗透率/.test(label);
    if (!isMetric) continue;
    seen.add(key);
    const definitionFromLexicon = pack.lexicon.find(
      (e) => e.category === "指标定义" && (e.term === label || e.term.includes(label) || label.includes(e.term)),
    );
    const definition = (definitionFromLexicon?.definition ?? pack.requirementText.slice(0, 200)) || "";
    const metricType: "基础指标" | "复合指标" = /率|占比|渗透|ARPU|复合/.test(label) ? "复合指标" : "基础指标";
    results.push({
      name: label,
      metricType,
      definition: definition.slice(0, 500),
      code: key.replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5_]/g, "_") || `metric_${results.length}`,
    });
  }
  return results;
}

/** 从知识包推断维度（供语义知识库回写，不含 id） */
export function inferDimensionsFromKnowledgePack(pack: KnowledgePack): Array<{
  name: string;
  code: string;
  parentName: string;
  valueConstraint: string;
}> {
  const results: Array<{ name: string; code: string; parentName: string; valueConstraint: string }> = [];
  const seen = new Set<string>();
  for (const col of pack.outputSpec.columns) {
    const label = (col.label || col.key || "").trim();
    const key = (col.key || label).trim();
    if (!key || seen.has(key)) continue;
    const isDimension = col.dataType === "string" && !/数|率|值|额|量|占比/.test(label);
    if (!isDimension) continue;
    seen.add(key);
    const code = key.replace(/\s+/g, "_").replace(/[^\w\u4e00-\u9fa5_]/g, "_") || `dim_${results.length}`;
    let parentName = "-";
    let valueConstraint = "";
    if (/省|分省|省份|省分/.test(label)) {
      parentName = "地域";
      const dimFields = pack.dataDictionary.filter((f) => f.tableName === "dim_province" || f.fieldCn?.includes("省"));
      if (dimFields.length > 0) {
        valueConstraint = dimFields.map((f) => `${f.fieldEn}: ${f.fieldCn || f.ruleSummary || ""}`).join("; ").slice(0, 200);
      } else {
        valueConstraint = "取值来自维度表或枚举";
      }
    } else {
      const match = pack.dataDictionary.find((f) => f.fieldCn === label || f.fieldEn === key);
      if (match) valueConstraint = match.ruleSummary ?? `${match.fieldEn} (${match.dataType})`;
    }
    results.push({ name: label, code, parentName, valueConstraint: valueConstraint.slice(0, 300) });
  }
  return results;
}

/** 知识集合表结构（与 domain KnowledgeTable 对齐） */
export interface KnowledgeTableExport {
  tableName: string;
  fields: { name: string; type?: string; comment?: string }[];
  relations?: string[];
}

/** 从知识包构建知识集合（表结构 + 需求说明 + 表使用说明） */
export function buildKnowledgeCollectionFromPack(pack: KnowledgePack): {
  refinedSummary: string;
  requirementText: string;
  tables: KnowledgeTableExport[];
  tableUsageDescriptions: string;
  updatedAt: string;
} {
  const byTable = new Map<string, { name: string; type?: string; comment?: string }[]>();
  for (const f of pack.dataDictionary) {
    const list = byTable.get(f.tableName) ?? [];
    list.push({
      name: f.fieldEn,
      type: f.dataType,
      comment: f.fieldCn || f.ruleSummary,
    });
    byTable.set(f.tableName, list);
  }
  const tables: KnowledgeTableExport[] = [];
  for (const [tableName, fields] of byTable) {
    const relations = pack.tableRelations
      .filter((r) => r.leftTable === tableName || r.rightTable === tableName)
      .map((r) => `${r.leftTable}.${r.leftKey}=${r.rightTable}.${r.rightKey} (${r.joinType})`);
    tables.push({ tableName, fields, relations: relations.length > 0 ? relations : undefined });
  }
  const lexiconText = pack.lexicon
    .map((e) => `${e.term}：${e.definition}`)
    .join("\n");
  const tableUsageDescriptions = pack.tableRelations
    .map((r) => `${r.leftTable} ${r.joinType} ${r.rightTable} ON ${r.leftKey}=${r.rightKey}${r.description ? `（${r.description}）` : ""}`)
    .join("\n");
  return {
    refinedSummary: pack.requirementText.slice(0, 500),
    requirementText: pack.requirementText,
    tables,
    tableUsageDescriptions: (tableUsageDescriptions || lexiconText).slice(0, 2000),
    updatedAt: pack.updatedAt,
  };
}
