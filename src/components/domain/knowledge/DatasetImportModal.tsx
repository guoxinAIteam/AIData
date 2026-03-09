import { DatabaseOutlined, FileExcelOutlined } from "@ant-design/icons";
import { Button, Form, Input, InputNumber, Modal, Radio, Select, Space, Steps, Table, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { domainApi } from "../../../services/mockApi";
import type { DatasetItem, ImportedTable, ImportSourceType } from "../../../types/domain";

type ImportMethod = "file" | "database";

const FILE_SOURCE_OPTIONS: { value: ImportSourceType; label: string }[] = [
  { value: "file_csv", label: "CSV" },
  { value: "file_excel", label: "Excel (xlsx)" },
  { value: "file_json", label: "JSON" },
];

const DB_SOURCE_OPTIONS: { value: ImportSourceType; label: string }[] = [
  { value: "mysql", label: "MySQL" },
  { value: "postgresql", label: "PostgreSQL" },
];

interface DatasetImportModalProps {
  open: boolean;
  systemId: string;
  datasets: DatasetItem[];
  onCancel: () => void;
  onSuccess?: () => void;
}

interface ParsedMeta {
  tableName: string;
  fieldCount: number;
  rowCount: number;
  primaryKey?: string;
  sourceType: ImportSourceType;
}

export function DatasetImportModal({
  open,
  systemId,
  datasets,
  onCancel,
  onSuccess,
}: DatasetImportModalProps) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<ImportMethod>("file");
  const [fileForm] = Form.useForm<{
    tableName: string;
    sourceType: "file_csv" | "file_excel" | "file_json";
    fieldCount: number;
    rowCount: number;
    primaryKey?: string;
  }>();
  const [dbForm] = Form.useForm<{
    sourceType: "mysql" | "postgresql";
    jdbcUrl: string;
    username: string;
    password?: string;
    tableName: string;
  }>();
  const [dbTableList, setDbTableList] = useState<string[]>([]);
  const [parsedMeta, setParsedMeta] = useState<ParsedMeta | null>(null);
  const [importedTable, setImportedTable] = useState<ImportedTable | null>(null);
  const [bindDatasetId, setBindDatasetId] = useState<string | "">("");
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const reset = () => {
    setStep(0);
    setMethod("file");
    fileForm.resetFields();
    dbForm.resetFields();
    setDbTableList([]);
    setParsedMeta(null);
    setImportedTable(null);
    setBindDatasetId("");
  };

  const handleClose = () => {
    reset();
    onCancel();
  };

  // Step 1 -> 2: 选择方式后进入配置
  const goStep2 = () => {
    setStep(1);
    if (method === "file") {
      fileForm.setFieldsValue({ sourceType: "file_csv", tableName: "", fieldCount: 0, rowCount: 0 });
    } else {
      dbForm.setFieldsValue({
        sourceType: "mysql",
        jdbcUrl: "jdbc:mysql://127.0.0.1:3306/demo",
        username: "root",
        tableName: "",
      });
      setDbTableList(["order_fact", "user_dim", "product_dim"]);
    }
  };

  // Step 2 文件：模拟解析
  const finishFileConfig = async () => {
    const values = await fileForm.validateFields();
    setLoading(true);
    try {
      const table = await domainApi.importFromFile({
        knowledgeSystemId: systemId,
        sourceType: values.sourceType,
        tableName: values.tableName || "imported_table",
        fieldCount: values.fieldCount ?? 0,
        rowCount: values.rowCount ?? 0,
        primaryKey: values.primaryKey,
        sampleRows: [],
      });
      setParsedMeta({
        tableName: table.name,
        fieldCount: table.fieldCount,
        rowCount: table.rowCount,
        primaryKey: table.primaryKey,
        sourceType: table.sourceType,
      });
      setImportedTable(table);
      setStep(2);
      messageApi.success("导入成功，请绑定到数据集");
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 数据库：选择表后模拟拉取结构并导入
  const finishDbConfig = async () => {
    const values = await dbForm.validateFields();
    if (!values.tableName) {
      messageApi.warning("请选择要导入的表");
      return;
    }
    setLoading(true);
    try {
      const table = await domainApi.importFromDatabase({
        knowledgeSystemId: systemId,
        sourceType: values.sourceType,
        tableName: values.tableName,
        fieldCount: 8,
        rowCount: 1000,
        primaryKey: "id",
        connectionInfo: values.jdbcUrl,
      });
      setParsedMeta({
        tableName: table.name,
        fieldCount: table.fieldCount,
        rowCount: table.rowCount,
        primaryKey: table.primaryKey,
        sourceType: table.sourceType,
      });
      setImportedTable(table);
      setStep(2);
      messageApi.success("导入成功，请绑定到数据集");
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 绑定到数据集
  const handleBind = async () => {
    if (!importedTable) return;
    if (bindDatasetId) {
      setLoading(true);
      try {
        await domainApi.bindTableToDataset({
          knowledgeSystemId: systemId,
          datasetId: bindDatasetId,
          importedTableId: importedTable.id,
          tableName: importedTable.name,
          fieldCount: importedTable.fieldCount,
          rowCount: importedTable.rowCount,
          primaryKey: importedTable.primaryKey,
          dataSourceLabel: importedTable.name,
        });
        messageApi.success("已绑定到数据集");
        onSuccess?.();
        handleClose();
      } catch (e) {
        messageApi.error(e instanceof Error ? e.message : "绑定失败");
      } finally {
        setLoading(false);
      }
    } else {
      messageApi.info("未选择数据集，仅完成导入");
      onSuccess?.();
      handleClose();
    }
  };

  const steps = [
    { title: "选择导入方式" },
    { title: "配置源" },
    { title: "绑定到数据集" },
  ];

  const mappingColumns: ColumnsType<{ key: string; source: string; target: string; status: string }> = [
    { title: "源字段", dataIndex: "source", key: "source" },
    { title: "目标/忽略", dataIndex: "target", key: "target" },
    { title: "状态", dataIndex: "status", key: "status" },
  ];
  const mappingData = parsedMeta
    ? Array.from({ length: Math.min(parsedMeta.fieldCount, 6) }, (_, i) => ({
        key: `col_${i}`,
        source: `column_${i + 1}`,
        target: i === 0 ? "主键" : "映射",
        status: "通过",
      }))
    : [];

  if (!open) return null;

  return (
    <>
      {contextHolder}
      <Modal
        title="导入数据表"
        open={open}
        onCancel={handleClose}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Steps current={step} style={{ marginBottom: 24 }} items={steps} />

        {step === 0 && (
          <div>
            <Typography.Paragraph type="secondary">选择从文件或数据库导入表结构元数据。</Typography.Paragraph>
            <Radio.Group
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              style={{ width: "100%" }}
            >
              <Space direction="vertical">
                <Radio value="file">
                  <Space>
                    <FileExcelOutlined />
                    文件导入（CSV / Excel / JSON）
                  </Space>
                </Radio>
                <Radio value="database">
                  <Space>
                    <DatabaseOutlined />
                    数据库直连（MySQL / PostgreSQL）
                  </Space>
                </Radio>
              </Space>
            </Radio.Group>
            <div style={{ marginTop: 24, textAlign: "right" }}>
              <Button type="primary" onClick={goStep2}>
                下一步
              </Button>
            </div>
          </div>
        )}

        {step === 1 && method === "file" && (
          <Form form={fileForm} layout="vertical">
            <Form.Item name="sourceType" label="文件类型" rules={[{ required: true }]}>
              <Select options={FILE_SOURCE_OPTIONS} placeholder="请选择" />
            </Form.Item>
            <Form.Item name="tableName" label="表名" rules={[{ required: true, message: "请输入表名" }]}>
              <Input placeholder="导入后的表名" />
            </Form.Item>
            <Form.Item label="上传文件（POC 可选）">
              <Upload maxCount={1} accept=".csv,.xlsx,.xls,.json" showUploadList={{ showRemoveIcon: true }} />
            </Form.Item>
            <Form.Item name="fieldCount" label="字段数" initialValue={0}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="rowCount" label="行数" initialValue={0}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="primaryKey" label="主键字段">
              <Input placeholder="可选，逗号分隔" />
            </Form.Item>
            <Space>
              <Button onClick={() => setStep(0)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={() => void finishFileConfig()}>
                解析并导入
              </Button>
            </Space>
          </Form>
        )}

        {step === 1 && method === "database" && (
          <Form form={dbForm} layout="vertical">
            <Form.Item name="sourceType" label="数据库类型" rules={[{ required: true }]}>
              <Select options={DB_SOURCE_OPTIONS} placeholder="请选择" />
            </Form.Item>
            <Form.Item name="jdbcUrl" label="JDBC URL" rules={[{ required: true, message: "请输入 JDBC URL" }]}>
              <Input placeholder="jdbc:mysql://host:3306/db" />
            </Form.Item>
            <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
              <Input placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" label="密码">
              <Input.Password placeholder="可选" />
            </Form.Item>
            <Form.Item name="tableName" label="选择表" rules={[{ required: true, message: "请选择表" }]}>
              <Select
                placeholder="先保存连接后获取表列表（当前为 mock 列表）"
                options={dbTableList.map((t) => ({ value: t, label: t }))}
                allowClear
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setStep(0)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={() => void finishDbConfig()}>
                获取表结构并导入
              </Button>
            </Space>
          </Form>
        )}

        {step === 2 && (
          <div>
            {parsedMeta && (
              <>
                <Typography.Paragraph>
                  导入表 <Typography.Text strong>{parsedMeta.tableName}</Typography.Text>，字段数 {parsedMeta.fieldCount}，行数 {parsedMeta.rowCount}。
                  校验与映射（POC 简化）：
                </Typography.Paragraph>
                <Table
                  size="small"
                  columns={mappingColumns}
                  dataSource={mappingData}
                  pagination={false}
                  style={{ marginBottom: 16 }}
                />
                <Form.Item label="绑定到已有数据集（可选）">
                  <Select
                    placeholder="选择数据集或留空仅导入"
                    allowClear
                    value={bindDatasetId || undefined}
                    onChange={(v) => setBindDatasetId(v ?? "")}
                    style={{ width: "100%" }}
                    options={datasets.map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Form.Item>
              </>
            )}
            <Space>
              <Button onClick={() => setStep(1)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={() => void handleBind()}>
                {bindDatasetId ? "绑定并完成" : "仅完成导入"}
              </Button>
            </Space>
          </div>
        )}
      </Modal>
    </>
  );
}
