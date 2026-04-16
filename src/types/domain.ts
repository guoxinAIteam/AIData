export type EntityStatus = "enabled" | "disabled";

export interface AuthUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  avatarColor: string;
  permissionCodes: string[];
}

export interface AuthSession {
  userId: string;
  username: string;
  displayName: string;
  permissionCodes: string[];
}

export interface KnowledgeSystemCard {
  id: string;
  /** 关联 Skill ID（一 Skill 一库，必填唯一） */
  skillId: string;
  name: string;
  description: string;
  datasetCount: number;
  metricCount: number;
  owner: string;
  updatedAt: string;
}

export interface UploadedDocumentItem {
  id: string;
  name: string;
  type: "md" | "doc" | "docx" | "pdf" | "xlsx";
  size?: number;
  uploadedAt: string;
  uploaderId?: string;
  /** 文档内容（POC 存文本，MD/文本直接存；二进制可存 base64） */
  content?: string;
}

export interface DataSourceConfig {
  sourceType: "MYSQL" | "POSTGRESQL" | "HIVE" | "DOCUMENT_UPLOAD";
  driverClass?: string;
  jdbcUrl?: string;
  username?: string;
  defaultSchema?: string;
  poolInitSize?: number;
  poolMinSize?: number;
  poolMaxSize?: number;
  enabled?: boolean;
  /** 数据源名称（选填） */
  name?: string;
  /** 描述（选填） */
  description?: string;
  /** 负责人（选填） */
  owner?: string;
  /** 文档上传类型时的已上传文档列表 */
  uploadedDocuments?: UploadedDocumentItem[];
}

export interface TreeNode {
  key: string;
  title: string;
  children?: TreeNode[];
}

export interface DatasetItem {
  id: string;
  name: string;
  periodType: "月账期" | "日账期" | "年账期";
  fieldCount: number;
  boundDimensionCount: number;
  description: string;
  /** 关联的导入表 ID（来自外部导入） */
  importedTableId?: string;
  /** 主键字段，逗号分隔 */
  primaryKey?: string;
  /** 数据来源展示文案 */
  dataSourceLabel?: string;
  /** 更新时间 */
  updatedAt?: string;
}

/** 导入来源类型：文件或数据库 */
export type ImportSourceType =
  | "file_csv"
  | "file_excel"
  | "file_json"
  | "mysql"
  | "postgresql";

/** 外部导入的数据表元数据 */
export interface ImportedTable {
  id: string;
  name: string;
  sourceType: ImportSourceType;
  fieldCount: number;
  rowCount: number;
  primaryKey: string;
  updatedAt: string;
  knowledgeSystemId?: string;
  datasetId?: string;
  /** 样本行（用于预览与只读查询 mock） */
  sampleRows?: Record<string, unknown>[];
}

/** 数据集详情视图（概览 + 样本） */
export interface DatasetDetailView {
  dataset: DatasetItem;
  importedTable?: ImportedTable;
  sampleRows: Record<string, unknown>[];
}

/** 只读 SQL 查询结果 */
export interface ReadOnlyQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

/** 术语与语义知识库条目的关联 */
export interface TermKnowledgeLink {
  termId: string;
  knowledgeSystemId: string;
  entryId: string;
}

/** NL2Semitic 自然语言检索命中项 */
export interface Nl2SemiticHit {
  concept: string;
  termIds: string[];
  relatedTermIds: string[];
  /** 解析后的术语（便于展示，由 API 填充） */
  terms?: GlossaryTerm[];
  relatedTerms?: GlossaryTerm[];
}

export interface MetricItem {
  id: string;
  name: string;
  metricType: "基础指标" | "复合指标";
  definition: string;
  code: string;
  /** 来源：Skill Excel 解析 / 文档抽取 / 手动 */
  source?: "skill_excel" | "document_extract" | "manual";
}

export interface DimensionItem {
  id: string;
  name: string;
  code: string;
  parentName: string;
  valueConstraint: string;
  /** 来源：Skill Excel 解析 / 文档抽取 / 手动 */
  source?: "skill_excel" | "document_extract" | "manual";
}

export type PermissionCategory =
  | "datasetAccess"
  | "metricAccess"
  | "sensitiveWhiteList"
  | "dimensionAccess";

export type PermissionSubjectType = "用户" | "用户组" | "组织机构";

export interface PermissionRecord {
  id: string;
  subjectType: PermissionSubjectType;
  subjectName: string;
  permissionDesc: string;
  updatedBy: string;
  updatedAt: string;
  enabled: boolean;
}

export interface PermissionResource {
  key: string;
  name: string;
  code: string;
}

/** 知识集合内单表结构（与 UploadRecord.tableStructure 对齐） */
export interface KnowledgeTable {
  tableName: string;
  fields: { name: string; type?: string; comment?: string }[];
  relations?: string[];
}

/** 知识集合：Skill 上传内容提炼 + 固化表结构与表使用说明 */
export interface KnowledgeCollection {
  refinedSummary?: string;
  requirementText?: string;
  tables: KnowledgeTable[];
  tableUsageDescriptions?: string;
  updatedAt?: string;
}

export interface KnowledgeSystemDetail {
  systemId: string;
  /** 关联 Skill ID（与 KnowledgeSystemCard.skillId 一致） */
  skillId?: string;
  dataSource: DataSourceConfig;
  datasetTree: TreeNode[];
  datasets: DatasetItem[];
  /** 上传记录列表（文档/表结构，只读，仅上传者可删） */
  uploadRecords?: UploadRecord[];
  /** 知识集合：表结构、表使用说明、提炼内容 */
  knowledgeCollection?: KnowledgeCollection;
  metricTree: TreeNode[];
  metrics: MetricItem[];
  dimensionTree: TreeNode[];
  dimensions: DimensionItem[];
  permissions: Record<PermissionCategory, PermissionRecord[]>;
  permissionResources: Record<PermissionCategory, PermissionResource[]>;
}

/** RAG 检索返回的切片 */
export interface RAGChunk {
  id: string;
  text: string;
  score?: number;
  metadata: {
    source_file: string;
    chunk_type: "markdown_section" | "excel_row" | "text_paragraph";
    section_title?: string;
  };
}

/** RAG 集合统计 */
export interface RAGCollectionStats {
  collection_id: string;
  chunk_count: number;
  file_count: number;
  file_sources: string[];
  last_updated?: string;
}

/** 知识库上传记录（文档或表结构，禁止编辑） */
export interface UploadRecord {
  id: string;
  name: string;
  type: "document" | "table_structure";
  uploadedAt: string;
  uploaderId?: string;
  uploaderName?: string;
  dataSourceId?: string;
  skillId?: string;
  /** 文档类：引用数据源中文档 id 或名称 */
  documentRef?: string;
  /** 表结构类：字段与关联 */
  tableStructure?: { fields: { name: string; type?: string; comment?: string }[]; relations?: string[] };
}

export type GlossaryType = "全局" | "智能匹配";

export interface GlossaryTerm {
  id: string;
  knowledgeSystemId: string;
  knowledgeSystemName: string;
  term: string;
  synonyms: string[];
  description: string;
  termType: GlossaryType;
  fieldMapping: string;
  exampleUsage: string;
  valueMapping: string;
  sqlSnippet: string;
  updatedBy: string;
  updatedAt: string;
  status: EntityStatus;
  references: string[];
  /** 本体层级分类 */
  ontologyClass?: string;
  /** 属性定义 */
  attributes?: { key: string; value: string }[];
  /** 关联关系：同义、上下位等 */
  relations?: { type: "synonym" | "hypernym" | "hyponym"; targetTermId: string }[];
}

/** 待确认术语（从外部 Skill 自动提取，确认后转为 GlossaryTerm） */
export interface PendingGlossaryTerm {
  id: string;
  term: string;
  sourceSkillId: string;
  sourceSkillName: string;
  domain: string;
  description: string;
  createdAt: string;
}

export interface ExampleQuestion {
  id: string;
  question: string;
  sql: string;
  datasource: string;
  author: string;
  updatedAt: string;
  status: EntityStatus;
}

export interface TraceStat {
  score: number;
  successRate: number;
  avgLatency: number;
  totalLatency: number;
}

export interface TraceTrendPoint {
  time: string;
  latency: number;
}

export interface TraceRecord {
  id: string;
  question: string;
  parsedIntent: string;
  matchScore: number;
  executionTime: number;
  model: string;
  status: "成功" | "失败";
  updatedAt: string;
}

/** 操作日志所属模块 */
export type OperationLogModule =
  | "metrics_qa"
  | "skill_lib"
  | "knowledge"
  | "example_qa"
  | "glossary"
  | "question_labeling";

/** 操作类型 */
export type OperationLogActionType =
  | "新增"
  | "编辑"
  | "删除"
  | "导入"
  | "导出"
  | "查看"
  | "检索"
  | "绑定"
  | "解绑"
  | "问数"
  | "同步"
  | "状态切换"
  | "引用"
  | "关联"
  | "确认"
  | "驳回";

/** 统一操作记录（全模块审计） */
export interface OperationLogEntry {
  id: string;
  module: OperationLogModule;
  moduleName: string;
  actionType: OperationLogActionType;
  actionSummary: string;
  relatedObject?: string;
  operator: string;
  operatorId?: string;
  status: "成功" | "失败";
  failReason?: string;
  createdAt: string;
  details?: string;
  /** 经营指标问数：结果来源（大模型 / 本地样例） */
  resultSource?: "大模型" | "本地样例";
  /** 经营指标问数：关联的历史问数记录 ID */
  metricsQAQuestionId?: string;
  /** 经营指标问数：绑定 Skill 名称（逗号分隔） */
  metricsQABoundSkillNames?: string;
  /** 经营指标问数：是否编辑过 SQL */
  metricsQASqlEdited?: boolean;
  /** 样本打标：任务 ID */
  questionLabelingJobId?: string;
  /** 样本打标：本次打标 token 消耗数 */
  questionLabelingTokenTotal?: number;
}

/** 模型用量单次调用记录 */
export interface ModelUsageEntry {
  id: string;
  operatorId?: string;
  operatorName?: string;
  module: OperationLogModule;
  operationLogId?: string;
  model: string;
  requestAt: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs?: number;
}

export interface SkillItem {
  id: string;
  rank?: number;
  name: string;
  summary: string;
  category: "官方推荐" | "开发提效" | "数据分析" | "Agent 编排" | "用户创建";
  tags: string[];
  applicableScenes: string[];
  content: string;
  source: string;
  sourceUrl?: string;
  owner?: string;
  repository?: string;
  skillSlug?: string;
  installsText?: string;
  installsCount?: number;
  author: string;
  updatedAt: string;
  status: EntityStatus;
  isCustom: boolean;
  /** 创建该 Skill 的用户 ID（用于权限：仅创建者可编辑/删除） */
  createdByUserId?: string;
  /** 是否来自官方榜单（skills.sh） */
  isOfficial?: boolean;
  /** 版本号或版本描述 */
  version?: string;
  /** 导入来源：manual | file_md | file_docx | file_xlsx */
  importSource?: "manual" | "file_md" | "file_docx" | "file_xlsx";
  /** 优秀 Skills 检查清单：触发条件 */
  triggerCondition?: string;
  /** 优秀 Skills 检查清单：输入 */
  inputSpec?: string;
  /** 优秀 Skills 检查清单：步骤 */
  steps?: string;
  /** 优秀 Skills 检查清单：检查 */
  checkCriteria?: string;
  /** 优秀 Skills 检查清单：中止条件 */
  abortCondition?: string;
  /** 优秀 Skills 检查清单：恢复方式 */
  recoveryMethod?: string;
  /** 外部爬取渠道（如 skills.sh） */
  crawlChannel?: string;
  /** 外部爬取时间 */
  crawledAt?: string;
}

/** Skill 来源类型：自有（手动/文件导入） | 外部爬取（skills.sh） */
export type SkillSourceType = "own" | "external_crawl";

export function getSkillSourceType(item: SkillItem): SkillSourceType {
  if (item.isOfficial === true) return "external_crawl";
  return "own";
}

export type SkillLeaderboardMode = "all" | "trending" | "hot";

export interface SkillFilter {
  keyword?: string;
  category?: SkillItem["category"] | "all";
  status?: EntityStatus | "all";
  mode?: SkillLeaderboardMode;
  /** 来源类型：全部 / 自有 / 外部爬取 */
  sourceType?: SkillSourceType | "all";
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页条数，默认 10 */
  pageSize?: number;
  /** 「我的 Skill」仅展示当前用户时传入 */
  createdByUserId?: string;
}

export interface BusinessMetricSnapshot {
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
}

export interface MetricTrendPoint {
  period: string;
  value: number;
}

export interface BusinessMetricQueryPayload {
  question?: string;
  region?: BusinessMetricSnapshot["region"] | "全部";
  period?: BusinessMetricSnapshot["period"] | "全部";
  metricCode?: BusinessMetricSnapshot["metricCode"] | "all";
  /** 本次问数绑定的 Skill ID 列表 */
  skillIds?: string[];
  /** 问数会话 ID，用于追溯 */
  qaSessionId?: string;
  /** 知识包版本（可选，用于校验） */
  knowledgeVersion?: string;
}

/** 问数结果输出规范（Excel 输出数据 Sheet 列定义） */
export interface OutputSpecColumn {
  key: string;
  label: string;
  dataType: "string" | "number";
}

export interface OutputSpec {
  columns: OutputSpecColumn[];
  orderBy?: string;
}

export interface BusinessMetricQueryResult {
  resolvedIntent: string;
  resolvedMetricCodes: Array<BusinessMetricSnapshot["metricCode"]>;
  metrics: BusinessMetricSnapshot[];
  trend: MetricTrendPoint[];
  generatedSql: string;
  explanation: string;
  appliedSkills?: { id: string; name: string }[];
  ruleTrace?: string;
  reportDraft?: RootCauseReportDraft;
  /** 思维链推理步骤 */
  chainOfThoughtSteps?: string[];
  /** 候选 SQL（1～3 条） */
  candidateSqls?: string[];
  /** Excel 规则回放时：输出规范与原始行，用于按输出数据 Sheet 渲染 */
  resultFormat?: "excel_replay";
  outputSpec?: OutputSpec;
  outputDataRows?: Record<string, unknown>[];
}

/** 问数 API 响应扩展字段（规则命中、耗时等） */
export interface MetricsQueryResponseExt {
  matchedRule?: boolean;
  sqlTemplateId?: string;
  knowledgeVersion?: string;
  durationMs?: number;
}

/** 经营指标问数历史记录（单条对话） */
export interface MetricQAHistoryEntry {
  id: string;
  operatorId: string;
  createdAt: string;
  question: string;
  boundSkillIds: string[];
  boundSkillNames: string;
  chainOfThoughtSteps: string[];
  originalSql: string;
  editedSql?: string;
  executeResult?: {
    outputSpec: OutputSpec;
    outputDataRows: Record<string, unknown>[];
  };
  resultSource: "大模型" | "本地样例";
  operationLogId: string;
}

/** 经营指标 Excel 知识包摘要（GET /api/metrics/excel/profile） */
export interface MetricsExcelProfile {
  success: boolean;
  loaded: boolean;
  message?: string;
  version?: string;
  updatedAt?: string;
  sourcePath?: string;
  lexiconCount?: number;
  dictionaryCount?: number;
  relationsCount?: number;
  sqlTemplateCount?: number;
  outputSpecColumns?: OutputSpecColumn[];
  outputDataRowCount?: number;
}

/** 根因分析报告草稿 */
export interface RootCauseReportDraft {
  id?: string;
  title: string;
  sections: RootCauseReportSection[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RootCauseReportSection {
  type: "metrics" | "trend" | "dimension" | "anomaly" | "conclusion" | "custom";
  title: string;
  content: string;
  data?: unknown;
}

/** 问数会话 Skill 绑定记录 */
export interface QaSkillBindRecord {
  qaSessionId: string;
  skillIds: string[];
  boundAt: string;
  userId?: string;
}

/** 指标与语义知识库的关联（手动绑定） */
export interface MetricKnowledgeLink {
  metricId: string;
  knowledgeSystemId: string;
  termIds: string[];
}

/** 能力维度与语义知识库的关联（手动绑定） */
export interface DimensionKnowledgeLink {
  dimensionId: string;
  knowledgeSystemId: string;
  termIds: string[];
}

/** 本体库 */
export interface OntologyLibrary {
  id: string;
  name: string;
  description?: string;
  domain?: string;
  createdAt: string;
  updatedAt: string;
  version?: string;
}

/** 本体概念 */
export interface OntologyConcept {
  id: string;
  libraryId: string;
  name: string;
  parentId?: string;
  description?: string;
  sortOrder?: number;
}

/** 本体概念属性定义 */
export interface OntologyProperty {
  id: string;
  conceptId: string;
  name: string;
  dataType: string;
  required: boolean;
  description?: string;
}

/** 本体语义关系类型 */
export interface OntologyRelationType {
  id: string;
  libraryId: string;
  name: string;
  direction: "directed" | "symmetric";
}

/** 本体概念间关系 */
export interface OntologyRelation {
  id: string;
  libraryId: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationType: string;
}

/** 本体与术语/指标/维度的映射 */
export interface OntologyMapping {
  id: string;
  conceptId: string;
  targetType: "glossaryTerm" | "metric" | "dimension";
  targetId: string;
}

/** Skill 关联的语义知识库条目（1 Skill → 1 条） */
export interface SkillKnowledgeEntry {
  id: string;
  skillId: string;
  title: string;
  summary: string;
  triggerCondition: string;
  inputSpec: string;
  steps: string;
  checkCriteria: string;
  abortCondition: string;
  recoveryMethod: string;
  extractedTermIds: string[];
  attachments: Array<{ type: "table" | "document" | "sql" | "other"; name: string; content?: string }>;
  source: "skill_create" | "external_import";
  crawlChannel?: string;
  crawledAt?: string;
  createdAt: string;
  updatedAt: string;
  versionHistory?: Array<{ at: string; summary: string }>;
}

/** 单条样例问题（与「样例问题清单」一行对应） */
export interface QuestionLabelingRow {
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
}

/** 一次打标任务 */
export interface QuestionLabelingJob {
  id: string;
  name?: string;
  referenceLabels: string[];
  rows: QuestionLabelingRow[];
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  createdByName?: string;
  /** 打标过程累计 prompt token 数（后端回填） */
  totalPromptTokens?: number;
  /** 打标过程累计 completion token 数（后端回填） */
  totalCompletionTokens?: number;
}

export interface DomainData {
  knowledgeSystems: KnowledgeSystemCard[];
  knowledgeDetails: Record<string, KnowledgeSystemDetail>;
  glossaryTerms: GlossaryTerm[];
  pendingGlossaryTerms: PendingGlossaryTerm[];
  exampleQuestions: ExampleQuestion[];
  traceStats: TraceStat;
  traceTrend: TraceTrendPoint[];
  traceRecords: TraceRecord[];
  skillItems: SkillItem[];
  lastSkillSyncAt: string;
  businessMetrics: BusinessMetricSnapshot[];
  metricKnowledgeLinks: MetricKnowledgeLink[];
  dimensionKnowledgeLinks: DimensionKnowledgeLink[];
  pendingMetricSync: string[];
  pendingDimensionSync: string[];
  importedTables: ImportedTable[];
  termKnowledgeLinks: TermKnowledgeLink[];
  qaSkillBindRecords?: QaSkillBindRecord[];
  ontologyLibraries?: OntologyLibrary[];
  ontologyConcepts?: OntologyConcept[];
  ontologyProperties?: OntologyProperty[];
  ontologyRelationTypes?: OntologyRelationType[];
  ontologyRelations?: OntologyRelation[];
  ontologyMappings?: OntologyMapping[];
  operationLogs: OperationLogEntry[];
  modelUsageRecords: ModelUsageEntry[];
  metricQAHistory: MetricQAHistoryEntry[];
  skillKnowledgeEntries: SkillKnowledgeEntry[];
  questionLabelingJobs: QuestionLabelingJob[];
}
