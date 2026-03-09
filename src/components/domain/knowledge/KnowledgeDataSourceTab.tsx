import { EditOutlined, InboxOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import { useState } from "react";
import { authApi, domainApi } from "../../../services/mockApi";
import type { DataSourceConfig, DatasetItem, ImportedTable, UploadedDocumentItem } from "../../../types/domain";
import { DatasetImportModal } from "./DatasetImportModal";

interface KnowledgeDataSourceTabProps {
  systemId: string;
  config: DataSourceConfig;
  importedTables?: ImportedTable[];
  datasets?: DatasetItem[];
  onSaved?: () => void;
  isCreator?: boolean;
}

const driverClassMap: Record<string, string> = {
  MYSQL: "com.mysql.cj.jdbc.Driver",
  POSTGRESQL: "org.postgresql.Driver",
  HIVE: "org.apache.hive.jdbc.HiveDriver",
};

const createDocId = () => `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function KnowledgeDataSourceTab({
  systemId,
  config,
  importedTables = [],
  datasets = [],
  onSaved,
  isCreator = true,
}: KnowledgeDataSourceTabProps) {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocumentItem | null>(null);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<DataSourceConfig>();

  const isDocumentUpload = config.sourceType === "DOCUMENT_UPLOAD";
  const documents = config.uploadedDocuments ?? [];
  const hasJdbc =
    config.sourceType &&
    config.sourceType !== "DOCUMENT_UPLOAD" &&
    config.jdbcUrl &&
    config.enabled !== false;
  const hasDocs = isDocumentUpload && documents.length > 0;
  const hasTestTables = importedTables.length > 0;
  const hasAnySource = hasJdbc || hasDocs || hasTestTables;

  const handleOk = async () => {
    try {
      const sourceType = form.getFieldValue("sourceType") as DataSourceConfig["sourceType"];
      const values = await (sourceType === "DOCUMENT_UPLOAD"
        ? form.validateFields(["name", "description", "owner", "sourceType"])
        : form.validateFields()) as Partial<DataSourceConfig>;
      const nextConfig: DataSourceConfig = {
        ...config,
        ...values,
        uploadedDocuments: config.uploadedDocuments,
      };
      if (values.sourceType && values.sourceType !== "DOCUMENT_UPLOAD") {
        (nextConfig as DataSourceConfig).driverClass = values.driverClass ?? driverClassMap[values.sourceType];
      }
      setSaving(true);
      const session = authApi.getSessionSync();
      await domainApi.updateKnowledgeDataSource(systemId, nextConfig, session?.userId);
      const operator = session?.displayName ?? session?.username ?? "未登录";
      domainApi.appendOperationLog({
        module: "knowledge",
        moduleName: "语义知识库",
        actionType: "编辑",
        actionSummary: "编辑数据源",
        relatedObject: nextConfig.name ?? systemId,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      messageApi.success("数据源已保存");
      setOpen(false);
      onSaved?.();
    } catch (e) {
      if (e instanceof Error && e.message !== "知识库不存在") {
        messageApi.error(e.message || "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const session = authApi.getSessionSync();
    if (!isCreator || !session?.userId) return false;
    const name = file.name || "未命名";
    const ext = (name.split(".").pop() || "").toLowerCase();
    const type = (["md", "doc", "docx", "pdf", "xlsx"].includes(ext) ? ext : "md") as UploadedDocumentItem["type"];
    setUploading(true);
    try {
      const content = type === "md" ? await file.text() : "";
      const item: UploadedDocumentItem = {
        id: createDocId(),
        name,
        type,
        size: file.size,
        uploadedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        uploaderId: session.userId,
        content: type === "md" ? content : undefined,
      };
      await domainApi.uploadDataSourceDocuments(systemId, [item], session.userId);
      messageApi.success(`已上传 ${name}`);
      onSaved?.();
      if (type === "md" && content) {
        try {
          await domainApi.extractMetricsDimensions(systemId, { content }, session.userId);
          messageApi.info("已根据文档内容自动抽取指标与维度");
          onSaved?.();
        } catch {
          // 抽取失败不影响上传成功，静默跳过
        }
      }
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleRemoveDoc = async (doc: UploadedDocumentItem) => {
    const session = authApi.getSessionSync();
    if (!isCreator || !session?.userId) return;
    try {
      await domainApi.removeDataSourceDocument(systemId, doc.id, session.userId);
      messageApi.success("已删除");
      onSaved?.();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <>
      {contextHolder}
      {!hasAnySource && (
        <Alert
          type="info"
          message="请至少配置一种数据来源：数据源或测试数据表。"
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}
      <Card
        title="源数据管理"
        extra={
          isCreator ? (
            <Button
              icon={<EditOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  ...config,
                  name: config.name ?? "",
                  description: config.description ?? "",
                  owner: config.owner ?? "",
                  sourceType: config.sourceType ?? "MYSQL",
                });
                setOpen(true);
              }}
            >
              编辑
            </Button>
          ) : null
        }
      >
        {isDocumentUpload ? (
          <>
            <Descriptions column={2} size="small" bordered>
              {config.name != null && config.name !== "" && (
                <Descriptions.Item label="名称">{config.name}</Descriptions.Item>
              )}
              {config.description != null && config.description !== "" && (
                <Descriptions.Item label="描述" span={2}>
                  {config.description}
                </Descriptions.Item>
              )}
              {config.owner != null && config.owner !== "" && (
                <Descriptions.Item label="负责人">{config.owner}</Descriptions.Item>
              )}
              <Descriptions.Item label="数据源类型">文档上传</Descriptions.Item>
            </Descriptions>
            {isCreator && (
              <Upload.Dragger
                accept=".md,.doc,.docx,.pdf,.xlsx"
                showUploadList={false}
                beforeUpload={handleFileUpload}
                disabled={uploading}
                style={{ marginTop: 16 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽 .md / .doc / .docx / .pdf / .xlsx 到此区域上传</p>
              </Upload.Dragger>
            )}
            <Table<UploadedDocumentItem>
              rowKey="id"
              dataSource={documents}
              size="small"
              style={{ marginTop: 16 }}
              columns={[
                { title: "名称", dataIndex: "name", key: "name", ellipsis: true },
                { title: "类型", dataIndex: "type", key: "type", width: 80 },
                { title: "上传时间", dataIndex: "uploadedAt", key: "uploadedAt", width: 160 },
                {
                  title: "操作",
                  key: "action",
                  width: 140,
                  render: (_, record) => (
                    <Space>
                      <Button type="link" size="small" onClick={() => setPreviewDoc(record)}>
                        预览
                      </Button>
                      {isCreator ? (
                        <Popconfirm title="确认删除该文档？" onConfirm={() => handleRemoveDoc(record)}>
                          <Button type="link" size="small" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      ) : null}
                    </Space>
                  ),
                },
              ]}
              pagination={false}
            />
          </>
        ) : (
        <Descriptions column={2} size="small" bordered>
          {config.name != null && config.name !== "" && (
            <Descriptions.Item label="名称">{config.name}</Descriptions.Item>
          )}
          {config.description != null && config.description !== "" && (
            <Descriptions.Item label="描述" span={2}>
              {config.description}
            </Descriptions.Item>
          )}
          {config.owner != null && config.owner !== "" && (
            <Descriptions.Item label="负责人">{config.owner}</Descriptions.Item>
          )}
          <Descriptions.Item label="数据源类型">{config.sourceType}</Descriptions.Item>
          {config.driverClass != null && (
            <Descriptions.Item label="驱动类">{config.driverClass}</Descriptions.Item>
          )}
          {config.jdbcUrl != null && (
            <Descriptions.Item label="JDBC 地址" span={2}>
              {config.jdbcUrl}
            </Descriptions.Item>
          )}
          {config.username != null && (
            <Descriptions.Item label="用户名">{config.username}</Descriptions.Item>
          )}
          {config.defaultSchema != null && (
            <Descriptions.Item label="默认 Schema">{config.defaultSchema}</Descriptions.Item>
          )}
          {config.poolInitSize != null && (
            <Descriptions.Item label="初始连接数">{config.poolInitSize}</Descriptions.Item>
          )}
          {config.poolMinSize != null && (
            <Descriptions.Item label="最小连接数">{config.poolMinSize}</Descriptions.Item>
          )}
          {config.poolMaxSize != null && (
            <Descriptions.Item label="最大连接数">{config.poolMaxSize}</Descriptions.Item>
          )}
          {config.enabled != null && (
            <Descriptions.Item label="连接可用">
              <Switch checked={config.enabled} disabled />
            </Descriptions.Item>
          )}
        </Descriptions>
        )}
      </Card>

      <Card title="测试数据表" style={{ marginTop: 16 }}>
        <Typography.Paragraph type="secondary">
          从文件或数据库导入的表可作为测试数据来源，与数据源二选一或并存即可满足取数。
        </Typography.Paragraph>
        {isCreator && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setImportModalOpen(true)}
            style={{ marginBottom: 12 }}
          >
            导入数据表
          </Button>
        )}
        <Table<ImportedTable>
          rowKey="id"
          dataSource={importedTables}
          size="small"
          columns={[
            { title: "表名", dataIndex: "name", key: "name", ellipsis: true },
            { title: "来源", dataIndex: "sourceType", key: "sourceType", width: 120 },
            { title: "字段数", dataIndex: "fieldCount", key: "fieldCount", width: 80 },
            { title: "行数", dataIndex: "rowCount", key: "rowCount", width: 80 },
            { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", width: 160 },
          ]}
          pagination={false}
          locale={{ emptyText: "暂无测试数据表，可点击「导入数据表」添加" }}
        />
      </Card>

      <DatasetImportModal
        open={importModalOpen}
        systemId={systemId}
        datasets={datasets}
        onCancel={() => setImportModalOpen(false)}
        onSuccess={() => {
          setImportModalOpen(false);
          onSaved?.();
        }}
      />

      <Modal
        title="编辑数据源"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleOk()}
        confirmLoading={saving}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item label="名称" name="name">
            <Input placeholder="数据源名称（选填）" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="描述（选填）" />
          </Form.Item>
          <Form.Item label="负责人" name="owner">
            <Input placeholder="负责人（选填）" />
          </Form.Item>
          <Form.Item
            label="数据源类型"
            name="sourceType"
            rules={[{ required: true, message: "请选择数据源类型" }]}
          >
            <Select
              options={[
                { value: "MYSQL", label: "MYSQL" },
                { value: "POSTGRESQL", label: "POSTGRESQL" },
                { value: "HIVE", label: "HIVE" },
                { value: "DOCUMENT_UPLOAD", label: "文档上传" },
              ]}
              onChange={(v: DataSourceConfig["sourceType"]) => {
                if (v !== "DOCUMENT_UPLOAD") form.setFieldValue("driverClass", driverClassMap[v]);
              }}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.sourceType !== cur.sourceType}>
            {({ getFieldValue }) =>
              getFieldValue("sourceType") !== "DOCUMENT_UPLOAD" ? (
                <>
                  <Form.Item
                    label="驱动类"
                    name="driverClass"
                    rules={[{ required: true, message: "请输入驱动类" }]}
                  >
                    <Input placeholder="如 com.mysql.cj.jdbc.Driver" />
                  </Form.Item>
                  <Form.Item
                    label="JDBC 地址"
                    name="jdbcUrl"
                    rules={[{ required: true, message: "请输入 JDBC 地址" }]}
                  >
                    <Input placeholder="jdbc:mysql://host:port/db" />
                  </Form.Item>
                  <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入用户名" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="默认 Schema" name="defaultSchema" rules={[{ required: true, message: "请输入默认 Schema" }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="连接池配置">
                    <Space wrap>
                      <Form.Item
                        name="poolInitSize"
                        noStyle
                        rules={[{ required: true }, { type: "number", min: 1, message: "至少为 1" }]}
                      >
                        <InputNumber min={1} addonBefore="初始" />
                      </Form.Item>
                      <Form.Item
                        name="poolMinSize"
                        noStyle
                        rules={[{ required: true }, { type: "number", min: 1, message: "至少为 1" }]}
                      >
                        <InputNumber min={1} addonBefore="最小" />
                      </Form.Item>
                      <Form.Item
                        name="poolMaxSize"
                        noStyle
                        rules={[{ required: true }, { type: "number", min: 1, message: "至少为 1" }]}
                      >
                        <InputNumber min={1} addonBefore="最大" />
                      </Form.Item>
                    </Space>
                  </Form.Item>
                  <Form.Item label="连接可用" name="enabled" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={previewDoc?.name ?? "文档预览"}
        open={!!previewDoc}
        onCancel={() => setPreviewDoc(null)}
        footer={null}
        width={640}
      >
        {previewDoc && (
          <>
            {previewDoc.type === "md" && previewDoc.content ? (
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{previewDoc.content}</Typography.Paragraph>
            ) : (
              <Typography.Text type="secondary">暂不支持该类型在线预览（.doc/.docx/.pdf/.xlsx）</Typography.Text>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
