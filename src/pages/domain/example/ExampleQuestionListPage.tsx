import {
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { ExampleQuestionModal } from "../../../components/domain/example/ExampleQuestionModal";
import { authApi, domainApi } from "../../../services/mockApi";
import { setExampleQuestions } from "../../../store/domainSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { ExampleQuestion } from "../../../types/domain";

export function ExampleQuestionListPage() {
  const dispatch = useAppDispatch();
  const records = useAppSelector((state) => state.domain.exampleQuestions);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExampleQuestion | null>(null);
  const [activeRecord, setActiveRecord] = useState<ExampleQuestion | null>(null);
  const [executionParam, setExecutionParam] = useState("");
  const [executing, setExecuting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const load = async (query = "") => {
    setLoading(true);
    try {
      const list = await domainApi.getExampleQuestions({ keyword: query });
      dispatch(setExampleQuestions(list));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<ExampleQuestion> = useMemo(
    () => [
      {
        title: "自然语言问题",
        dataIndex: "question",
        width: 300,
      },
      {
        title: "SQL 语句",
        dataIndex: "sql",
        ellipsis: true,
      },
      {
        title: "数据源",
        dataIndex: "datasource",
        width: 90,
      },
      {
        title: "录入人",
        dataIndex: "author",
        width: 80,
      },
      {
        title: "更新时间",
        dataIndex: "updatedAt",
        width: 170,
      },
      {
        title: "状态",
        dataIndex: "status",
        width: 90,
        render: (value, record) => (
          <Switch
            checked={value === "enabled"}
            size="small"
            onChange={(checked) => {
              void (async () => {
                const session = authApi.getSessionSync();
                const operator = session?.displayName ?? session?.username ?? "未登录";
                try {
                  const list = await domainApi.toggleExampleQuestion(record.id, checked);
                  dispatch(setExampleQuestions(list));
                  domainApi.appendOperationLog({
                    module: "example_qa",
                    moduleName: "示例问题库",
                    actionType: "状态切换",
                    actionSummary: `将示例问题${checked ? "启用" : "停用"}`,
                    relatedObject: record.question?.slice(0, 50),
                    operator,
                    operatorId: session?.userId,
                    status: "成功",
                  });
                } catch (e) {
                  const text = e instanceof Error ? e.message : "未知错误";
                  domainApi.appendOperationLog({
                    module: "example_qa",
                    moduleName: "示例问题库",
                    actionType: "状态切换",
                    actionSummary: "切换示例问题状态",
                    relatedObject: record.question?.slice(0, 50),
                    operator,
                    operatorId: session?.userId,
                    status: "失败",
                    failReason: text,
                  });
                  messageApi.error(text);
                }
              })();
            }}
          />
        ),
      },
      {
        title: "操作",
        key: "action",
        width: 230,
        render: (_, record) => (
          <Space size={4} className="zy-table-actions">
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => setActiveRecord(record)}
            >
              执行
            </Button>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditing(record);
                setOpen(true);
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除该示例问题？"
              onConfirm={() => {
                void (async () => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  const q = record.question?.slice(0, 50);
                  try {
                    const list = await domainApi.removeExampleQuestion(record.id);
                    dispatch(setExampleQuestions(list));
                    domainApi.appendOperationLog({
                      module: "example_qa",
                      moduleName: "示例问题库",
                      actionType: "删除",
                      actionSummary: "删除示例问题",
                      relatedObject: q,
                      operator,
                      operatorId: session?.userId,
                      status: "成功",
                    });
                    messageApi.success("删除成功");
                  } catch (e) {
                    const text = e instanceof Error ? e.message : "未知错误";
                    domainApi.appendOperationLog({
                      module: "example_qa",
                      moduleName: "示例问题库",
                      actionType: "删除",
                      actionSummary: "删除示例问题",
                      relatedObject: q,
                      operator,
                      operatorId: session?.userId,
                      status: "失败",
                      failReason: text,
                    });
                    messageApi.error(text);
                  }
                })();
              }}
            >
              <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [dispatch, messageApi],
  );

  return (
    <>
      {contextHolder}
      <Card
        title="示例问题库"
        extra={
          <Space>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索问题或 SQL"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => {
                void load(keyword);
              }}
              style={{ width: 260 }}
            />
            <Button onClick={() => void load(keyword)}>查询</Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKeyword("");
                void load("");
              }}
            >
              重置
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              新增
            </Button>
          </Space>
        }
      >
        <Table<ExampleQuestion>
          rowKey="id"
          columns={columns}
          dataSource={records}
          loading={loading}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: "暂无示例问题，请点击“新增”创建" }}
        />
      </Card>

      <ExampleQuestionModal
        open={open}
        editing={editing}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={async (payload) => {
          const session = authApi.getSessionSync();
          const operator = session?.displayName ?? session?.username ?? "未登录";
          try {
            const next = await domainApi.saveExampleQuestion(payload);
            dispatch(setExampleQuestions(next));
            domainApi.appendOperationLog({
              module: "example_qa",
              moduleName: "示例问题库",
              actionType: editing ? "编辑" : "新增",
              actionSummary: editing ? "编辑示例问题" : "新增示例问题",
              relatedObject: payload.question?.slice(0, 50),
              operator,
              operatorId: session?.userId,
              status: "成功",
            });
            setOpen(false);
            setEditing(null);
            messageApi.success(editing ? "更新成功" : "新增成功");
          } catch (e) {
            const text = e instanceof Error ? e.message : "未知错误";
            domainApi.appendOperationLog({
              module: "example_qa",
              moduleName: "示例问题库",
              actionType: editing ? "编辑" : "新增",
              actionSummary: editing ? "编辑示例问题" : "新增示例问题",
              relatedObject: payload.question?.slice(0, 50),
              operator,
              operatorId: session?.userId,
              status: "失败",
              failReason: text,
            });
            messageApi.error(text);
          }
        }}
      />

      <Modal
        title="执行示例问题"
        open={Boolean(activeRecord)}
        confirmLoading={executing}
        onCancel={() => {
          setExecutionParam("");
          setActiveRecord(null);
        }}
        onOk={() => {
          setExecuting(true);
          setTimeout(() => {
            messageApi.success(
              executionParam.trim()
                ? `执行任务已触发（参数：${executionParam.trim()}）`
                : "执行任务已触发（未传入额外参数）",
            );
            setExecuting(false);
            setExecutionParam("");
            setActiveRecord(null);
          }, 400);
        }}
      >
        <Typography.Paragraph>
          <Tag color="blue">问题</Tag> {activeRecord?.question}
        </Typography.Paragraph>
        <Input
          placeholder="请输入执行参数（可选）"
          value={executionParam}
          onChange={(event) => setExecutionParam(event.target.value)}
        />
      </Modal>
    </>
  );
}
