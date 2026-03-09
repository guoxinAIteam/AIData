import {
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Pagination,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bar, BarChart } from "recharts";
import { domainApi } from "../../../services/mockApi";
import type {
  ModelUsageFilter,
  OperationLogFilter,
} from "../../../services/mockApi";
import type {
  OperationLogEntry,
  OperationLogModule,
} from "../../../types/domain";

const MODULE_OPTIONS: { label: string; value: OperationLogModule }[] = [
  { label: "经营指标问数", value: "metrics_qa" },
  { label: "Skill 库", value: "skill_lib" },
  { label: "语义知识库", value: "knowledge" },
  { label: "示例问题库", value: "example_qa" },
  { label: "业务术语词典", value: "glossary" },
  { label: "样本打标", value: "question_labeling" },
];

const MODULE_COLORS: Record<OperationLogModule, string> = {
  metrics_qa: "blue",
  skill_lib: "green",
  knowledge: "orange",
  example_qa: "purple",
  glossary: "cyan",
  question_labeling: "geekblue",
};

const TIME_RANGE_OPTIONS = [
  { label: "今日", value: "today" },
  { label: "昨日", value: "yesterday" },
  { label: "近 7 天", value: "7d" },
  { label: "近 30 天", value: "30d" },
  { label: "自定义", value: "custom" },
];

export function TraceCenterPage() {
  const [activeTab, setActiveTab] = useState("ops");
  const [operationLogIdToFocus, setOperationLogIdToFocus] = useState<string | null>(null);

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card title="操作日志">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            if (key === "usage") setOperationLogIdToFocus(null);
          }}
          items={[
            {
              key: "ops",
              label: "操作记录",
              children: (
                <OperationLogTab
                  initialOperationLogId={operationLogIdToFocus ?? undefined}
                  onClearFocus={() => setOperationLogIdToFocus(null)}
                />
              ),
            },
            {
              key: "usage",
              label: "模型用量统计",
              children: (
                <ModelUsageTab
                  onJumpToOps={(operationLogId) => {
                    if (operationLogId) setOperationLogIdToFocus(operationLogId);
                    setActiveTab("ops");
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function OperationLogTab({
  initialOperationLogId,
  onClearFocus,
}: {
  initialOperationLogId?: string;
  onClearFocus: () => void;
}) {
  const [modules, setModules] = useState<OperationLogModule[]>([]);
  const [timeRange, setTimeRange] = useState<OperationLogFilter["timeRange"]>("7d");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [operator, setOperator] = useState<string | undefined>();
  const [keyword, setKeyword] = useState("");
  const [resultSource, setResultSource] = useState<"大模型" | "本地样例" | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<OperationLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [byModule, setByModule] = useState<{ module: OperationLogModule; moduleName: string; count: number }[]>([]);
  const [operators, setOperators] = useState<string[]>([]);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const load = async (override?: Partial<OperationLogFilter>) => {
    setLoading(true);
    try {
      const filter: OperationLogFilter = {
        modules: override?.modules ?? (modules.length ? modules : undefined),
        timeRange: override?.timeRange ?? timeRange,
        startDate: override?.startDate ?? (timeRange === "custom" && dateRange ? dateRange[0] : undefined),
        endDate: override?.endDate ?? (timeRange === "custom" && dateRange ? dateRange[1] : undefined),
        operator: override?.operator ?? operator,
        keyword: override?.keyword ?? keyword,
        operationLogId: override?.operationLogId,
        resultSource: override?.resultSource ?? resultSource,
        page: override?.page ?? page,
        pageSize: override?.pageSize ?? pageSize,
      };
      const data = await domainApi.getOperationLogs(filter);
      setList(data.list);
      setTotal(data.total);
      setByModule(data.byModule ?? []);
      if (override?.page === 1 || (override?.pageSize === pageSize && override?.page === undefined)) {
        setPage(filter.page ?? 1);
      }
      if (initialOperationLogId && data.list.some((r) => r.id === initialOperationLogId)) {
        setExpandedRowKeys([initialOperationLogId]);
        onClearFocus();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOperators(domainApi.getOperationLogOperators());
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, timeRange, dateRange, operator, resultSource, page, pageSize]);

  useEffect(() => {
    if (initialOperationLogId) {
      void load({ operationLogId: initialOperationLogId, page: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOperationLogId]);

  const exportCsv = () => {
    if (list.length === 0) return;
    const headers = ["操作时间", "操作人", "所属模块", "操作类型", "操作内容", "关联对象", "操作状态"];
    const lines = list.map((item) =>
      [
        item.createdAt,
        item.operator,
        item.moduleName,
        item.actionType,
        item.actionSummary,
        item.relatedObject ?? "",
        item.status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = ["\uFEFF" + headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `操作记录_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<OperationLogEntry> = useMemo(
    () => [
      { title: "操作时间", dataIndex: "createdAt", width: 170, fixed: "left" },
      { title: "操作人", dataIndex: "operator", width: 100 },
      {
        title: "所属模块",
        dataIndex: "moduleName",
        width: 120,
        render: (_: unknown, record: OperationLogEntry) => (
          <Tag color={MODULE_COLORS[record.module] ?? "default"}>{record.moduleName}</Tag>
        ),
      },
      { title: "操作类型", dataIndex: "actionType", width: 90 },
      { title: "操作内容", dataIndex: "actionSummary", ellipsis: true },
      { title: "关联对象", dataIndex: "relatedObject", width: 140, ellipsis: true },
      {
        title: "操作状态",
        dataIndex: "status",
        width: 90,
        render: (status: "成功" | "失败") => (
          <Tag color={status === "成功" ? "success" : "error"}>{status}</Tag>
        ),
      },
    ],
    [],
  );

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap align="center">
        <Select
          mode="multiple"
          placeholder="所属模块"
          style={{ minWidth: 200 }}
          value={modules}
          onChange={setModules}
          options={MODULE_OPTIONS}
        />
        <Select
          placeholder="时间范围"
          style={{ width: 120 }}
          value={timeRange}
          onChange={(v) => {
            setTimeRange(v);
            if (v !== "custom") setDateRange(null);
          }}
          options={TIME_RANGE_OPTIONS}
        />
        {timeRange === "custom" && (
          <DatePicker.RangePicker
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]);
              } else {
                setDateRange(null);
              }
            }}
          />
        )}
        <Select
          placeholder="操作人"
          allowClear
          style={{ width: 120 }}
          value={operator}
          onChange={setOperator}
          options={operators.map((o) => ({ label: o, value: o }))}
        />
        {(modules.length === 0 || modules.includes("metrics_qa")) && (
          <Select
            placeholder="结果来源"
            allowClear
            style={{ width: 110 }}
            value={resultSource}
            onChange={setResultSource}
            options={[
              { label: "大模型", value: "大模型" },
              { label: "本地样例", value: "本地样例" },
            ]}
          />
        )}
        <Input
          allowClear
          placeholder="关键词（操作内容/关联对象）"
          prefix={<SearchOutlined />}
          style={{ width: 220 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={() => void load({ keyword, page: 1 })}
        />
        <Button onClick={() => void load({ page: 1 })}>查询</Button>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setModules([]);
            setTimeRange("7d");
            setDateRange(null);
            setOperator(undefined);
            setResultSource(undefined);
            setKeyword("");
            setPage(1);
            void load({ modules: [], timeRange: "7d", operator: undefined, resultSource: undefined, keyword: "", page: 1 });
          }}
        >
          重置
        </Button>
        <Button icon={<DownloadOutlined />} disabled={list.length === 0} onClick={exportCsv}>
          导出
        </Button>
      </Space>

      <Table<OperationLogEntry>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{ emptyText: "暂无操作记录" }}
        expandable={{
          expandedRowKeys,
          onExpandedRowsChange: (keys) => setExpandedRowKeys(keys ? [...keys] : []),
          expandedRowRender: (record) => (
            <div style={{ padding: "8px 16px", background: "#fafafa" }}>
              {record.details && <Typography.Paragraph>{record.details}</Typography.Paragraph>}
              {record.module === "metrics_qa" && (
                <Typography.Paragraph>
                  {record.resultSource != null && <>结果来源：<Tag color={record.resultSource === "大模型" ? "blue" : "green"}>{record.resultSource}</Tag></>}
                  {record.metricsQAQuestionId != null && <> 问数 ID：{record.metricsQAQuestionId}</>}
                  {record.metricsQABoundSkillNames != null && record.metricsQABoundSkillNames !== "" && <> 绑定 Skill：{record.metricsQABoundSkillNames}</>}
                  {record.metricsQASqlEdited != null && <> 是否编辑 SQL：{record.metricsQASqlEdited ? "是" : "否"}</>}
                </Typography.Paragraph>
              )}
              {record.module === "question_labeling" && (
                <Typography.Paragraph>
                  {record.questionLabelingJobId != null && <>任务 ID：{record.questionLabelingJobId}</>}
                  {record.questionLabelingTokenTotal != null && record.questionLabelingTokenTotal > 0 && (
                    <> Token 消耗：{record.questionLabelingTokenTotal}</>
                  )}
                </Typography.Paragraph>
              )}
              {record.failReason && (
                <Typography.Text type="danger">失败原因：{record.failReason}</Typography.Text>
              )}
              {!record.details && !record.failReason && record.module !== "metrics_qa" && record.module !== "question_labeling" && (
                <Typography.Text type="secondary">无更多详情</Typography.Text>
              )}
            </div>
          ),
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Space size="middle">
          <Typography.Text type="secondary">共 {total} 条</Typography.Text>
          {total > 0 && byModule.length > 0 && (
            <Typography.Text type="secondary">
              占比：
              {byModule
                .map((m) => `${m.moduleName} ${((m.count / total) * 100).toFixed(0)}%`)
                .join("、")}
            </Typography.Text>
          )}
        </Space>
        {total > 0 && (
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            showQuickJumper
            showTotal={(t) => `共 ${t} 条`}
            pageSizeOptions={["10", "20", "50"]}
            onChange={(p, size) => {
              setPage(p);
              setPageSize(size || 20);
              void load({ page: p, pageSize: size || 20 });
            }}
          />
        )}
      </div>
    </Space>
  );
}

function ModelUsageTab({ onJumpToOps }: { onJumpToOps: (operationLogId?: string) => void }) {
  const [timeRange, setTimeRange] = useState<ModelUsageFilter["timeRange"]>("7d");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [operatorId, setOperatorId] = useState<string | undefined>();
  const [module, setModule] = useState<OperationLogModule | undefined>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof domainApi.getModelUsageStats>> | null>(null);
  const [usageOperators, setUsageOperators] = useState<{ operatorId: string; operatorName: string }[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const filter: ModelUsageFilter = {
        timeRange,
        startDate: timeRange === "custom" && dateRange ? dateRange[0] : undefined,
        endDate: timeRange === "custom" && dateRange ? dateRange[1] : undefined,
        operatorId: operatorId?.trim() || undefined,
        module,
        page: 1,
        pageSize: 20,
      };
      const res = await domainApi.getModelUsageStats(filter);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUsageOperators(domainApi.getModelUsageOperators());
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on filter change
  }, [timeRange, dateRange, operatorId, module]);

  const exportExcel = () => {
    if (!data?.list?.length) return;
    const headers = ["时间", "操作人", "模块", "模型", "发送 Token", "接收 Token", "总 Token", "花费(元)"];
    const lines = data.list.map((u) =>
      [u.requestAt, u.operatorName ?? "-", u.module, u.model, u.promptTokens, u.completionTokens, u.totalTokens, u.cost].join(","),
    );
    const csv = ["\uFEFF" + headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `模型用量_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = data?.summary;
  const byDay = summary?.byDay ?? [];
  const byModule = summary?.byModule ?? [];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Select
          placeholder="时间范围"
          style={{ width: 120 }}
          value={timeRange}
          onChange={(v) => {
            setTimeRange(v);
            if (v !== "custom") setDateRange(null);
          }}
          options={TIME_RANGE_OPTIONS}
        />
        {timeRange === "custom" && (
          <DatePicker.RangePicker
            onChange={(dates) => {
              if (dates?.[0] && dates?.[1]) {
                setDateRange([dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")]);
              } else {
                setDateRange(null);
              }
            }}
          />
        )}
        <Select
          placeholder="操作人"
          allowClear
          style={{ width: 140 }}
          value={operatorId}
          onChange={setOperatorId}
          options={usageOperators.map((o) => ({ label: o.operatorName, value: o.operatorId }))}
        />
        <Select
          placeholder="所属模块"
          allowClear
          style={{ width: 140 }}
          value={module}
          onChange={setModule}
          options={MODULE_OPTIONS}
        />
        <Button onClick={() => void load()}>查询</Button>
        <Button icon={<DownloadOutlined />} disabled={!data?.list?.length} onClick={exportExcel}>
          导出用量
        </Button>
        <Button type="link" onClick={() => onJumpToOps()}>
          跳转至操作记录
        </Button>
      </Space>

      {summary && (
        <Card size="small" title="汇总">
          <Space size="large" wrap>
            <Typography.Text>调用次数：{summary.totalCalls}</Typography.Text>
            <Typography.Text>总发送 Token：{summary.totalPromptTokens}</Typography.Text>
            <Typography.Text>总接收 Token：{summary.totalCompletionTokens}</Typography.Text>
            <Typography.Text>总 Token：{summary.totalTokens}</Typography.Text>
            <Typography.Text strong>总花费（元）：{summary.totalCost.toFixed(4)}</Typography.Text>
          </Space>
        </Card>
      )}

      <Row gutter={[12, 12]}>
        {byDay.length > 0 && (
          <Col xs={24} lg={14}>
            <Card title="Token 用量趋势" size="small">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="promptTokens" name="发送" stroke="#1677ff" />
                    <Line type="monotone" dataKey="completionTokens" name="接收" stroke="#52c41a" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        )}
        {byModule.length > 0 && (
          <Col xs={24} lg={10}>
            <Card title="各模块花费占比" size="small">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byModule} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="moduleName" width={80} />
                    <Tooltip />
                    <Bar dataKey="cost" name="花费(元)" fill="#1677ff" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        )}
      </Row>

      <Card title="用量明细" size="small">
        <Table
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          dataSource={data?.list ?? []}
          locale={{ emptyText: "暂无用量数据" }}
          columns={[
            { title: "时间", dataIndex: "requestAt", width: 170 },
            { title: "操作人", dataIndex: "operatorName", width: 100 },
            { title: "模块", dataIndex: "module", width: 100 },
            { title: "模型", dataIndex: "model", width: 120 },
            { title: "发送 Token", dataIndex: "promptTokens", width: 100 },
            { title: "接收 Token", dataIndex: "completionTokens", width: 100 },
            { title: "总 Token", dataIndex: "totalTokens", width: 90 },
            { title: "花费(元)", dataIndex: "cost", width: 90, render: (v: number) => v?.toFixed(4) ?? "-" },
            {
              title: "操作",
              key: "link",
              width: 100,
              render: (_: unknown, row: { operationLogId?: string }) =>
                row.operationLogId ? (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onJumpToOps(row.operationLogId)}
                  >
                    查看操作
                  </Button>
                ) : null,
            },
          ]}
        />
      </Card>
    </Space>
  );
}
