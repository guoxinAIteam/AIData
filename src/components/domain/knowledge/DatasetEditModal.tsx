import {
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Button, Col, Collapse, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tabs, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import type { DatasetItem, TreeNode } from "../../../types/domain";

const periodOptions: { value: DatasetItem["periodType"]; label: string }[] = [
  { value: "月账期", label: "月账期" },
  { value: "日账期", label: "日账期" },
  { value: "年账期", label: "年账期" },
];

interface DatasetFieldRow {
  id: string;
  index: number;
  code: string;
  tableFieldCode: string;
  name: string;
  dimension: string;
  description: string;
  isDisplay: boolean;
  fieldType: string;
  sort: number;
}

function buildMockFields(count: number): DatasetFieldRow[] {
  const names = ["账期", "用户标识", "设备号码", "客户标识", "客户名称", "证件类型", "渠道类型", "产品编码"];
  return Array.from({ length: Math.max(count, 6) }, (_, i) => ({
    id: `f-${i}`,
    index: i + 1,
    code: names[i % names.length]?.replace(/\s/g, "_").toUpperCase() ?? `FIELD_${i + 1}`,
    tableFieldCode: names[i % names.length]?.replace(/\s/g, "_").toUpperCase() ?? `FIELD_${i + 1}`,
    name: names[i % names.length] ?? `字段${i + 1}`,
    dimension: "",
    description: "",
    isDisplay: true,
    fieldType: i === 0 ? "账期" : "维度",
    sort: i + 1,
  }));
}

interface DatasetEditModalProps {
  open: boolean;
  editingDataset: DatasetItem | null;
  treeData: TreeNode[];
  dataTableList: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    periodType: DatasetItem["periodType"];
    description: string;
    fieldCount: number;
    boundDimensionCount: number;
  }) => Promise<void>;
}

export function DatasetEditModal({
  open,
  editingDataset,
  treeData,
  dataTableList,
  onCancel,
  onSave,
}: DatasetEditModalProps) {
  const [form] = Form.useForm<Partial<DatasetItem> & { alias?: string }>();
  // treeData reserved for future 目录 tree binding
  void treeData;
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState("dwa");
  const [fieldSearch, setFieldSearch] = useState("");
  const [activeTab, setActiveTab] = useState("fields");

  const directoryOptions = periodOptions;

  const fieldCount = Form.useWatch("fieldCount", form) ?? 0;
  const fieldRows = useMemo(() => buildMockFields(Number(fieldCount) || 0), [fieldCount]);
  const filteredFieldRows = useMemo(() => {
    if (!fieldSearch.trim()) return fieldRows;
    const q = fieldSearch.trim().toLowerCase();
    return fieldRows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.tableFieldCode.toLowerCase().includes(q),
    );
  }, [fieldRows, fieldSearch]);

  useEffect(() => {
    if (open) {
      if (editingDataset) {
        form.setFieldsValue({
          name: editingDataset.name,
          periodType: editingDataset.periodType,
          description: editingDataset.description,
          fieldCount: editingDataset.fieldCount,
          boundDimensionCount: editingDataset.boundDimensionCount,
        });
      } else {
        form.setFieldsValue({
          name: "",
          periodType: "月账期",
          description: "",
          fieldCount: 0,
          boundDimensionCount: 0,
        });
      }
    }
  }, [open, editingDataset, form]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await onSave({
        name: values.name as string,
        periodType: values.periodType as DatasetItem["periodType"],
        description: (values.description as string) ?? "",
        fieldCount: values.fieldCount ?? 0,
        boundDimensionCount: values.boundDimensionCount ?? 0,
      });
      onCancel();
    } catch {
      // validation or save error
    } finally {
      setSaving(false);
    }
  };

  const fieldColumns: ColumnsType<DatasetFieldRow> = useMemo(
    () => [
      { title: "序号", dataIndex: "index", width: 64 },
      { title: "编码", dataIndex: "code", width: 120, ellipsis: true },
      { title: "表字段编码", dataIndex: "tableFieldCode", width: 120, ellipsis: true },
      {
        title: "名称",
        dataIndex: "name",
        width: 140,
        render: (name: string) => (
          <span>
            {name}
            <Typography.Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>
              AI
            </Typography.Text>
          </span>
        ),
      },
      {
        title: "维度",
        dataIndex: "dimension",
        width: 140,
        render: () => (
          <Select
            placeholder="请选择维度"
            allowClear
            style={{ width: "100%" }}
            options={[]}
          />
        ),
      },
      { title: "描述", dataIndex: "description", width: 100, ellipsis: true },
      {
        title: "是否展示",
        dataIndex: "isDisplay",
        width: 90,
        render: (v: boolean) => (v ? "是" : "否"),
      },
      { title: "字段类型", dataIndex: "fieldType", width: 90 },
      { title: "排序", dataIndex: "sort", width: 72 },
      {
        title: "操作",
        key: "action",
        width: 80,
        render: () => (
          <Button type="link" size="small" icon={<SettingOutlined />}>
            设置
          </Button>
        ),
      },
    ],
    [],
  );

  if (!open) return null;

  return (
    <Modal
      title={editingDataset ? "编辑数据集资产" : "新增数据集"}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={960}
      destroyOnClose
      styles={{ body: { paddingTop: 0 } }}
    >
      <Row gutter={0} style={{ minHeight: 480 }}>
        {/* 左侧：选择结构 */}
        <Col flex="0 0 280px" style={{ borderRight: "1px solid #f0f0f0", paddingRight: 16 }}>
          <div style={{ padding: "12px 0", borderBottom: "1px solid #e8edf5" }}>
            <Typography.Text strong style={{ color: "#1677ff", fontSize: 13 }}>
              选择结构
            </Typography.Text>
          </div>
          <Form.Item label="用户" style={{ marginTop: 12, marginBottom: 8 }}>
            <Select
              value={selectedUser}
              onChange={setSelectedUser}
              style={{ width: "100%" }}
              options={[{ value: "dwa", label: "dwa" }]}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            *数据表
          </Typography.Text>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索"
            allowClear
            style={{ marginTop: 4, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {dataTableList.length === 0 ? (
              <Typography.Text type="secondary">暂无数据表</Typography.Text>
            ) : (
              <table style={{ width: "100%", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#5e6c84" }}>
                    <th style={{ width: 40, textAlign: "left" }}>#</th>
                    <th style={{ textAlign: "left" }}>表名</th>
                    <th style={{ width: 60 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dataTableList.slice(0, 20).map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td>
                        <Button type="link" size="small" style={{ padding: 0, height: "auto" }}>
                          {t.name}
                        </Button>
                      </td>
                      <td>
                        <Button type="link" size="small" icon={<FileTextOutlined />}>
                          详情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Col>

        {/* 右侧：基本信息 + 字段信息 / 数据预览 */}
        <Col flex="1" style={{ paddingLeft: 24, minWidth: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text strong>表名: {form.getFieldValue("name") || "—"}</Typography.Text>
            <Button type="link" size="small" icon={<EditOutlined />} style={{ marginLeft: 8 }}>
              编辑 SQL
            </Button>
          </div>

          <Collapse
            defaultActiveKey={["basic"]}
            items={[
              {
                key: "basic",
                label: (
                  <span style={{ fontWeight: 600, fontSize: 14 }}>基本信息</span>
                ),
                extra: <Typography.Link style={{ fontSize: 12 }}>收起</Typography.Link>,
                children: (
                  <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
                    <Form.Item
                      name="name"
                      label="数据集名称"
                      rules={[{ required: true, message: "请输入数据集名称" }]}
                    >
                      <Input placeholder="请输入数据集名称" />
                    </Form.Item>
                    <Form.Item name="alias" label="数据集别名">
                      <Input placeholder="请输入数据集别名，失焦或回车确认" />
                    </Form.Item>
                    <Form.Item
                      name="periodType"
                      label="目录"
                      rules={[{ required: true, message: "请选择目录" }]}
                    >
                      <Select
                        placeholder="请选择目录"
                        options={directoryOptions}
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                    <Form.Item
                      name="description"
                      label="描述"
                      rules={[{ required: true, message: "请输入描述" }]}
                    >
                      <Input.TextArea rows={2} placeholder="请输入描述" maxLength={200} showCount />
                    </Form.Item>
                    <Form.Item name="fieldCount" label="字段数" initialValue={0}>
                      <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="boundDimensionCount" label="已绑维度数" initialValue={0}>
                      <InputNumber min={0} style={{ width: "100%" }} />
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ marginTop: 16 }}
            items={[
              {
                key: "fields",
                label: "字段信息",
                children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Typography.Text type="secondary">字段: {filteredFieldRows.length}个</Typography.Text>
                      <Typography.Text type="secondary" style={{ marginLeft: 16 }}>
                        未选中任何数据
                      </Typography.Text>
                    </div>
                    <Space style={{ marginBottom: 8 }} wrap>
                      <Input
                        prefix={<SearchOutlined />}
                        placeholder="请输入名称搜索"
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        style={{ width: 200 }}
                      />
                      <Button icon={<SettingOutlined />}>批量设置</Button>
                      <Button type="primary" icon={<PlusOutlined />}>
                        新增自定义列
                      </Button>
                    </Space>
                    <Table<DatasetFieldRow>
                      size="small"
                      rowKey="id"
                      columns={fieldColumns}
                      dataSource={filteredFieldRows}
                      pagination={false}
                      scroll={{ x: 900 }}
                      locale={{ emptyText: "暂无字段" }}
                    />
                  </div>
                ),
              },
              {
                key: "preview",
                label: "数据预览",
                children: (
                  <div className="zy-empty-wrap" style={{ minHeight: 120 }}>
                    <Typography.Text type="secondary">暂无预览数据</Typography.Text>
                  </div>
                ),
              },
            ]}
          />

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <Button type="primary" size="large" loading={saving} onClick={() => void handleSave()}>
              保存
            </Button>
          </div>
        </Col>
      </Row>
    </Modal>
  );
}
