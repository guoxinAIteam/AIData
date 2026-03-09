import { Button, Card, message, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { QuestionLabelingCreateModal } from "../../../components/domain/questionLabeling/QuestionLabelingCreateModal";
import { authApi, domainApi } from "../../../services/mockApi";
import { useAppSelector } from "../../../store/hooks";
import type { QuestionLabelingJob } from "../../../types/domain";

const POLL_INTERVAL_MS = 2000;

function isJobRunning(job: QuestionLabelingJob): boolean {
  const total = job.rows?.length ?? 0;
  if (total === 0) return false;
  const done = job.rows?.filter((r) => r.modelLabel != null && r.modelLabel !== "").length ?? 0;
  return done < total;
}

function getJobProgress(job: QuestionLabelingJob): string {
  const total = job.rows?.length ?? 0;
  if (total === 0) return "—";
  const done = job.rows?.filter((r) => r.modelLabel != null && r.modelLabel !== "").length ?? 0;
  if (done >= total) return "已完成";
  return `打标中 ${done}/${total}`;
}

export function QuestionLabelingListPage() {
  const navigate = useNavigate();
  const session = useAppSelector((state) => state.auth.session);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<QuestionLabelingJob[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggedCompletionRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await domainApi.getQuestionLabelingJobs();
      setJobs(list);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/question-labeling/${jobId}`);
      const data = await res.json();
      if (!res.ok || !data.success || !data.job) return;
      const serverJob = data.job as QuestionLabelingJob;
      await domainApi.updateQuestionLabelingJob(jobId, serverJob);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...serverJob, id: jobId } : j)),
      );
      const total = serverJob.rows?.length ?? 0;
      const done = serverJob.rows?.filter((r) => r.modelLabel != null && r.modelLabel !== "").length ?? 0;
      const isComplete = total > 0 && done >= total;
      if (isComplete && !loggedCompletionRef.current.has(jobId)) {
        loggedCompletionRef.current.add(jobId);
        const session = authApi.getSessionSync();
        const operator = session?.displayName ?? session?.username ?? "未登录";
        const operatorId = session?.userId;
        const totalTokens = (serverJob.totalPromptTokens ?? 0) + (serverJob.totalCompletionTokens ?? 0);
        const logEntry = domainApi.appendOperationLog({
          module: "question_labeling",
          moduleName: "样本打标",
          actionType: "新增",
          actionSummary: "打标完成",
          relatedObject: serverJob.name ?? jobId,
          operator,
          operatorId,
          status: "成功",
          questionLabelingJobId: jobId,
          questionLabelingTokenTotal: totalTokens > 0 ? totalTokens : undefined,
        });
        if (totalTokens > 0 && (serverJob.totalPromptTokens != null || serverJob.totalCompletionTokens != null)) {
          domainApi.appendModelUsage({
            operatorId,
            operatorName: operator,
            module: "question_labeling",
            operationLogId: logEntry.id,
            model: "moonshot-v1-8k",
            requestAt: serverJob.updatedAt ?? new Date().toISOString().slice(0, 19).replace("T", " "),
            promptTokens: serverJob.totalPromptTokens ?? 0,
            completionTokens: serverJob.totalCompletionTokens ?? 0,
            totalTokens,
            cost: 0,
          });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const runningIds = jobs.filter(isJobRunning).map((j) => j.id);
    if (runningIds.length === 0) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    const tick = () => {
      runningIds.forEach((id) => void pollJob(id));
    };
    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [jobs, pollJob]);

  const handleExport = async (job: QuestionLabelingJob) => {
    try {
      const res = await fetch("/api/question-labeling/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || "导出失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `打标结果_${job.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("导出成功");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await domainApi.deleteQuestionLabelingJob(jobId);
      message.success("已删除");
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const columns = [
    {
      title: "任务名称",
      dataIndex: "name",
      key: "name",
      render: (_: unknown, record: QuestionLabelingJob) => (
        <Typography.Link onClick={() => navigate(`/domain/question-labeling/${record.id}`)}>
          {record.name || record.id}
        </Typography.Link>
      ),
    },
    {
      title: "状态",
      key: "status",
      width: 120,
      render: (_: unknown, record: QuestionLabelingJob) => {
        const running = isJobRunning(record);
        return (
          <Space>
            {running ? <LoadingOutlined spin /> : null}
            <Tag color={running ? "processing" : "success"}>{getJobProgress(record)}</Tag>
          </Space>
        );
      },
    },
    {
      title: "参考分类数",
      dataIndex: "referenceLabels",
      key: "referenceLabels",
      width: 100,
      render: (labels: string[]) => labels?.length ?? 0,
    },
    {
      title: "问题数",
      dataIndex: "rows",
      key: "rows",
      width: 90,
      render: (rows: QuestionLabelingJob["rows"]) => rows?.length ?? 0,
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
    },
    {
      title: "创建人",
      dataIndex: "createdByName",
      key: "createdByName",
      width: 100,
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      render: (_: unknown, record: QuestionLabelingJob) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/domain/question-labeling/${record.id}`)}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => void handleExport(record)}
          >
            导出
          </Button>
          <Popconfirm
            title="确定删除该打标任务？"
            onConfirm={() => void handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="样本打标"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建打标
        </Button>
      }
    >
      {jobs.length === 0 && !loading ? (
        <EmptyState description="暂无打标任务，点击「新建打标」上传参考问题分类表与样例问题清单，由大模型打标后将在此展示" />
      ) : (
        <Table
          loading={loading}
          dataSource={jobs}
          rowKey="id"
          columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      )}
      <QuestionLabelingCreateModal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          void load();
        }}
        currentUserId={session?.userId}
        currentUserName={session?.displayName ?? session?.username ?? "当前用户"}
      />
    </Card>
  );
}
