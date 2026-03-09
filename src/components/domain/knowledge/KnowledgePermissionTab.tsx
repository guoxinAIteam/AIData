import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Menu,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Transfer,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useMemo, useState } from "react";
import { permissionCategoryText } from "../../../mocks/db";
import type {
  PermissionCategory,
  PermissionRecord,
  PermissionResource,
  PermissionSubjectType,
} from "../../../types/domain";

interface PermissionTabProps {
  systemId: string;
  permissions: Record<PermissionCategory, PermissionRecord[]>;
  resources: Record<PermissionCategory, PermissionResource[]>;
  onCreate: (
    category: PermissionCategory,
    subjectType: PermissionSubjectType,
    subjectName: string,
    selectedResourceKeys: string[],
  ) => Promise<void>;
  onDelete: (category: PermissionCategory, recordId: string) => Promise<void>;
}

type TransferItem = {
  key: string;
  title: string;
  description: string;
};

const subjectTypeOptions: Array<{ label: PermissionSubjectType; value: PermissionSubjectType }> = [
  { label: "用户", value: "用户" },
  { label: "用户组", value: "用户组" },
  { label: "组织机构", value: "组织机构" },
];

export function KnowledgePermissionTab({ permissions, resources, onCreate, onDelete }: PermissionTabProps) {
  const [category, setCategory] = useState<PermissionCategory>("datasetAccess");
  const [open, setOpen] = useState(false);
  const [targetKeys, setTargetKeys] = useState<Key[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<{ subjectType: PermissionSubjectType; subjectName: string }>();

  const leftMenus = useMemo(
    () =>
      Object.entries(permissionCategoryText).map(([key, label]) => ({
        key,
        label,
      })),
    [],
  );

  const dataSource = useMemo<TransferItem[]>(
    () =>
      resources[category].map((item) => ({
        key: item.key,
        title: item.name,
        description: item.code,
      })),
    [category, resources],
  );

  const columns: ColumnsType<PermissionRecord> = [
    {
      title: "权限主体类型",
      dataIndex: "subjectType",
      width: 120,
      render: (value: PermissionRecord["subjectType"]) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: "权限主体",
      dataIndex: "subjectName",
    },
    {
      title: "权限描述",
      dataIndex: "permissionDesc",
    },
    {
      title: "更新人",
      dataIndex: "updatedBy",
      width: 90,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      width: 160,
    },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 90,
      render: (value: boolean) => <Switch checked={value} size="small" />,
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      render: (_, record) => (
        <Space size={4} className="zy-table-actions">
          <Popconfirm
            title="确认删除该授权？"
            onConfirm={() => {
              void onDelete(category, record.id);
            }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <Row gutter={12}>
        <Col xs={24} xl={5}>
          <Card title="权限类型" bodyStyle={{ padding: 0 }}>
            <Menu
              mode="inline"
              selectedKeys={[category]}
              items={leftMenus}
              onSelect={(event) => setCategory(event.key as PermissionCategory)}
              style={{ borderInlineEnd: "none" }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={19}>
          <Card
            title={permissionCategoryText[category]}
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setOpen(true);
                  setTargetKeys([]);
                  form.setFieldsValue({ subjectType: "用户" });
                }}
              >
                新增
              </Button>
            }
          >
            <Table<PermissionRecord>
              rowKey="id"
              dataSource={permissions[category]}
              columns={columns}
              pagination={{ pageSize: 6 }}
              locale={{ emptyText: "暂无权限记录，请点击“新增”进行授权" }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={`新增${permissionCategoryText[category]}`}
        open={open}
        width={920}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void form
            .validateFields()
            .then(async (values) => {
              if (targetKeys.length === 0) {
                messageApi.warning("请至少选择一项资源");
                return;
              }
              await onCreate(
                category,
                values.subjectType,
                values.subjectName,
                targetKeys.map((item) => item.toString()),
              );
              setOpen(false);
            })
            .catch(() => {
              messageApi.warning("请先完成必填项");
            });
        }}
      >
        <Form form={form} layout="inline" style={{ marginBottom: 14 }}>
          <Form.Item name="subjectType" label="主体类型" rules={[{ required: true, message: "请选择主体类型" }]}>
            <Select style={{ width: 140 }} options={subjectTypeOptions} />
          </Form.Item>
          <Form.Item name="subjectName" label="主体名称" rules={[{ required: true, message: "请输入主体名称" }]}>
            <Input placeholder="如：赵金慧 / 运营组 / 市场部" style={{ width: 260 }} />
          </Form.Item>
        </Form>

        <Transfer
          dataSource={dataSource}
          targetKeys={targetKeys}
          onChange={setTargetKeys}
          titles={["可选列表", "已选列表"]}
          render={(item) => `${item.title} (${item.description})`}
          showSearch
          oneWay
          listStyle={{
            width: 390,
            height: 340,
          }}
        />
      </Modal>
    </>
  );
}
