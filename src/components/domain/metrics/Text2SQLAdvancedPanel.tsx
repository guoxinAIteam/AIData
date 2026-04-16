import { Card, Collapse, Select, Space, Table, Tag, Typography, Button, Input, message } from "antd";
import { PlayCircleOutlined, SwapOutlined } from "@ant-design/icons";
import { useState } from "react";

export interface FieldMapping {
  field_name: string;
  metric_source: string;
  calculation_logic: string;
}

export interface Text2SQLResult {
  field_mapping: FieldMapping[];
  sql: string;
  execution_notes: string;
  chain_of_thought: string[];
  warnings: string[];
  matched_skill_rule?: boolean;
  matched_rule_names?: string[];
  fallback_reason?: string | null;
  used_rag_context?: boolean;
  rag_chunks_used?: Array<{
    id?: string;
    text: string;
    score?: number;
    metadata?: { source_file?: string; section_title?: string; sheet_name?: string };
  }>;
}

export interface StructuredIntent {
  target_metrics: string[];
  dimensions: string[];
  filters: { include: string[]; exclude: string[] };
  period: string;
  period_param: string;
  source_table: string;
  notes: string[];
}

interface Text2SQLAdvancedPanelProps {
  intent: StructuredIntent | null;
  sqlResult: Text2SQLResult | null;
  loading: boolean;
}

const DIALECT_OPTIONS = [
  { label: "Hive", value: "hive" },
  { label: "MaxCompute", value: "maxcompute" },
  { label: "SparkSQL", value: "spark" },
  { label: "MySQL", value: "mysql" },
  { label: "PostgreSQL", value: "postgres" },
];

export function Text2SQLAdvancedPanel({ intent, sqlResult, loading }: Text2SQLAdvancedPanelProps) {
  const [dialect, setDialect] = useState("hive");
  const [convertedSql, setConvertedSql] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [validationResult, setValidationResult] = useState<{ success: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [validating, setValidating] = useState(false);

  const currentSql = convertedSql ?? sqlResult?.sql ?? "";

  const handleConvertDialect = async (targetDialect: string) => {
    if (!sqlResult?.sql) return;
    setConverting(true);
    try {
      const res = await fetch("/api/text2sql/convert-dialect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: sqlResult.sql,
          source_dialect: "hive",
          target_dialect: targetDialect,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConvertedSql(data.sql);
        setDialect(targetDialect);
      } else {
        message.error(data.error ?? "方言转换失败");
      }
    } catch {
      message.error("方言转换服务不可用");
    } finally {
      setConverting(false);
    }
  };

  const handleValidate = async () => {
    if (!currentSql) return;
    setValidating(true);
    try {
      const res = await fetch("/api/text2sql/validate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: currentSql, dialect }),
      });
      const data = await res.json();
      setValidationResult({ success: data.success, errors: data.errors ?? [], warnings: data.warnings ?? [] });
    } catch {
      message.error("SQL 校验服务不可用");
    } finally {
      setValidating(false);
    }
  };

  if (!intent && !sqlResult && !loading) return null;

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {intent && (
        <Card title="结构化取数意图" size="small" loading={loading}>
          <Space wrap style={{ marginBottom: 8 }}>
            {intent.target_metrics.map((m, i) => (
              <Tag color="blue" key={i}>{m}</Tag>
            ))}
          </Space>
          <Space wrap style={{ marginBottom: 8 }}>
            {intent.dimensions.map((d, i) => (
              <Tag color="cyan" key={i}>维度: {d}</Tag>
            ))}
            {intent.period && <Tag color="orange">账期: {intent.period}</Tag>}
          </Space>
          {(intent.filters.exclude.length > 0 || intent.filters.include.length > 0) && (
            <div style={{ marginBottom: 8 }}>
              {intent.filters.include.map((f, i) => (
                <Tag color="green" key={`in-${i}`}>包含: {f}</Tag>
              ))}
              {intent.filters.exclude.map((f, i) => (
                <Tag color="red" key={`ex-${i}`}>排除: {f}</Tag>
              ))}
            </div>
          )}
          {intent.notes.length > 0 && (
            <Typography.Text type="secondary">{intent.notes.join("；")}</Typography.Text>
          )}
        </Card>
      )}

      {sqlResult && sqlResult.field_mapping.length > 0 && (
        <Card title="字段对照表" size="small">
          <Table
            size="small"
            pagination={false}
            dataSource={sqlResult.field_mapping}
            rowKey={(_, i) => String(i)}
            columns={[
              { title: "需求列名称", dataIndex: "field_name", width: 180 },
              { title: "口径来源", dataIndex: "metric_source", width: 200 },
              { title: "关联字段/计算逻辑", dataIndex: "calculation_logic" },
            ]}
          />
        </Card>
      )}

      {sqlResult && (
        <Card title="Skill 命中状态" size="small">
          <Space wrap>
            <Tag color={sqlResult.matched_skill_rule ? "success" : "default"}>
              {sqlResult.matched_skill_rule ? "已命中 Skill 规则" : "未命中 Skill 规则"}
            </Tag>
            {(sqlResult.matched_rule_names ?? []).map((name) => (
              <Tag color="blue" key={name}>
                {name}
              </Tag>
            ))}
          </Space>
          {!sqlResult.matched_skill_rule && sqlResult.fallback_reason ? (
            <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              回退原因：{sqlResult.fallback_reason}
            </Typography.Text>
          ) : null}
        </Card>
      )}

      {sqlResult && (
        <Card title="RAG 检索命中" size="small">
          <Space wrap style={{ marginBottom: 8 }}>
            <Tag color={sqlResult.used_rag_context ? "success" : "default"}>
              {sqlResult.used_rag_context ? "RAG-first 生效" : "使用 meta 兜底"}
            </Tag>
            <Tag>命中切片：{sqlResult.rag_chunks_used?.length ?? 0}</Tag>
          </Space>
          {(sqlResult.rag_chunks_used ?? []).length > 0 ? (
            <Collapse
              size="small"
              items={(sqlResult.rag_chunks_used ?? []).map((chunk, i) => ({
                key: `${chunk.id ?? i}`,
                label: `${chunk.metadata?.source_file ?? "unknown"} ${chunk.score != null ? `(score=${chunk.score.toFixed(4)})` : ""}`,
                children: (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {chunk.text}
                  </Typography.Paragraph>
                ),
              }))}
            />
          ) : (
            <Typography.Text type="secondary">当前问题未命中向量切片，已回退到 meta 文件上下文。</Typography.Text>
          )}
        </Card>
      )}

      {sqlResult && sqlResult.chain_of_thought.length > 0 && (
        <Collapse
          defaultActiveKey={["steps"]}
          items={[{
            key: "steps",
            label: "5 步推理过程",
            children: (
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {sqlResult.chain_of_thought.map((step, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <Typography.Text>{step}</Typography.Text>
                  </li>
                ))}
              </ol>
            ),
          }]}
        />
      )}

      {sqlResult?.sql && (
        <Card
          title="生成 SQL"
          size="small"
          extra={
            <Space>
              <Select
                size="small"
                value={dialect}
                options={DIALECT_OPTIONS}
                style={{ width: 130 }}
                onChange={(v) => void handleConvertDialect(v)}
                loading={converting}
              />
              <Button size="small" icon={<SwapOutlined />} loading={converting} onClick={() => void handleConvertDialect(dialect)}>
                转换方言
              </Button>
              <Button size="small" icon={<PlayCircleOutlined />} loading={validating} onClick={() => void handleValidate()}>
                校验 SQL
              </Button>
            </Space>
          }
        >
          <Input.TextArea
            value={currentSql}
            readOnly
            rows={10}
            style={{ fontFamily: "monospace", marginBottom: 8 }}
          />
          {validationResult && (
            <div style={{ marginBottom: 8 }}>
              {validationResult.success ? (
                <Tag color="success">校验通过</Tag>
              ) : (
                validationResult.errors.map((e, i) => <Tag color="error" key={i}>{e}</Tag>)
              )}
              {validationResult.warnings.map((w, i) => <Tag color="warning" key={`w-${i}`}>{w}</Tag>)}
            </div>
          )}
          {sqlResult.execution_notes && (
            <Collapse
              size="small"
              items={[{
                key: "notes",
                label: "执行说明",
                children: <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sqlResult.execution_notes}</Typography.Paragraph>,
              }]}
            />
          )}
        </Card>
      )}

      {sqlResult && sqlResult.warnings.length > 0 && (
        <Card size="small" title="注意事项">
          {sqlResult.warnings.map((w, i) => (
            <Tag color="warning" key={i} style={{ marginBottom: 4 }}>{w}</Tag>
          ))}
        </Card>
      )}
    </Space>
  );
}
