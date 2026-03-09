import { Button, Card, Descriptions, message, Select, Space, Table, Tag, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { authApi, domainApi } from "../../../services/mockApi";
import type { QuestionLabelingJob, QuestionLabelingRow } from "../../../types/domain";

export function QuestionLabelingDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<QuestionLabelingJob | null>(null);
  const [localRows, setLocalRows] = useState<QuestionLabelingRow[]>([]);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const j = await domainApi.getQuestionLabelingJob(jobId);
      setJob(j ?? null);
      setLocalRows(j?.rows ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleManualLabelChange = (rowId: string, value: string) => {
    setLocalRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, manualLabel: value || undefined } : r)),
    );
  };

  const handleSave = async () => {
    if (!jobId) return;
    setSaving(true);
    try {
      await domainApi.updateQuestionLabelingJobManualLabels(
        jobId,
        localRows.map((r) => ({ id: r.id, manualLabel: r.manualLabel })),
      );
      message.success("保存成功");
      void load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!job) return;
    const rowsWithManual = job.rows.map((r) => {
      const local = localRows.find((l) => l.id === r.id);
      return {
        ...r,
        manualLabel: local?.manualLabel ?? r.manualLabel,
      };
    });
    try {
      const res = await fetch("/api/question-labeling/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: { ...job, rows: rowsWithManual } }),
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
      const session = authApi.getSessionSync();
      domainApi.appendOperationLog({
        module: "question_labeling",
        moduleName: "样本打标",
        actionType: "导出",
        actionSummary: "导出打标结果 Excel",
        relatedObject: job.name ?? job.id,
        operator: session?.displayName ?? session?.username ?? "未登录",
        operatorId: session?.userId,
        status: "成功",
        questionLabelingJobId: job.id,
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "导出失败");
    }
  };

  const labelOptions = [
    ...(job?.referenceLabels ?? []).map((l) => ({ label: l, value: l })),
    { label: "未分类", value: "未分类" },
  ];

  const columns = [
    { title: "触点", dataIndex: "touchpoint", key: "touchpoint", width: 90, ellipsis: true },
    { title: "省分", dataIndex: "province", key: "province", width: 80 },
    { title: "会话摘要", dataIndex: "sessionSummary", key: "sessionSummary", ellipsis: true, width: 180 },
    { title: "知识标题", dataIndex: "knowledgeTitle", key: "knowledgeTitle", width: 120, ellipsis: true },
    { title: "问题总结", dataIndex: "summary", key: "summary", ellipsis: true, width: 160 },
    {
      title: "模型打标",
      dataIndex: "modelLabel",
      key: "modelLabel",
      width: 100,
      render: (v: string) => <Tag>{v || "—"}</Tag>,
    },
    {
      title: "人工复核/二次打标",
      key: "manualLabel",
      width: 160,
      render: (_: unknown, record: QuestionLabelingRow) => (
        <Select
          placeholder="选择分类"
          allowClear
          style={{ width: "100%" }}
          value={record.manualLabel ?? undefined}
          options={labelOptions}
          onChange={(val) => handleManualLabelChange(record.id, val ?? "")}
        />
      ),
    },
  ];

  if (!jobId || (job === null && !loading)) {
    return <Card title="打标结果">未找到该任务</Card>;
  }

  return (
    <Card
      title={job?.name ?? jobId}
      loading={loading}
      extra={
        <Space>
          <Button onClick={() => window.history.back()}>返回列表</Button>
          <Button loading={saving} type="primary" onClick={() => void handleSave()}>
            保存人工复核
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => void handleExport()}>
            导出 Excel
          </Button>
        </Space>
      }
    >
      {job && (
        <>
          <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="任务 ID">{job.id}</Descriptions.Item>
            <Descriptions.Item label="参考分类数">{job.referenceLabels?.length ?? 0}</Descriptions.Item>
            <Descriptions.Item label="问题数">{job.rows?.length ?? 0}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{job.createdAt}</Descriptions.Item>
            <Descriptions.Item label="创建人">{job.createdByName ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="参考分类" span={3}>
              <Typography.Text
                ellipsis={{ tooltip: (job.referenceLabels ?? []).join("、") || "—" }}
                style={{ display: "block" }}
              >
                {(job.referenceLabels ?? []).join("、") || "—"}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
          <Table
            size="small"
            dataSource={localRows}
            rowKey="id"
            columns={columns}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 900 }}
          />
        </>
      )}
    </Card>
  );
}
