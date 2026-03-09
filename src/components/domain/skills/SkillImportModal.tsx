import { Alert, Button, Form, Input, Modal, Select, Space, Upload, message } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { useState } from "react";
import { domainApi } from "../../../services/mockApi";
import type { SkillItem } from "../../../types/domain";
import { detectSkillFailurePattern } from "../../../utils/skillFailurePattern";

interface SkillImportModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
  currentUserId?: string;
  currentUserName: string;
}

interface DraftShape {
  name?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  applicableScenes?: string[];
  category?: string;
  triggerCondition?: string;
  inputSpec?: string;
  steps?: string;
  checkCriteria?: string;
  abortCondition?: string;
  recoveryMethod?: string;
}

export function SkillImportModal({
  open,
  onCancel,
  onSuccess,
  currentUserId,
  currentUserName,
}: SkillImportModalProps) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [generatingChecklist, setGeneratingChecklist] = useState(false);
  const [importSource, setImportSource] = useState<"file_md" | "file_docx" | "file_xlsx">("file_md");
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<DraftShape>();

  const beforeUpload = (file: File) => {
    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".md") && !name.endsWith(".doc") && !name.endsWith(".docx") && !name.endsWith(".pdf") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      message.error("仅支持 .md、.doc、.docx、.pdf、.xlsx、.xls 文件");
      return Upload.LIST_IGNORE;
    }
    setFileList([{ uid: file.name, name: file.name, status: "done", originFileObj: file as unknown as UploadFile["originFileObj"] }]);
    return false;
  };

  const doParse = async () => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      message.warning("请先选择文件");
      return;
    }
    setParsing(true);
    setParseError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/skills/import/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setParseError(data.detail || data.error || "解析失败");
        return;
      }
      const d = (data.draft || {}) as DraftShape;
      const ext = (file.name || "").toLowerCase();
      setImportSource(ext.endsWith(".xlsx") || ext.endsWith(".xls") ? "file_xlsx" : ext.endsWith(".md") ? "file_md" : "file_docx");
      form.setFieldsValue({
        name: d.name ?? "",
        summary: d.summary ?? "",
        content: d.content ?? "",
        tags: d.tags ?? [],
        applicableScenes: d.applicableScenes ?? [],
        category: d.category ?? "用户创建",
        triggerCondition: d.triggerCondition ?? "",
        inputSpec: d.inputSpec ?? "",
        steps: d.steps ?? "",
        checkCriteria: d.checkCriteria ?? "",
        abortCondition: d.abortCondition ?? "",
        recoveryMethod: d.recoveryMethod ?? "",
      });
      setStep("preview");
      setGeneratingChecklist(true);
      try {
        const genRes = await fetch("/api/skills/import/generate-checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft: { name: d.name, summary: d.summary, content: d.content },
          }),
        });
        const genData = await genRes.json();
        if (genRes.ok && genData.success && genData.draft) {
          const draftOut = genData.draft as DraftShape;
          form.setFieldsValue({
            name: draftOut.name ?? form.getFieldValue("name"),
            summary: draftOut.summary ?? form.getFieldValue("summary"),
            triggerCondition: draftOut.triggerCondition ?? "",
            inputSpec: draftOut.inputSpec ?? "",
            steps: draftOut.steps ?? "",
            checkCriteria: draftOut.checkCriteria ?? "",
            abortCondition: draftOut.abortCondition ?? "",
            recoveryMethod: draftOut.recoveryMethod ?? "",
          });
          message.success("已通过 Kimi 生成 6 项检查清单，可直接保存入库");
        } else {
          message.info("检查清单生成失败，将保存为空，可在 Skill 详情中补充");
        }
      } catch {
        message.info("AI 生成检查清单不可用，将保存为空，可在 Skill 详情中补充");
      } finally {
        setGeneratingChecklist(false);
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "解析请求失败");
    } finally {
      setParsing(false);
    }
  };

  const handleCancel = () => {
    setStep("upload");
    setFileList([]);
    setParseError(null);
    form.resetFields();
    onCancel();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const warning = detectSkillFailurePattern(
      values.triggerCondition ?? "",
      values.steps ?? "",
    );
    if (warning) {
      message.warning(warning);
    }
    setSaving(true);
    try {
      const payload: SkillItem = {
        id: "",
        name: values.name ?? "",
        summary: values.summary ?? "",
        content: values.content ?? "",
        category: (values.category as SkillItem["category"]) ?? "用户创建",
        tags: values.tags ?? [],
        applicableScenes: values.applicableScenes ?? [],
        source: "user",
        author: currentUserName,
        updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        status: "enabled",
        isCustom: true,
        createdByUserId: currentUserId,
        importSource,
        triggerCondition: values.triggerCondition ?? "",
        inputSpec: values.inputSpec ?? "",
        steps: values.steps ?? "",
        checkCriteria: values.checkCriteria ?? "",
        abortCondition: values.abortCondition ?? "",
        recoveryMethod: values.recoveryMethod ?? "",
      };
      await domainApi.saveSkill(payload, currentUserName, currentUserId, {
        operator: currentUserName,
        operatorId: currentUserId ?? undefined,
      });
      domainApi.appendOperationLog({
        module: "skill_lib",
        moduleName: "Skill 库",
        actionType: "导入",
        actionSummary: `导入 1 条 Skill（${importSource === "file_xlsx" ? "Excel" : importSource === "file_md" ? "MD" : "Word"} 格式）`,
        relatedObject: payload.name,
        operator: currentUserName,
        operatorId: currentUserId,
        status: "成功",
      });
      message.success("Skill 导入成功");
      await onSuccess();
      handleCancel();
    } catch (e) {
      domainApi.appendOperationLog({
        module: "skill_lib",
        moduleName: "Skill 库",
        actionType: "导入",
        actionSummary: `导入 Skill（${importSource === "file_xlsx" ? "Excel" : importSource === "file_md" ? "MD" : "Word"} 格式）`,
        operator: currentUserName,
        operatorId: currentUserId,
        status: "失败",
        failReason: e instanceof Error ? e.message : "导入失败",
      });
      message.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = [
    { label: "用户创建", value: "用户创建" },
    { label: "官方推荐", value: "官方推荐" },
    { label: "开发提效", value: "开发提效" },
    { label: "数据分析", value: "数据分析" },
    { label: "Agent 编排", value: "Agent 编排" },
  ];

  return (
    <Modal title="从文件导入 Skill" open={open} width={720} footer={null} onCancel={handleCancel} destroyOnClose>
      {step === "upload" && (
        <>
          <Upload.Dragger
            accept=".md,.doc,.docx,.pdf,.xlsx,.xls"
            fileList={fileList}
            beforeUpload={beforeUpload}
            onRemove={() => setFileList([])}
            maxCount={1}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 .md / .doc / .docx / .pdf / .xlsx / .xls 文件到此区域</p>
          </Upload.Dragger>
          {parseError && (
            <Alert style={{ marginTop: 12 }} type="error" showIcon message={parseError} description="请检查文件格式与内容后重试" />
          )}
          <div style={{ marginTop: 16, textAlign: "right" }}>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={parsing} disabled={fileList.length === 0} onClick={() => void doParse()}>
              解析并预览
            </Button>
          </div>
        </>
      )}
      {step === "preview" && (
        <>
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            message={importSource === "file_xlsx" ? "来自 Excel 的 4 个 Sheet 已自动填入，6 项检查清单已由 Kimi 根据文件内容生成，可修改名称/标签后保存入库" : "解析完成，6 项检查清单已由 Kimi 根据文件内容生成，请核对名称与场景标签后保存入库"}
          />
          <Form form={form} layout="vertical">
            <Form.Item label="Skill 名称" name="name" rules={[{ required: true, message: "请输入名称" }]}>
              <Input placeholder="Skill 名称" />
            </Form.Item>
            <Form.Item label="摘要" name="summary" rules={[{ required: true, message: "请输入摘要" }]}>
              <Input.TextArea rows={2} placeholder="摘要" />
            </Form.Item>
            <Form.Item label="分类" name="category">
              <Select options={categoryOptions} />
            </Form.Item>
            <Form.Item label="标签" name="tags">
              <Select mode="tags" placeholder="输入标签后回车" />
            </Form.Item>
            <Form.Item label="适用场景" name="applicableScenes">
              <Select mode="tags" placeholder="输入场景后回车" />
            </Form.Item>
            {generatingChecklist && (
              <Alert style={{ marginBottom: 12 }} type="info" showIcon message="正在生成检查清单…" />
            )}
            <Form.Item label="完整内容" name="content" rules={[{ required: true, message: "请输入内容" }]}>
              <Input.TextArea rows={6} placeholder="Skill 内容" />
            </Form.Item>
          </Form>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between" }}>
            <Button onClick={() => { setStep("upload"); setParseError(null); }}>上一步</Button>
            <Space>
              <Button onClick={handleCancel}>取消</Button>
              <Button type="primary" loading={saving} onClick={() => void handleSubmit()}>保存入库</Button>
            </Space>
          </div>
        </>
      )}
    </Modal>
  );
}
