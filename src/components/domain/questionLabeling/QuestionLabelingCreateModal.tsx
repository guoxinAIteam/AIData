import { Alert, Button, Input, Modal, Table, Tag, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { useState } from "react";
import { domainApi } from "../../../services/mockApi";
import type { QuestionLabelingJob } from "../../../types/domain";

interface QuestionLabelingCreateModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess?: () => void | Promise<void>;
  currentUserId?: string;
  currentUserName: string;
}

type SampleRow = {
  touchpoint: string;
  sessionTag: string;
  sessionSummary: string;
  knowledgeTitle: string;
  knowledgeAnswer: string;
  province: string;
};

export function QuestionLabelingCreateModal({
  open,
  onCancel,
  onSuccess,
  currentUserId,
  currentUserName,
}: QuestionLabelingCreateModalProps) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [refFileList, setRefFileList] = useState<UploadFile[]>([]);
  const [sampleFileList, setSampleFileList] = useState<UploadFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [referenceLabels, setReferenceLabels] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<SampleRow[]>([]);
  const [taskName, setTaskName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleParse = async () => {
    const refFile = refFileList[0]?.originFileObj as File | undefined;
    const sampleFile = sampleFileList[0]?.originFileObj as File | undefined;
    if (!refFile || !sampleFile) {
      message.warning("请同时上传「参考问题分类表」和「样例问题清单」");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("reference", refFile);
      formData.append("sample", sampleFile);
      const res = await fetch("/api/question-labeling/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setParseError(data.detail || data.error || "解析失败");
        return;
      }
      setReferenceLabels(data.referenceLabels ?? []);
      setSampleRows(data.sampleRows ?? []);
      setStep("preview");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "解析请求失败");
    } finally {
      setParsing(false);
    }
  };

  const handleRun = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/question-labeling/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: taskName.trim() || undefined,
          referenceLabels,
          sampleRows,
          createdByUserId: currentUserId,
          createdByName: currentUserName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        message.error(data.detail || data.error || "创建打标任务失败");
        return;
      }
      const job = data.job as QuestionLabelingJob;
      await domainApi.createQuestionLabelingJob(job);
      domainApi.appendOperationLog({
        module: "question_labeling",
        moduleName: "样本打标",
        actionType: "新增",
        actionSummary: "创建打标任务",
        relatedObject: job.name ?? job.id,
        operator: currentUserName,
        operatorId: currentUserId,
        status: "成功",
        questionLabelingJobId: job.id,
      });
      message.success("打标任务已创建，正在后台打标，请在列表中查看进度");
      handleCancel();
      await onSuccess?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "创建打标任务失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setStep("upload");
    setRefFileList([]);
    setSampleFileList([]);
    setParseError(null);
    setReferenceLabels([]);
    setSampleRows([]);
    setTaskName("");
    onCancel();
  };

  const columns = [
    { title: "触点", dataIndex: "touchpoint", key: "touchpoint", width: 80, ellipsis: true },
    { title: "省分", dataIndex: "province", key: "province", width: 80 },
    { title: "会话标签", dataIndex: "sessionTag", key: "sessionTag", width: 100, ellipsis: true },
    { title: "会话摘要", dataIndex: "sessionSummary", key: "sessionSummary", ellipsis: true },
    { title: "知识标题", dataIndex: "knowledgeTitle", key: "knowledgeTitle", width: 120, ellipsis: true },
  ];

  return (
    <Modal
      title="样例问题打标"
      open={open}
      width={800}
      footer={null}
      onCancel={handleCancel}
      destroyOnClose
    >
      {step === "upload" && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="请上传两个 Excel：参考问题分类表（A 列为分类标签）、样例问题清单（A/E/F/G/H/I 列）。解析后将预览并调用大模型打标。" />
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>参考问题分类表</div>
            <Upload.Dragger
              accept=".xlsx,.xls"
              fileList={refFileList}
              beforeUpload={(file) => {
                setRefFileList([{ uid: file.name, name: file.name, status: "done", originFileObj: file as unknown as UploadFile["originFileObj"] }]);
                return false;
              }}
              onRemove={() => setRefFileList([])}
              maxCount={1}
            >
              <p className="ant-upload-text">点击或拖拽 .xlsx / .xls 到此</p>
            </Upload.Dragger>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>样例问题清单</div>
            <Upload.Dragger
              accept=".xlsx,.xls"
              fileList={sampleFileList}
              beforeUpload={(file) => {
                setSampleFileList([{ uid: file.name, name: file.name, status: "done", originFileObj: file as unknown as UploadFile["originFileObj"] }]);
                return false;
              }}
              onRemove={() => setSampleFileList([])}
              maxCount={1}
            >
              <p className="ant-upload-text">点击或拖拽 .xlsx / .xls 到此</p>
            </Upload.Dragger>
          </div>
          {parseError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={parseError} />}
          <div style={{ textAlign: "right" }}>
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              loading={parsing}
              disabled={refFileList.length === 0 || sampleFileList.length === 0}
              onClick={() => void handleParse()}
            >
              解析并预览
            </Button>
          </div>
        </>
      )}
      {step === "preview" && (
        <>
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message="请确认解析结果，填写任务名称（可选）后点击「开始打标」，将调用 Kimi 对每条问题做总结与分类打标。" />
          <div style={{ marginBottom: 8 }}>
            任务名称（可选）
            <Input
              placeholder="打标任务名称"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              style={{ marginTop: 4, maxWidth: 400 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            参考分类标签（{referenceLabels.length} 个）
            <div style={{ marginTop: 4 }}>
              {referenceLabels.slice(0, 20).map((l) => (
                <Tag key={l}>{l}</Tag>
              ))}
              {referenceLabels.length > 20 && <span>… 等 {referenceLabels.length} 个</span>}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            样例问题（{sampleRows.length} 条）
            <Table
              size="small"
              dataSource={sampleRows.slice(0, 5).map((r, i) => ({ ...r, key: i }))}
              columns={columns}
              pagination={false}
              style={{ marginTop: 8 }}
            />
            {sampleRows.length > 5 && <div style={{ marginTop: 4 }}>… 共 {sampleRows.length} 条</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Button onClick={() => setStep("upload")}>上一步</Button>
            <div>
              <Button onClick={handleCancel}>取消</Button>
              <Button type="primary" loading={submitting} onClick={() => void handleRun()}>
                开始打标
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
