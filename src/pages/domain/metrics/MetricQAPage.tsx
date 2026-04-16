import { DownloadOutlined, EyeOutlined, FileExcelOutlined, FilterOutlined, ReloadOutlined, SendOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Button, Card, Col, Collapse, Drawer, Input, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, Typography, Upload, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { QuestionResultPanel } from "../../../components/domain/metrics/QuestionResultPanel";
import { Text2SQLAdvancedPanel } from "../../../components/domain/metrics/Text2SQLAdvancedPanel";
import type { StructuredIntent, Text2SQLResult } from "../../../components/domain/metrics/Text2SQLAdvancedPanel";
import { authApi, domainApi } from "../../../services/mockApi";
import type {
  BusinessMetricQueryResult,
  BusinessMetricSnapshot,
  MetricQAHistoryEntry,
  MetricsExcelProfile,
  SkillItem,
  SkillKnowledgeEntry,
} from "../../../types/domain";

const standardRecommendedQuestions = [
  "分省新发展用户数",
  "各省公众渠道新发展用户数（去除副卡）",
  "本月全国营收是多少？",
  "华东区域活跃用户趋势如何？",
];

// 高级问数（Text2SQL）优先给出与当前移网经营指标素材一致的示例问句
const advancedRecommendedQuestions = [
  "202512 分省移网新发展用户数",
  "202512 分省移网在网用户数",
  "202512 分省移网新发展在网用户数",
  "202512 分省移网三无用户数",
  "202512 分省移网活跃用户数",
  "202512 各省公众渠道移网新发展用户数（去除副卡）",
];

type RegionFilter = BusinessMetricSnapshot["region"] | "全部";
type PeriodFilter = BusinessMetricSnapshot["period"] | "全部";
type MetricFilter = BusinessMetricSnapshot["metricCode"] | "all";

export function MetricQAPage() {
  const location = useLocation();
  const [qaSessionId] = useState(() => `qa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [region, setRegion] = useState<RegionFilter>("全部");
  const [period, setPeriod] = useState<PeriodFilter>("本月");
  const [metricCode, setMetricCode] = useState<MetricFilter>("all");
  const [result, setResult] = useState<BusinessMetricQueryResult | null>(null);
  const [skillOptions, setSkillOptions] = useState<SkillItem[]>([]);
  const [boundSkillIds, setBoundSkillIds] = useState<string[]>([]);
  const [excelProfile, setExcelProfile] = useState<MetricsExcelProfile | null>(null);
  const [excelProfileLoading, setExcelProfileLoading] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docContent, setDocContent] = useState<string>("");
  const [docLoading, setDocLoading] = useState(false);
  const [skillPreviewOpen, setSkillPreviewOpen] = useState(false);
  const [skillPreviewContent, setSkillPreviewContent] = useState<string>("");
  const [skillPreviewLoading, setSkillPreviewLoading] = useState(false);
  const [queryMeta, setQueryMeta] = useState<{ matchedRule?: boolean; sqlTemplateId?: string; durationMs?: number }>({});
  const [currentHistoryId, setCurrentHistoryId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"ask" | "history">("ask");
  const [historyList, setHistoryList] = useState<MetricQAHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTimeRange, setHistoryTimeRange] = useState<"7d" | "30d">("7d");
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(20);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [historyDetailEntry, setHistoryDetailEntry] = useState<MetricQAHistoryEntry | null>(null);
  const [historyDetailSql, setHistoryDetailSql] = useState("");
  const [historyDetailExecuteResult, setHistoryDetailExecuteResult] = useState<{ outputSpec: { columns: Array<{ key: string; label: string; dataType: string }> }; outputDataRows: Record<string, unknown>[] } | null>(null);
  const [historyDetailExecuteLoading, setHistoryDetailExecuteLoading] = useState(false);

  const [advancedMode, setAdvancedMode] = useState(false);
  const recommendedQuestions = advancedMode ? advancedRecommendedQuestions : standardRecommendedQuestions;
  const [advancedIntent, setAdvancedIntent] = useState<StructuredIntent | null>(null);
  const [advancedSqlResult, setAdvancedSqlResult] = useState<Text2SQLResult | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const autoIngestedCollectionsRef = useRef<Set<string>>(new Set());
  const [boundCollectionStatus, setBoundCollectionStatus] = useState<{ id: string; chunkCount: number } | null>(null);

  useEffect(() => {
    domainApi.getSkillRanking({ page: 1, pageSize: 100 }).then((r) => setSkillOptions(r.list));
  }, []);

  const loadExcelProfile = async () => {
    setExcelProfileLoading(true);
    try {
      const res = await fetch("/api/metrics/excel/profile");
      const data = (await res.json()) as MetricsExcelProfile & { success?: boolean };
      setExcelProfile(data);
    } catch {
      setExcelProfile(null);
    } finally {
      setExcelProfileLoading(false);
    }
  };

  useEffect(() => {
    loadExcelProfile();
  }, []);

  useEffect(() => {
    domainApi.getQaSkillBindBySession(qaSessionId).then((record) => {
      if (record?.skillIds?.length) setBoundSkillIds(record.skillIds);
    });
  }, [qaSessionId]);

  useEffect(() => {
    const loadBoundCollection = async () => {
      if (boundSkillIds.length === 0) {
        setBoundCollectionStatus(null);
        return;
      }
      const systems = await domainApi.getKnowledgeSystems();
      const matched = systems.find((s) => boundSkillIds.includes(s.skillId));
      if (!matched) {
        setBoundCollectionStatus(null);
        return;
      }
      try {
        const statsRes = await fetch(`/api/text2sql/rag/stats/${encodeURIComponent(matched.id)}`);
        const statsData = (await statsRes.json()) as { success?: boolean; chunk_count?: number };
        if (statsRes.ok && statsData.success) {
          setBoundCollectionStatus({ id: matched.id, chunkCount: statsData.chunk_count ?? 0 });
          return;
        }
      } catch {
        // ignore
      }
      setBoundCollectionStatus({ id: matched.id, chunkCount: 0 });
    };
    void loadBoundCollection();
  }, [boundSkillIds]);

  useEffect(() => {
    const bindIds = (location.state as { bindSkillIds?: string[] } | null)?.bindSkillIds;
    if (bindIds?.length) {
      setBoundSkillIds(bindIds);
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state, location.pathname]);

  const loadHistory = async (override?: { page?: number }) => {
    const session = authApi.getSessionSync();
    const operatorId = session?.userId;
    if (!operatorId) {
      setHistoryList([]);
      setHistoryTotal(0);
      return;
    }
    setHistoryLoading(true);
    try {
      const { list, total } = await domainApi.getMetricQAHistory({
        operatorId,
        timeRange: historyTimeRange,
        keyword: historyKeyword.trim() || undefined,
        page: override?.page ?? historyPage,
        pageSize: historyPageSize,
      });
      setHistoryList(list);
      setHistoryTotal(total);
      if (override?.page != null) setHistoryPage(override.page);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") void loadHistory();
  }, [activeTab, historyTimeRange, historyKeyword, historyPage]);

  const askQuestion = async (overrideQuestion?: string) => {
    const finalQuestion = overrideQuestion ?? question;
    if (!finalQuestion.trim() && metricCode === "all") {
      messageApi.warning("请输入问题或选择一个指标");
      return;
    }
    setLoading(true);
    setResult(null);
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    const operatorId = session?.userId;

    if (overrideQuestion?.trim()) {
      domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "引用",
        actionSummary: "引用示例问题发起问数",
        relatedObject: overrideQuestion.trim(),
        operator,
        operatorId,
        status: "成功",
      });
    }

    try {
      let skillKnowledgeContext: string | undefined;
      if (boundSkillIds.length > 0) {
        const entries = await Promise.all(
          boundSkillIds.map((id) => domainApi.getSkillKnowledgeEntryBySkillId(id)),
        );
        const parts = entries
          .filter((e: SkillKnowledgeEntry | null): e is SkillKnowledgeEntry => e != null)
          .map((e) => `【${e.title}】\n${e.summary}\n触发条件：${e.triggerCondition}\n步骤：${e.steps}`);
        if (parts.length > 0) skillKnowledgeContext = parts.join("\n\n");
      }
      const res = await fetch("/api/metrics/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: finalQuestion,
          region,
          period,
          metricCode,
          skillIds: boundSkillIds.length > 0 ? boundSkillIds : undefined,
          skillKnowledgeContext,
          qaSessionId,
          knowledgeVersion: excelProfile?.loaded ? excelProfile.version : undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        result?: BusinessMetricQueryResult;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost: number };
        matchedRule?: boolean;
        sqlTemplateId?: string;
        durationMs?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.success) {
        domainApi.appendOperationLog({
          module: "metrics_qa",
          moduleName: "经营指标问数",
          actionType: "问数",
          actionSummary: `发起问数：${(finalQuestion || "按筛选条件").slice(0, 80)}`,
          relatedObject: finalQuestion.slice(0, 100) || undefined,
          operator,
          operatorId,
          status: "失败",
          failReason: data.error ?? data.detail ?? "请求异常",
        });
        messageApi.error(data.error ?? "问数失败");
        if (data.detail) messageApi.error(data.detail, 3);
        return;
      }
      if (data.result) {
        setResult(data.result);
        setQueryMeta({ matchedRule: data.matchedRule, sqlTemplateId: data.sqlTemplateId, durationMs: data.durationMs });
      }

      const resultSource = data.matchedRule ? "本地样例" : "大模型";
      const boundSkillNames = boundSkillIds.length
        ? skillOptions.filter((s) => boundSkillIds.includes(s.id)).map((s) => s.name).join("、")
        : "";
      const originalSql = data.result?.candidateSqls?.[0] ?? data.result?.generatedSql ?? "";

      const historyEntry = domainApi.saveMetricQAHistory({
        operatorId: operatorId ?? "",
        question: finalQuestion.slice(0, 500),
        boundSkillIds,
        boundSkillNames,
        chainOfThoughtSteps: data.result?.chainOfThoughtSteps ?? [],
        originalSql,
        resultSource,
        operationLogId: "",
      });
      setCurrentHistoryId(historyEntry.id);

      const logEntry = domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "问数",
        actionSummary: `经营指标问数：${finalQuestion.slice(0, 50)}${finalQuestion.length > 50 ? "…" : ""}（结果来源：${resultSource}）`,
        relatedObject: finalQuestion.slice(0, 100) || undefined,
        operator,
        operatorId,
        status: "成功",
        resultSource,
        metricsQAQuestionId: historyEntry.id,
        metricsQABoundSkillNames: boundSkillNames || undefined,
        metricsQASqlEdited: false,
        details:
          data.matchedRule != null || data.durationMs != null
            ? JSON.stringify({ matchedRule: data.matchedRule, durationMs: data.durationMs })
            : undefined,
      });
      domainApi.saveMetricQAHistory({ id: historyEntry.id, operationLogId: logEntry.id } as MetricQAHistoryEntry & { operationLogId: string });

      if (data.usage) {
        domainApi.appendModelUsage({
          operatorId,
          operatorName: operator,
          module: "metrics_qa",
          operationLogId: logEntry.id,
          model: "moonshot-v1-8k",
          requestAt: new Date().toISOString().replace("T", " ").slice(0, 19),
          promptTokens: data.usage.promptTokens,
          completionTokens: data.usage.completionTokens,
          totalTokens: data.usage.totalTokens,
          cost: data.usage.cost,
        });
      }
    } catch (e) {
      domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "问数",
        actionSummary: `发起问数：${(finalQuestion || "按筛选条件").slice(0, 80)}`,
        relatedObject: finalQuestion.slice(0, 100) || undefined,
        operator,
        operatorId,
        status: "失败",
        failReason: e instanceof Error ? e.message : "请求异常",
      });
      messageApi.error(e instanceof Error ? e.message : "问数请求异常");
    } finally {
      setLoading(false);
    }
  };

  const askAdvanced = async (overrideQuestion?: string) => {
    const finalQuestion = overrideQuestion ?? question;
    if (!finalQuestion.trim()) {
      messageApi.warning("高级模式需要输入自然语言问题");
      return;
    }
    setAdvancedLoading(true);
    setAdvancedIntent(null);
    setAdvancedSqlResult(null);
    try {
      const intentRes = await fetch("/api/text2sql/parse-requirement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: finalQuestion, use_llm: true }),
      });
      const intentRaw = await intentRes.text();
      let intentData: { success?: boolean; intent?: StructuredIntent; error?: string; detail?: string };
      try {
        intentData = JSON.parse(intentRaw) as typeof intentData;
      } catch {
        messageApi.error("需求解析服务返回了非 JSON 响应，请检查后端日志");
        return;
      }
      if (!intentRes.ok || !intentData.success || !intentData.intent) {
        messageApi.error(intentData.error ?? intentData.detail ?? "需求解析失败");
        return;
      }
      const intent: StructuredIntent = intentData.intent;
      setAdvancedIntent(intent);

      let skillContext = "";
      let collectionId = "";
      if (boundSkillIds.length > 0) {
        const entries = await Promise.all(
          boundSkillIds.map((id) => domainApi.getSkillKnowledgeEntryBySkillId(id)),
        );
        const parts = entries
          .filter((e: SkillKnowledgeEntry | null): e is SkillKnowledgeEntry => e != null)
          .map((e) => `【${e.title}】\n${e.summary}\n触发条件：${e.triggerCondition}\n步骤：${e.steps}`);
        if (parts.length > 0) skillContext = parts.join("\n\n");

        const systems = await domainApi.getKnowledgeSystems();
        const matched = systems.find((s) => boundSkillIds.includes(s.skillId));
        if (matched) {
          collectionId = matched.id;
          if (!autoIngestedCollectionsRef.current.has(collectionId)) {
            try {
              const statsRes = await fetch(`/api/text2sql/rag/stats/${encodeURIComponent(collectionId)}`);
              const statsData = (await statsRes.json()) as { success?: boolean; chunk_count?: number };
              const chunkCount = statsRes.ok && statsData.success ? (statsData.chunk_count ?? 0) : 0;
              if (chunkCount === 0) {
                await fetch("/api/text2sql/rag/ingest-folder", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    collection_id: collectionId,
                    folder_path: "/Users/anzp/environment/AIData/s1.5 - 副本 (2)",
                  }),
                });
              }
              autoIngestedCollectionsRef.current.add(collectionId);
            } catch {
              // Ignore auto-ingest failures to avoid blocking SQL generation.
            }
          }
        }
      }

      const sqlRes = await fetch("/api/text2sql/generate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          dialect: "hive",
          skill_context: skillContext,
          collection_id: collectionId,
        }),
      });
      const sqlRaw = await sqlRes.text();
      let sqlData: {
        success?: boolean;
        field_mapping?: Text2SQLResult["field_mapping"];
        sql?: string;
        execution_notes?: string;
        chain_of_thought?: string[];
        warnings?: string[];
        matched_skill_rule?: boolean;
        matched_rule_names?: string[];
        fallback_reason?: string | null;
        used_rag_context?: boolean;
        rag_chunks_used?: Text2SQLResult["rag_chunks_used"];
        error?: string;
        detail?: string;
      };
      try {
        sqlData = JSON.parse(sqlRaw) as typeof sqlData;
      } catch {
        messageApi.error("SQL 生成服务返回了非 JSON 响应，请检查后端日志");
        return;
      }
      if (sqlRes.ok && sqlData.success) {
        setAdvancedSqlResult({
          field_mapping: sqlData.field_mapping ?? [],
          sql: sqlData.sql ?? "",
          execution_notes: sqlData.execution_notes ?? "",
          chain_of_thought: sqlData.chain_of_thought ?? [],
          warnings: sqlData.warnings ?? [],
          matched_skill_rule: sqlData.matched_skill_rule ?? false,
          matched_rule_names: sqlData.matched_rule_names ?? [],
          fallback_reason: sqlData.fallback_reason ?? null,
          used_rag_context: sqlData.used_rag_context ?? false,
          rag_chunks_used: sqlData.rag_chunks_used ?? [],
        });
      } else {
        messageApi.error(sqlData.error ?? sqlData.detail ?? "SQL 生成失败");
      }
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "高级模式请求异常");
    } finally {
      setAdvancedLoading(false);
    }
  };

  const unbindAll = () => {
    setBoundSkillIds([]);
    void domainApi.saveQaSkillBindRecord({ qaSessionId, skillIds: [], boundAt: new Date().toISOString() });
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    domainApi.appendOperationLog({
      module: "metrics_qa",
      moduleName: "经营指标问数",
      actionType: "解绑",
      actionSummary: "解绑本次问数会话的全部 Skill",
      operator,
      operatorId: session?.userId,
      status: "成功",
    });
  };
  const saveBind = () => {
    void domainApi.saveQaSkillBindRecord({
      qaSessionId,
      skillIds: boundSkillIds,
      boundAt: new Date().toISOString(),
    });
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    domainApi.appendOperationLog({
      module: "metrics_qa",
      moduleName: "经营指标问数",
      actionType: "绑定",
      actionSummary: `绑定 ${boundSkillIds.length} 个 Skill 至本次问数会话`,
      relatedObject: boundSkillIds.length ? skillOptions.filter((s) => boundSkillIds.includes(s.id)).map((s) => s.name).join("、") : undefined,
      operator,
      operatorId: session?.userId,
      status: "成功",
    });
    messageApi.success("已保存本次绑定的 Skill");
  };

  const handleExcelReload = async () => {
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    setExcelProfileLoading(true);
    try {
      const res = await fetch("/api/metrics/excel/reload", { method: "POST" });
      const data = (await res.json()) as { success?: boolean; error?: string; version?: string; updatedAt?: string };
      if (!res.ok || !data.success) {
        domainApi.appendOperationLog({
          module: "metrics_qa",
          moduleName: "经营指标问数",
          actionType: "导入",
          actionSummary: "按固定路径重载 Excel 知识包",
          operator,
          operatorId: session?.userId,
          status: "失败",
          failReason: data.error ?? "重载失败",
        });
        messageApi.error(data.error ?? "重载失败");
        return;
      }
      domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "导入",
        actionSummary: "按固定路径重载 Excel 知识包",
        relatedObject: data.version,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      messageApi.success("已重载知识包");
      await loadExcelProfile();
    } finally {
      setExcelProfileLoading(false);
    }
  };

  const handleExcelUpload = async (file: File) => {
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    const formData = new FormData();
    formData.append("file", file);
    setExcelProfileLoading(true);
    try {
      const res = await fetch("/api/metrics/excel/upload", { method: "POST", body: formData });
      const data = (await res.json()) as { success?: boolean; error?: string; version?: string };
      if (!res.ok || !data.success) {
        domainApi.appendOperationLog({
          module: "metrics_qa",
          moduleName: "经营指标问数",
          actionType: "导入",
          actionSummary: "上传 Excel 覆盖知识包",
          operator,
          operatorId: session?.userId,
          status: "失败",
          failReason: data.error ?? "上传失败",
        });
        messageApi.error(data.error ?? "上传失败");
        return;
      }
      domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "导入",
        actionSummary: "上传 Excel 覆盖知识包",
        relatedObject: file.name,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      messageApi.success("已上传并加载知识包");
      await loadExcelProfile();
    } finally {
      setExcelProfileLoading(false);
    }
  };

  const openStandardizationDoc = async (download: boolean) => {
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    if (download) {
      window.open("/api/metrics/excel/standardization-doc?download=1", "_blank");
      domainApi.appendOperationLog({
        module: "metrics_qa",
        moduleName: "经营指标问数",
        actionType: "导出",
        actionSummary: "下载《Excel 内容标准化梳理文档》",
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      messageApi.success("已触发下载");
      return;
    }
    setDocModalOpen(true);
    setDocLoading(true);
    try {
      const res = await fetch("/api/metrics/excel/standardization-doc");
      const data = (await res.json()) as { success?: boolean; content?: string; error?: string };
      if (!res.ok || !data.success) {
        messageApi.error(data.error ?? "加载失败");
        setDocModalOpen(false);
        return;
      }
      setDocContent(data.content ?? "");
    } finally {
      setDocLoading(false);
    }
  };

  const buildSkillPreviewContent = (entries: SkillKnowledgeEntry[]) => {
    if (entries.length === 0) return "当前绑定的 Skill 暂无可预览内容。";
    return entries
      .map((e) => {
        const attachments = e.attachments?.length
          ? e.attachments.map((a) => `- [${a.type}] ${a.name}`).join("\n")
          : "- 无";
        return [
          `# ${e.title}`,
          "",
          `- Skill ID: ${e.skillId}`,
          `- 来源: ${e.source}`,
          `- 更新时间: ${e.updatedAt}`,
          "",
          "## 摘要",
          e.summary || "无",
          "",
          "## 触发条件",
          e.triggerCondition || "无",
          "",
          "## 输入规范",
          e.inputSpec || "无",
          "",
          "## 执行步骤",
          e.steps || "无",
          "",
          "## 校验标准",
          e.checkCriteria || "无",
          "",
          "## 中止条件",
          e.abortCondition || "无",
          "",
          "## 恢复方法",
          e.recoveryMethod || "无",
          "",
          "## 附件",
          attachments,
          "",
          "---",
          "",
        ].join("\n");
      })
      .join("\n");
  };

  const handlePreviewSkills = async () => {
    if (boundSkillIds.length === 0) {
      messageApi.warning("请先绑定至少一个 Skill");
      return;
    }
    setSkillPreviewOpen(true);
    setSkillPreviewLoading(true);
    try {
      const entries = await Promise.all(
        boundSkillIds.map((id) => domainApi.getSkillKnowledgeEntryBySkillId(id)),
      );
      const valid = entries.filter((e: SkillKnowledgeEntry | null): e is SkillKnowledgeEntry => e != null);
      setSkillPreviewContent(buildSkillPreviewContent(valid));
    } finally {
      setSkillPreviewLoading(false);
    }
  };

  const handleDownloadSkills = async () => {
    if (boundSkillIds.length === 0) {
      messageApi.warning("请先绑定至少一个 Skill");
      return;
    }
    const entries = await Promise.all(
      boundSkillIds.map((id) => domainApi.getSkillKnowledgeEntryBySkillId(id)),
    );
    const valid = entries.filter((e: SkillKnowledgeEntry | null): e is SkillKnowledgeEntry => e != null);
    const content = buildSkillPreviewContent(valid);
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bound-skills-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    messageApi.success("已下载绑定 Skill 内容");
  };

  return (
    <>
      {contextHolder}
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab((k as "ask" | "history") || "ask")}
        items={[
          {
            key: "ask",
            label: "问数",
            children: (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Card
          title="Excel 数据源"
          size="small"
          loading={excelProfileLoading}
          extra={
            <Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void handleExcelReload()}
                loading={excelProfileLoading}
              >
                重载
              </Button>
              <Upload
                accept=".xlsx,.xls"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleExcelUpload(file);
                  return false;
                }}
              >
                <Button size="small" icon={<FileExcelOutlined />}>
                  上传覆盖
                </Button>
              </Upload>
              <Button size="small" onClick={() => void openStandardizationDoc(false)}>
                标准化梳理文档
              </Button>
              <Button size="small" onClick={() => void openStandardizationDoc(true)}>
                下载文档
              </Button>
            </Space>
          }
        >
          {excelProfile?.loaded ? (
            <Space direction="vertical" size={4}>
              <span>版本：{excelProfile.version ?? "-"}</span>
              <span>更新时间：{excelProfile.updatedAt ?? "-"}</span>
              <span>来源：{excelProfile.sourcePath ?? "固定路径"}</span>
              <span>
                词典 {excelProfile.lexiconCount ?? 0} 条 · 表字段 {excelProfile.dictionaryCount ?? 0} · 关联{" "}
                {excelProfile.relationsCount ?? 0} · SQL 模板 {excelProfile.sqlTemplateCount ?? 0} · 输出样本{" "}
                {excelProfile.outputDataRowCount ?? 0} 行
              </span>
            </Space>
          ) : (
            <span style={{ color: "var(--ant-color-text-secondary)" }}>
              {excelProfile?.message ?? "未加载知识包。请点击「重载」从固定路径加载，或「上传覆盖」上传 Excel。"}
            </span>
          )}
        </Card>

        <Card title="经营指标问数">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <span style={{ marginRight: 8 }}>绑定 Skill（可选）：</span>
              <Select
                mode="multiple"
                placeholder="选择要参与问数约束的 Skill"
                value={boundSkillIds}
                onChange={setBoundSkillIds}
                style={{ minWidth: 320 }}
                options={skillOptions.map((s) => ({ label: s.name, value: s.id }))}
                filterOption={(input, opt) => (opt?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())}
              />
              {boundSkillIds.length > 0 && (
                <Space style={{ marginLeft: 8 }}>
                  <Button size="small" onClick={unbindAll}>解绑全部</Button>
                  <Button size="small" type="primary" onClick={saveBind}>保存绑定</Button>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => void handlePreviewSkills()}>
                    预览
                  </Button>
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => void handleDownloadSkills()}>
                    下载
                  </Button>
                </Space>
              )}
              {boundCollectionStatus && (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  关联知识库：{boundCollectionStatus.id}（RAG 切片 {boundCollectionStatus.chunkCount} 条）
                </Typography.Text>
              )}
            </div>
            <Input.TextArea
              rows={3}
              placeholder="请输入自然语言问题，例如：本月全国营收、ARPU 与活跃用户的变化情况？"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}>
                <Select
                  value={region}
                  style={{ width: "100%" }}
                  options={[
                    { label: "全部区域", value: "全部" },
                    { label: "全国", value: "全国" },
                    { label: "华北", value: "华北" },
                    { label: "华东", value: "华东" },
                    { label: "华南", value: "华南" },
                  ]}
                  onChange={setRegion}
                />
              </Col>
              <Col xs={24} md={8}>
                <Select
                  value={period}
                  style={{ width: "100%" }}
                  options={[
                    { label: "全部周期", value: "全部" },
                    { label: "本月", value: "本月" },
                    { label: "上月", value: "上月" },
                    { label: "本季度", value: "本季度" },
                  ]}
                  onChange={setPeriod}
                />
              </Col>
              <Col xs={24} md={8}>
                <Select
                  value={metricCode}
                  style={{ width: "100%" }}
                  options={[
                    { label: "全部指标", value: "all" },
                    { label: "营收", value: "revenue" },
                    { label: "ARPU", value: "arpu" },
                    { label: "活跃用户", value: "activeUsers" },
                    { label: "投诉率", value: "ticketRate" },
                  ]}
                  onChange={setMetricCode}
                />
              </Col>
            </Row>
            <Space>
              <Button
                type="primary"
                icon={advancedMode ? <ThunderboltOutlined /> : <SendOutlined />}
                loading={advancedMode ? advancedLoading : loading}
                onClick={() => advancedMode ? void askAdvanced() : void askQuestion()}
              >
                {advancedMode ? "高级问数" : "开始问数"}
              </Button>
              <Button
                icon={<FilterOutlined />}
                onClick={() => {
                  setQuestion("");
                  setRegion("全部");
                  setPeriod("本月");
                  setMetricCode("all");
                  setResult(null);
                  setQueryMeta({});
                  setAdvancedIntent(null);
                  setAdvancedSqlResult(null);
                }}
              >
                重置条件
              </Button>
              <Space>
                <Switch
                  checked={advancedMode}
                  onChange={setAdvancedMode}
                  checkedChildren="高级"
                  unCheckedChildren="标准"
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {advancedMode ? "Text2SQL 5 步引擎" : "规则优先 + 大模型兜底"}
                </Typography.Text>
              </Space>
            </Space>

            <Space wrap>
              {recommendedQuestions.map((item) => (
                <Tag
                  color="blue"
                  key={item}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setQuestion(item);
                    advancedMode ? void askAdvanced(item) : void askQuestion(item);
                  }}
                >
                  {item}
                </Tag>
              ))}
            </Space>
          </Space>
        </Card>

        {advancedMode ? (
          <Text2SQLAdvancedPanel intent={advancedIntent} sqlResult={advancedSqlResult} loading={advancedLoading} />
        ) : (
          <QuestionResultPanel result={result} loading={loading} queryMeta={queryMeta} currentHistoryId={currentHistoryId} />
        )}
      </Space>
            ),
          },
          {
            key: "history",
            label: "历史对话",
            children: (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Card title="历史问数记录" extra={
                  <Space>
                    <Select value={historyTimeRange} onChange={setHistoryTimeRange} style={{ width: 100 }} options={[{ label: "近 7 天", value: "7d" }, { label: "近 30 天", value: "30d" }]} />
                    <Input placeholder="搜索提问内容" allowClear style={{ width: 180 }} value={historyKeyword} onChange={(e) => setHistoryKeyword(e.target.value)} onPressEnter={() => void loadHistory({ page: 1 })} />
                    <Button onClick={() => void loadHistory({ page: 1 })}>查询</Button>
                    <Button danger disabled={selectedHistoryIds.length === 0} onClick={() => { const session = authApi.getSessionSync(); const operatorId = session?.userId; if (!operatorId) return; domainApi.deleteMetricQAHistory(selectedHistoryIds, operatorId); setSelectedHistoryIds([]); void loadHistory({ page: 1 }); messageApi.success("已删除选中记录"); }}>批量删除</Button>
                  </Space>
                }>
                  <Table<MetricQAHistoryEntry> rowKey="id" loading={historyLoading}
                    rowSelection={{ selectedRowKeys: selectedHistoryIds, onChange: (keys) => setSelectedHistoryIds(keys as string[]) }}
                    pagination={{ current: historyPage, pageSize: historyPageSize, total: historyTotal, showSizeChanger: false, showTotal: (t) => `共 ${t} 条`, onChange: (p) => { setHistoryPage(p); void loadHistory({ page: p }); } }}
                    dataSource={historyList}
                    columns={[
                      { title: "提问内容", dataIndex: "question", ellipsis: true, render: (q: string) => (q?.slice(0, 80) ?? "") + (q && q.length > 80 ? "…" : "") },
                      { title: "问数时间", dataIndex: "createdAt", width: 170 },
                      { title: "结果来源", dataIndex: "resultSource", width: 100, render: (s: "大模型" | "本地样例") => <Tag color={s === "大模型" ? "blue" : "green"}>{s}</Tag> },
                      { title: "操作", width: 100, render: (_, record) => (
                        <Space>
                          <Button size="small" type="link" onClick={() => { setHistoryDetailEntry(record); setHistoryDetailSql(record.editedSql ?? record.originalSql); setHistoryDetailExecuteResult(record.executeResult ?? null); }}>查看</Button>
                          <Button size="small" type="link" danger onClick={() => { const session = authApi.getSessionSync(); if (!session?.userId) return; domainApi.deleteMetricQAHistory([record.id], session.userId); void loadHistory({ page: historyPage }); messageApi.success("已删除"); }}>删除</Button>
                        </Space>
                      ) },
                    ]}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Excel 内容标准化梳理文档"
        open={docModalOpen}
        onCancel={() => setDocModalOpen(false)}
        footer={<Button onClick={() => setDocModalOpen(false)}>关闭</Button>}
        width={800}
        styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
      >
        {docLoading ? (
          <div style={{ padding: 24, textAlign: "center" }}>加载中…</div>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{docContent}</pre>
        )}
      </Modal>

      <Modal
        title="已绑定 Skill 预览"
        open={skillPreviewOpen}
        onCancel={() => setSkillPreviewOpen(false)}
        footer={<Button onClick={() => setSkillPreviewOpen(false)}>关闭</Button>}
        width={860}
        styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
      >
        {skillPreviewLoading ? (
          <div style={{ padding: 24, textAlign: "center" }}>加载中…</div>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{skillPreviewContent}</pre>
        )}
      </Modal>

      <Drawer
        title="问数记录详情"
        width={640}
        open={historyDetailEntry != null}
        onClose={() => { setHistoryDetailEntry(null); setHistoryDetailExecuteResult(null); }}
        footer={
          historyDetailEntry && (
            <Space>
              <Button type="primary" loading={historyDetailExecuteLoading} onClick={async () => {
                if (!historyDetailEntry || !historyDetailSql.trim()) return;
                setHistoryDetailExecuteLoading(true);
                try {
                  const res = await fetch("/api/metrics/execute-sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: historyDetailSql }) });
                  const data = await res.json();
                  if (!res.ok || !data.success) throw new Error(data.error ?? "执行失败");
                  const result = { outputSpec: data.outputSpec ?? { columns: [] }, outputDataRows: data.outputDataRows ?? [] };
                  setHistoryDetailExecuteResult(result);
                  domainApi.saveMetricQAHistory({ id: historyDetailEntry.id, executeResult: result } as MetricQAHistoryEntry & { executeResult: unknown });
                  messageApi.success("执行成功");
                } catch (e) {
                  messageApi.error(e instanceof Error ? e.message : "执行失败");
                } finally {
                  setHistoryDetailExecuteLoading(false);
                }
              }}>执行 SQL</Button>
              <Button onClick={() => { setHistoryDetailEntry(null); setHistoryDetailExecuteResult(null); }}>关闭</Button>
            </Space>
          )
        }
      >
        {historyDetailEntry && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Typography.Paragraph strong>提问：</Typography.Paragraph>
            <Typography.Paragraph>{historyDetailEntry.question}</Typography.Paragraph>
            <Typography.Text type="secondary">结果来源：</Typography.Text>
            <Tag color={historyDetailEntry.resultSource === "大模型" ? "blue" : "green"}>{historyDetailEntry.resultSource}</Tag>
            {historyDetailEntry.boundSkillNames && <Typography.Text type="secondary">绑定 Skill：{historyDetailEntry.boundSkillNames}</Typography.Text>}
            {historyDetailEntry.chainOfThoughtSteps?.length ? (
              <Collapse items={[{ key: "cot", label: "思维链", children: <ol style={{ margin: 0, paddingLeft: 20 }}>{historyDetailEntry.chainOfThoughtSteps.map((s, i) => <li key={i}>{s}</li>)}</ol> }]} />
            ) : null}
            <Typography.Paragraph strong>原始 SQL：</Typography.Paragraph>
            <pre style={{ background: "#f5f5f5", padding: 8, overflow: "auto", maxHeight: 120 }}>{historyDetailEntry.originalSql}</pre>
            <Typography.Paragraph strong>编辑后 SQL：</Typography.Paragraph>
            <Input.TextArea rows={4} value={historyDetailSql} onChange={(e) => setHistoryDetailSql(e.target.value)} style={{ fontFamily: "monospace" }} />
            {historyDetailExecuteResult && (
              <>
                <Typography.Paragraph strong>执行结果：</Typography.Paragraph>
                <Table size="small" pagination={false} dataSource={historyDetailExecuteResult.outputDataRows} rowKey={(_, i) => String(i)}
                  columns={historyDetailExecuteResult.outputSpec.columns.map((c) => ({ title: c.label, dataIndex: c.key, key: c.key, render: (v: unknown) => (v != null ? String(v) : "—") }))} />
              </>
            )}
          </Space>
        )}
      </Drawer>
    </>
  );
}
