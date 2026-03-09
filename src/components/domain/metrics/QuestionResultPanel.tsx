import { Card, Col, Row, Space, Statistic, Table, Tag, Typography, Button, message, Collapse, Radio, Input } from "antd";
import { DownloadOutlined, FileTextOutlined, PlayCircleOutlined, UndoOutlined, RedoOutlined } from "@ant-design/icons";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState, useEffect, useCallback, useRef } from "react";
import type { BusinessMetricQueryResult } from "../../../types/domain";
import { EmptyState } from "../../common/EmptyState";
import { authApi, domainApi } from "../../../services/mockApi";

interface QuestionResultPanelProps {
  result: BusinessMetricQueryResult | null;
  loading: boolean;
  queryMeta?: { matchedRule?: boolean; sqlTemplateId?: string; durationMs?: number };
  /** 当前轮次对应的历史记录 ID，用于保存修改 / 执行结果回写 */
  currentHistoryId?: string;
}

export function QuestionResultPanel({ result, loading, queryMeta, currentHistoryId }: QuestionResultPanelProps) {
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [editedSql, setEditedSql] = useState("");
  const [executeResult, setExecuteResult] = useState<{ outputSpec: { columns: Array<{ key: string; label: string; dataType: string }> }; outputDataRows: Record<string, unknown>[] } | null>(null);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [sqlHistoryStack, setSqlHistoryStack] = useState<string[]>([]);
  const [sqlHistoryIndex, setSqlHistoryIndex] = useState(-1);
  const sqlHistoryIndexRef = useRef(-1);
  useEffect(() => {
    sqlHistoryIndexRef.current = sqlHistoryIndex;
  }, [sqlHistoryIndex]);

  const originalSql = result?.candidateSqls?.[selectedCandidateIndex] ?? result?.generatedSql ?? "";
  const sqlValidationError = (() => {
    const s = editedSql.trim().toUpperCase();
    if (!s) return null;
    if (!s.startsWith("SELECT")) return "仅支持 SELECT 查询";
    const forbidden = ["DROP", "INSERT", "UPDATE", "DELETE", "ALTER", "CREATE", "TRUNCATE"];
    if (forbidden.some((w) => s.includes(w))) return "禁止使用写操作或 DDL 语句";
    return null;
  })();

  useEffect(() => {
    setSelectedCandidateIndex(0);
  }, [result]);

  useEffect(() => {
    const defaultSql = result?.candidateSqls?.[selectedCandidateIndex] ?? result?.generatedSql ?? "";
    setEditedSql(defaultSql);
    setSqlHistoryStack([defaultSql]);
    setSqlHistoryIndex(0);
  }, [result, selectedCandidateIndex]);

  const pushSqlHistory = useCallback((sql: string) => {
    setSqlHistoryStack((prev) => {
      const idx = sqlHistoryIndexRef.current;
      const next = [...prev.slice(0, idx + 1), sql].slice(-20);
      setSqlHistoryIndex(next.length - 1);
      return next;
    });
  }, []);

  const handleFormat = useCallback(() => {
    const s = editedSql.replace(/\s+/g, " ").replace(/\s*(SELECT|FROM|WHERE|AND|OR|GROUP BY|ORDER BY|LEFT JOIN|INNER JOIN|JOIN|ON|AS)\s+/gi, "\n$1 ").trim();
    setEditedSql(s);
    pushSqlHistory(s);
  }, [editedSql, pushSqlHistory]);

  const handleResetSql = useCallback(() => {
    setEditedSql(originalSql);
    pushSqlHistory(originalSql);
    message.success("已重置为原 SQL");
  }, [originalSql, pushSqlHistory]);

  const handleSaveEditedSql = useCallback(() => {
    if (!currentHistoryId) {
      message.warning("当前无关联问数记录，无法保存修改");
      return;
    }
    domainApi.saveMetricQAHistory({ id: currentHistoryId, editedSql });
    message.success("已保存修改后的 SQL");
  }, [currentHistoryId, editedSql]);

  if (!result && !loading) {
    return (
      <Card title="问数结果">
        <EmptyState description="请输入问题或筛选条件后点击“开始问数”" />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card
        loading={loading}
        title="问数结果"
        extra={
          result && (
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={async () => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  try {
                    const isExcelReplay = result.resultFormat === "excel_replay" && result.outputSpec && result.outputDataRows;
                    const columns = isExcelReplay
                      ? result.outputSpec!.columns.map((c) => c.key)
                      : ["metricName", "region", "period", "value", "unit", "trend", "description"];
                    const rows = isExcelReplay
                      ? result.outputDataRows!
                      : (result.metrics ?? []).map((m) => ({
                          metricName: m.metricName,
                          region: m.region,
                          period: m.period,
                          value: m.value,
                          unit: m.unit,
                          trend: m.trend,
                          description: m.description,
                        }));
                    const res = await fetch("/api/metrics/export", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ format: "excel", columns, rows }),
                    });
                    if (!res.ok) throw new Error("导出失败");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "metrics.xlsx";
                    a.click();
                    URL.revokeObjectURL(url);
                    domainApi.appendOperationLog({
                      module: "metrics_qa",
                      moduleName: "经营指标问数",
                      actionType: "导出",
                      actionSummary: "导出问数结果为 Excel",
                      relatedObject: `共 ${rows.length} 条`,
                      operator,
                      operatorId: session?.userId,
                      status: "成功",
                    });
                    message.success("已导出 Excel");
                  } catch (e) {
                    domainApi.appendOperationLog({
                      module: "metrics_qa",
                      moduleName: "经营指标问数",
                      actionType: "导出",
                      actionSummary: "导出问数结果为 Excel",
                      operator,
                      operatorId: session?.userId,
                      status: "失败",
                      failReason: e instanceof Error ? e.message : "导出失败",
                    });
                    message.error(e instanceof Error ? e.message : "导出失败");
                  }
                }}
              >
                导出 Excel
              </Button>
              <Button
                size="small"
                icon={<FileTextOutlined />}
                onClick={() => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  const title = "根因分析报告";
                  const sections = [
                    { type: "metrics", title: "指标概览", content: (result.metrics ?? []).map((m) => `${m.metricName}：${m.value}${m.unit}（${m.trend >= 0 ? "↑" : "↓"} ${Math.abs(m.trend)}%）`).join("\n") },
                    { type: "trend", title: "趋势", content: (result.trend ?? []).map((p) => `${p.period}: ${p.value}`).join("\n") },
                    { type: "conclusion", title: "结论", content: result.resolvedIntent ?? "" },
                  ];
                  fetch("/api/reports/export", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ format: "markdown", title, sections }),
                  })
                    .then((r) => {
                      if (!r.ok) throw new Error("导出失败");
                      return r.blob();
                    })
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "report.md";
                      a.click();
                      URL.revokeObjectURL(url);
                      domainApi.appendOperationLog({
                        module: "metrics_qa",
                        moduleName: "经营指标问数",
                        actionType: "导出",
                        actionSummary: "导出根因分析报告",
                        relatedObject: title,
                        operator,
                        operatorId: session?.userId,
                        status: "成功",
                      });
                      message.success("已导出报告");
                    })
                    .catch((e) => {
                      domainApi.appendOperationLog({
                        module: "metrics_qa",
                        moduleName: "经营指标问数",
                        actionType: "导出",
                        actionSummary: "导出根因分析报告",
                        operator,
                        operatorId: session?.userId,
                        status: "失败",
                        failReason: e instanceof Error ? e.message : "导出失败",
                      });
                      message.error(e instanceof Error ? e.message : "导出失败");
                    });
                }}
              >
                导出报告
              </Button>
            </Space>
          )
        }
      >
        {(queryMeta?.matchedRule ?? false) && (
          <Space style={{ marginBottom: 8 }}>
            <Tag color="green">规则命中</Tag>
            {queryMeta?.sqlTemplateId != null && <Tag>SQL 模板：{queryMeta.sqlTemplateId}</Tag>}
            {queryMeta?.durationMs != null && <Typography.Text type="secondary">耗时 {queryMeta.durationMs} ms</Typography.Text>}
          </Space>
        )}
        <Typography.Paragraph>{result?.resolvedIntent}</Typography.Paragraph>
        {result?.appliedSkills?.length ? (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            本次应用的 Skill：{result.appliedSkills.map((s) => s.name).join("、")}
          </Typography.Text>
        ) : null}
        {result?.ruleTrace ? (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            {result.ruleTrace}
          </Typography.Text>
        ) : null}
        <Row gutter={[12, 12]}>
          {(result?.metrics ?? []).map((item) => (
            <Col xs={24} md={12} xl={6} key={item.id}>
              <Card className="zy-card-hover">
                <Statistic
                  title={`${item.metricName} (${item.region}-${item.period})`}
                  value={item.value}
                  suffix={item.unit}
                />
                <Tag color={item.trend >= 0 ? "success" : "error"} style={{ marginTop: 8 }}>
                  {item.trend >= 0 ? "↑" : "↓"} {Math.abs(item.trend)}%
                </Tag>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={10}>
          <Card title="趋势预估" loading={loading}>
            <div style={{ height: 260 }}>
              {(result?.trend ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={result?.trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="zy-empty-wrap">
                  <Typography.Text type="secondary">暂无趋势数据</Typography.Text>
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="明细结果" loading={loading}>
            {result?.resultFormat === "excel_replay" && result.outputSpec && result.outputDataRows ? (
              <Table
                rowKey={(_, i) => String(i)}
                pagination={false}
                dataSource={result.outputDataRows}
                locale={{ emptyText: "暂无明细数据" }}
                columns={result.outputSpec.columns.map((c) => ({
                  title: c.label,
                  dataIndex: c.key,
                  key: c.key,
                  width: c.dataType === "number" ? 120 : undefined,
                  render: (v: unknown) => (v != null ? String(v) : "—"),
                }))}
              />
            ) : (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={result?.metrics ?? []}
                locale={{ emptyText: "暂无明细数据" }}
                columns={[
                  { title: "指标", dataIndex: "metricName", width: 120 },
                  { title: "区域", dataIndex: "region", width: 90 },
                  { title: "周期", dataIndex: "period", width: 90 },
                  {
                    title: "值",
                    key: "value",
                    render: (_, row) => `${row.value}${row.unit}`,
                  },
                  { title: "说明", dataIndex: "description", ellipsis: true },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>

      {result?.chainOfThoughtSteps != null && result.chainOfThoughtSteps.length > 0 ? (
        <div style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 8, marginBottom: 12 }}>
          <Collapse
            defaultActiveKey={["cot"]}
            items={[
              {
                key: "cot",
                label: "思维链推理步骤",
                children: (
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {result.chainOfThoughtSteps.map((step, i) => {
                      const stepLabel = /^步骤\s*\d+[：:]/.test(step.trim()) ? step.trim() : `步骤 ${i + 1}：${step.trim()}`;
                      return (
                        <li key={i} style={{ marginBottom: 4 }}>
                          <Typography.Text>{stepLabel}</Typography.Text>
                        </li>
                      );
                    })}
                  </ol>
                ),
              },
            ]}
          />
        </div>
      ) : null}

      <Card title="SQL 生成结果" loading={loading}>
        {result?.candidateSqls != null && result.candidateSqls.length > 1 ? (
          <Space direction="vertical" style={{ width: "100%", marginBottom: 8 }}>
            <Typography.Text strong>候选 SQL（选择一条）：</Typography.Text>
            <Radio.Group
              value={selectedCandidateIndex}
              onChange={(e) => setSelectedCandidateIndex(e.target.value)}
              options={result.candidateSqls.map((_, i) => ({
                label: `候选 ${i + 1}`,
                value: i,
              }))}
            />
          </Space>
        ) : null}
        <Space style={{ marginBottom: 8 }} wrap>
          <Button size="small" onClick={handleFormat}>
            格式化
          </Button>
          <Button
            size="small"
            icon={<UndoOutlined />}
            disabled={sqlHistoryIndex <= 0}
            onClick={() => {
              if (sqlHistoryIndex <= 0) return;
              const nextIndex = sqlHistoryIndex - 1;
              setSqlHistoryIndex(nextIndex);
              setEditedSql(sqlHistoryStack[nextIndex] ?? "");
            }}
          >
            撤销
          </Button>
          <Button
            size="small"
            icon={<RedoOutlined />}
            disabled={sqlHistoryIndex >= sqlHistoryStack.length - 1 || sqlHistoryStack.length === 0}
            onClick={() => {
              if (sqlHistoryIndex >= sqlHistoryStack.length - 1) return;
              const nextIndex = sqlHistoryIndex + 1;
              setSqlHistoryIndex(nextIndex);
              setEditedSql(sqlHistoryStack[nextIndex] ?? "");
            }}
          >
            重做
          </Button>
          <Button size="small" onClick={handleResetSql}>
            重置为原 SQL
          </Button>
          <Button size="small" onClick={handleSaveEditedSql}>
            保存修改
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={executeLoading}
            disabled={!editedSql.trim()}
            onClick={async () => {
              setExecuteLoading(true);
              setExecuteResult(null);
              const session = authApi.getSessionSync();
              const operator = session?.displayName ?? session?.username ?? "未登录";
              try {
                const res = await fetch("/api/metrics/execute-sql", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sql: editedSql }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) {
                  throw new Error(data.error ?? "执行失败");
                }
                setExecuteResult({
                  outputSpec: data.outputSpec ?? { columns: [] },
                  outputDataRows: data.outputDataRows ?? [],
                });
                if (currentHistoryId) {
                  domainApi.saveMetricQAHistory({
                    id: currentHistoryId,
                    executeResult: {
                      outputSpec: data.outputSpec ?? { columns: [] },
                      outputDataRows: data.outputDataRows ?? [],
                    },
                  });
                }
                domainApi.appendOperationLog({
                  module: "metrics_qa",
                  moduleName: "经营指标问数",
                  actionType: "问数",
                  actionSummary: "SQL 编辑后执行",
                  relatedObject: editedSql.slice(0, 80),
                  operator,
                  operatorId: session?.userId,
                  status: "成功",
                  metricsQAQuestionId: currentHistoryId,
                  metricsQASqlEdited: true,
                });
                message.success("执行成功");
              } catch (e) {
                const text = e instanceof Error ? e.message : "执行失败";
                domainApi.appendOperationLog({
                  module: "metrics_qa",
                  moduleName: "经营指标问数",
                  actionType: "问数",
                  actionSummary: "SQL 编辑后执行",
                  operator,
                  operatorId: session?.userId,
                  status: "失败",
                  failReason: text,
                });
                message.error(text);
              } finally {
                setExecuteLoading(false);
              }
            }}
          >
            执行
          </Button>
        </Space>
        <Input.TextArea
          value={editedSql}
          onChange={(e) => setEditedSql(e.target.value)}
          placeholder="可编辑 SQL，仅支持 SELECT"
          rows={6}
          style={{
            fontFamily: "monospace",
            marginBottom: 8,
            borderColor: sqlValidationError ? "var(--ant-color-error)" : undefined,
          }}
          status={sqlValidationError ? "error" : undefined}
        />
        {sqlValidationError && (
          <Typography.Text type="danger" style={{ display: "block", marginBottom: 8 }}>
            {sqlValidationError}
          </Typography.Text>
        )}
        <Typography.Paragraph copyable={{ text: editedSql }}>
          <Typography.Text type="secondary">复制 SQL</Typography.Text>
        </Typography.Paragraph>
        <Typography.Text type="secondary">{result?.explanation}</Typography.Text>
        {executeResult && (
          <div style={{ marginTop: 12 }}>
            <Typography.Text strong>执行结果：</Typography.Text>
            <Table
              size="small"
              rowKey={(_, i) => String(i)}
              style={{ marginTop: 8 }}
              pagination={false}
              dataSource={executeResult.outputDataRows}
              columns={executeResult.outputSpec.columns.map((c) => ({
                title: c.label,
                dataIndex: c.key,
                key: c.key,
                width: c.dataType === "number" ? 120 : undefined,
                render: (v: unknown) => (v != null ? String(v) : "—"),
              }))}
            />
          </div>
        )}
      </Card>
    </Space>
  );
}
