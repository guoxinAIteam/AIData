import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Collapse,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { authApi, domainApi } from "../../../services/mockApi";
import type {
  DataSourceConfig,
  DatasetItem,
  KnowledgeCollection,
  TreeNode,
  UploadRecord,
} from "../../../types/domain";

interface KnowledgeDatasetTabProps {
  systemId: string;
  uploadRecords: UploadRecord[];
  dataSource: DataSourceConfig;
  knowledgeCollection?: KnowledgeCollection | null;
  treeData: TreeNode[];
  datasets: DatasetItem[];
  onSaved?: () => void;
  isCreator?: boolean;
}

export function KnowledgeDatasetTab({
  systemId,
  uploadRecords,
  dataSource,
  knowledgeCollection,
  treeData: _treeData,
  datasets: _datasets,
  onSaved,
  isCreator = true,
}: KnowledgeDatasetTabProps) {
  const [detailRecord, setDetailRecord] = useState<UploadRecord | null>(null);
  const [uploadTableOpen, setUploadTableOpen] = useState(false);
  const [syncExcelOpen, setSyncExcelOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<{ name: string; tableName: string; fieldsText: string; relationsText: string }>();
  const session = authApi.getSessionSync();

  const docsByRef = useMemo(() => {
    const map: Record<string, { content?: string; name: string }> = {};
    (dataSource.uploadedDocuments ?? []).forEach((d) => {
      map[d.id] = { content: d.content, name: d.name };
    });
    return map;
  }, [dataSource.uploadedDocuments]);

  const tables = knowledgeCollection?.tables ?? [];
  const hasSummary =
    (knowledgeCollection?.refinedSummary?.trim() || knowledgeCollection?.requirementText?.trim()) ?? false;
  const hasUsage = (knowledgeCollection?.tableUsageDescriptions?.trim() ?? "") !== "";

  const handleDeleteRecord = async (record: UploadRecord) => {
    if (!session?.userId) return;
    try {
      await domainApi.removeUploadRecord(systemId, record.id, session.userId);
      messageApi.success("已删除");
      onSaved?.();
      if (detailRecord?.id === record.id) setDetailRecord(null);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const handleUploadTableStructure = async () => {
    try {
      const values = await form.validateFields();
      const fieldsText = (values.fieldsText ?? "").trim();
      const fieldLines = fieldsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const fields = fieldLines.map((line) => {
        const parts = line.split(/\s+/);
        return {
          name: parts[0] ?? "field",
          type: parts[1],
          comment: parts.slice(2).join(" ") || undefined,
        };
      });
      if (fields.length === 0) {
        messageApi.warning("请至少填写一个字段（每行：字段名 类型 注释）");
        return;
      }
      setUploading(true);
      await domainApi.uploadTableStructure(
        systemId,
        {
          name: values.name || values.tableName,
          tableName: values.tableName,
          fields,
          relations: (values.relationsText ?? "")
            .trim()
            .split(/[;\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
        session?.userId,
      );
      messageApi.success("表结构已上传并更新知识集合");
      form.resetFields();
      setUploadTableOpen(false);
      onSaved?.();
    } catch (e) {
      if (e instanceof Error && !e.message.includes("知识库不存在")) {
        messageApi.error(e.message || "上传失败");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSyncFromExcel = async (file: File) => {
    const session = authApi.getSessionSync();
    if (!session?.userId) return false;
    setSyncing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/knowledge/parse-excel", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.error || "解析失败");
      }
      await domainApi.syncKnowledgeFromParsedExcel(
        systemId,
        {
          knowledgeCollection: data.knowledgeCollection,
          metrics: data.metrics,
          dimensions: data.dimensions,
        },
        session.userId,
      );
      messageApi.success("已从 Excel 同步知识集合、指标与维度");
      setSyncExcelOpen(false);
      onSaved?.();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "同步失败");
    } finally {
      setSyncing(false);
    }
    return false;
  };

  return (
    <>
      {contextHolder}
      <Card
        title="知识集合"
        extra={
          isCreator ? (
            <Space>
              <Button icon={<UploadOutlined />} onClick={() => setSyncExcelOpen(true)}>
                从 Excel 同步
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadTableOpen(true)}>
                上传表结构
              </Button>
            </Space>
          ) : null
        }
      >
        {(hasSummary || hasUsage || tables.length > 0) ? (
          <Collapse
            defaultActiveKey={["summary", "tables", "usage"].filter(
              (k) =>
                (k === "summary" && hasSummary) ||
                (k === "tables" && tables.length > 0) ||
                (k === "usage" && hasUsage),
            )}
            items={[
              hasSummary && {
                key: "summary",
                label: "内容提炼",
                children: (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {knowledgeCollection?.refinedSummary || knowledgeCollection?.requirementText || "—"}
                  </Typography.Paragraph>
                ),
              },
              tables.length > 0 && {
                key: "tables",
                label: `表结构（${tables.length} 张表）`,
                children: (
                  <div>
                    {tables.map((tbl, idx) => (
                      <div key={idx} style={{ marginBottom: idx < tables.length - 1 ? 16 : 0 }}>
                        <Typography.Text strong>{tbl.tableName}</Typography.Text>
                        <Table<{ name: string; type?: string; comment?: string }>
                          size="small"
                          dataSource={tbl.fields.map((f, i) => ({ ...f, key: i }))}
                          columns={[
                            { title: "字段名", dataIndex: "name", key: "name" },
                            { title: "类型", dataIndex: "type", key: "type", width: 100 },
                            { title: "注释", dataIndex: "comment", key: "comment" },
                          ]}
                          pagination={false}
                          style={{ marginTop: 8 }}
                        />
                        {tbl.relations && tbl.relations.length > 0 && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            关联：{tbl.relations.join("；")}
                          </Typography.Text>
                        )}
                      </div>
                    ))}
                  </div>
                ),
              },
              hasUsage && {
                key: "usage",
                label: "表使用说明",
                children: (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                    {knowledgeCollection?.tableUsageDescriptions}
                  </Typography.Paragraph>
                ),
              },
            ].filter(Boolean) as { key: string; label: string; children: ReactNode }[]}
          />
        ) : (
          <Typography.Text type="secondary">
            暂无知识集合内容，可从 Skill 上传 Excel 后自动提炼，或通过「上传表结构」动态添加。
          </Typography.Text>
        )}
      </Card>

      <Card title="上传记录" style={{ marginTop: 16 }}>
        <Table<UploadRecord>
          rowKey="id"
          dataSource={uploadRecords}
          size="small"
          columns={[
            { title: "名称", dataIndex: "name", key: "name", ellipsis: true },
            {
              title: "类型",
              dataIndex: "type",
              key: "type",
              width: 100,
              render: (t: string) => (t === "document" ? "文档" : "表结构"),
            },
            { title: "上传时间", dataIndex: "uploadedAt", key: "uploadedAt", width: 160 },
            { title: "上传人", dataIndex: "uploaderName", key: "uploaderName", width: 100 },
            {
              title: "关联数据源",
              key: "dataSourceId",
              width: 100,
              render: () => dataSource.name ?? systemId,
            },
            { title: "关联 Skill", dataIndex: "skillId", key: "skillId", width: 100, ellipsis: true },
            {
              title: "操作",
              key: "action",
              width: 140,
              render: (_, record) => (
                <Space>
                  <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
                    查看详情
                  </Button>
                  {record.uploaderId != null && record.uploaderId === session?.userId ? (
                    <Popconfirm title="确认删除？" onConfirm={() => handleDeleteRecord(record)}>
                      <Button type="link" size="small" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  ) : null}
                </Space>
              ),
            },
          ]}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: "暂无上传记录（在源数据管理中上传文档或上传表结构后会自动生成）" }}
        />
      </Card>

      <Modal
        title={detailRecord?.name ?? "上传记录详情"}
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <>
            <Typography.Paragraph>
              <strong>类型：</strong>
              {detailRecord.type === "document" ? "文档" : "表结构"}
            </Typography.Paragraph>
            <Typography.Paragraph>
              <strong>上传时间：</strong>
              {detailRecord.uploadedAt}
            </Typography.Paragraph>
            <Typography.Paragraph>
              <strong>上传人：</strong>
              {detailRecord.uploaderName ?? "—"}
            </Typography.Paragraph>
            {detailRecord.type === "document" && detailRecord.documentRef && (
              <Typography.Paragraph>
                <strong>内容预览：</strong>
              </Typography.Paragraph>
            )}
            {detailRecord.type === "document" && detailRecord.documentRef && (
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>
                {docsByRef[detailRecord.documentRef]?.content ?? "（无法解析内容）"}
              </Typography.Paragraph>
            )}
            {detailRecord.type === "table_structure" && detailRecord.tableStructure && (
              <>
                <Typography.Paragraph>
                  <strong>字段：</strong>
                </Typography.Paragraph>
                <Table
                  size="small"
                  dataSource={detailRecord.tableStructure.fields.map((f, i) => ({ key: i, ...f }))}
                  columns={[
                    { title: "字段名", dataIndex: "name", key: "name" },
                    { title: "类型", dataIndex: "type", key: "type" },
                    { title: "注释", dataIndex: "comment", key: "comment" },
                  ]}
                  pagination={false}
                />
                {detailRecord.tableStructure.relations && detailRecord.tableStructure.relations.length > 0 && (
                  <Typography.Paragraph style={{ marginTop: 12 }}>
                    <strong>关联：</strong>
                    {detailRecord.tableStructure.relations.join("；")}
                  </Typography.Paragraph>
                )}
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        title="上传表结构"
        open={uploadTableOpen}
        onCancel={() => {
          setUploadTableOpen(false);
          form.resetFields();
        }}
        onOk={() => void handleUploadTableStructure()}
        confirmLoading={uploading}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="展示名称" rules={[{ required: true, message: "请输入展示名称" }]}>
            <Input placeholder="如：用户表结构" />
          </Form.Item>
          <Form.Item name="tableName" label="表名" rules={[{ required: true, message: "请输入表名" }]}>
            <Input placeholder="如：dwa_v_m_cus_cb_user_info" />
          </Form.Item>
          <Form.Item
            name="fieldsText"
            label="字段（每行：字段名 类型 注释）"
            rules={[{ required: true, message: "请填写字段" }]}
          >
            <Input.TextArea
              rows={6}
              placeholder={"user_id string 用户ID\nprovince_id string 省份ID\ncnt number 数量"}
            />
          </Form.Item>
          <Form.Item name="relationsText" label="关联说明（可选，多行或分号分隔）">
            <Input.TextArea rows={2} placeholder="表A.id = 表B.fk_id" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="从 Excel 同步知识集合与指标/维度"
        open={syncExcelOpen}
        onCancel={() => setSyncExcelOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Typography.Paragraph type="secondary">
          上传国信方案格式的 Excel（需求说明及知识、输出数据、输出 SQL、关联表 Sheet），将自动解析并更新当前知识集合、指标与维度。
        </Typography.Paragraph>
        <Upload.Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={(file) => {
            void handleSyncFromExcel(file);
            return false;
          }}
          disabled={syncing}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 48 }} />
          </p>
          <p className="ant-upload-text">点击或拖拽 .xlsx / .xls 到此区域</p>
          <p className="ant-upload-hint">{syncing ? "解析与同步中…" : "解析后将更新知识集合、指标、维度"}</p>
        </Upload.Dragger>
      </Modal>
    </>
  );
}
