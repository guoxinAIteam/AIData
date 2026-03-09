import { Alert, Form, Input, Modal, Select, Switch, message } from "antd";
import type { SkillItem } from "../../../types/domain";
import { detectSkillFailurePattern } from "../../../utils/skillFailurePattern";

interface SkillEditModalProps {
  open: boolean;
  editingSkill: SkillItem | null;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: SkillItem) => Promise<void>;
}

interface SkillEditFormValues {
  name: string;
  summary: string;
  category: SkillItem["category"];
  tags: string[];
  applicableScenes: string[];
  content: string;
  status: SkillItem["status"];
  triggerCondition: string;
  inputSpec: string;
  steps: string;
  checkCriteria: string;
  abortCondition: string;
  recoveryMethod: string;
}

const categoryOptions: Array<{ label: SkillItem["category"]; value: SkillItem["category"] }> = [
  { label: "官方推荐", value: "官方推荐" },
  { label: "开发提效", value: "开发提效" },
  { label: "数据分析", value: "数据分析" },
  { label: "Agent 编排", value: "Agent 编排" },
  { label: "用户创建", value: "用户创建" },
];

export function SkillEditModal({
  open,
  editingSkill,
  confirmLoading = false,
  onCancel,
  onSubmit,
}: SkillEditModalProps) {
  const [form] = Form.useForm<SkillEditFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const isCloneMode = Boolean(editingSkill && !editingSkill.isCustom);
  const title = editingSkill ? (isCloneMode ? "另存为自定义 Skill" : "编辑 Skill") : "新增 Skill";

  return (
    <>
      {contextHolder}
    <Modal
      title={title}
      open={open}
      width={860}
      confirmLoading={confirmLoading}
      onCancel={() => {
        onCancel();
        form.resetFields();
      }}
      afterOpenChange={(visible) => {
        if (!visible) {
          return;
        }
        if (editingSkill) {
          form.setFieldsValue({
            name: editingSkill.name,
            summary: editingSkill.summary,
            category: editingSkill.isCustom ? editingSkill.category : "用户创建",
            tags: editingSkill.tags,
            applicableScenes: editingSkill.applicableScenes,
            content: editingSkill.content,
            status: editingSkill.status,
            triggerCondition: editingSkill.triggerCondition ?? "",
            inputSpec: editingSkill.inputSpec ?? "",
            steps: editingSkill.steps ?? "",
            checkCriteria: editingSkill.checkCriteria ?? "",
            abortCondition: editingSkill.abortCondition ?? "",
            recoveryMethod: editingSkill.recoveryMethod ?? "",
          });
          return;
        }
        form.setFieldsValue({
          name: "",
          summary: "",
          category: "用户创建",
          tags: [],
          applicableScenes: [],
          content: "",
          status: "enabled",
          triggerCondition: "",
          inputSpec: "",
          steps: "",
          checkCriteria: "",
          abortCondition: "",
          recoveryMethod: "",
        });
      }}
      onOk={() => {
        void form.validateFields().then(async (values) => {
          const warning = detectSkillFailurePattern(values.triggerCondition, values.steps);
          if (warning) {
            messageApi.warning(warning);
          }
          await onSubmit({
            id: editingSkill?.id ?? "",
            name: values.name,
            summary: values.summary,
            category: values.category,
            tags: values.tags ?? [],
            applicableScenes: values.applicableScenes ?? [],
            content: values.content,
            source: "user",
            sourceUrl: editingSkill?.sourceUrl,
            owner: editingSkill?.owner,
            repository: editingSkill?.repository,
            skillSlug: editingSkill?.skillSlug,
            installsText: editingSkill?.installsText,
            installsCount: editingSkill?.installsCount,
            rank: editingSkill?.rank,
            author: editingSkill?.author ?? "",
            updatedAt: editingSkill?.updatedAt ?? "",
            status: values.status,
            isCustom: true,
          });
          form.resetFields();
        });
      }}
    >
      {isCloneMode ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="当前为官方 Skill"
          description="保存后将创建一条归属当前用户的自定义副本，不会覆盖官方来源数据。"
        />
      ) : null}
      <Form form={form} layout="vertical">
        <Form.Item label="Skill 名称" name="name" rules={[{ required: true, message: "请输入 Skill 名称" }]}>
          <Input placeholder="请输入 Skill 名称" />
        </Form.Item>
        <Form.Item label="摘要" name="summary" rules={[{ required: true, message: "请输入摘要" }]}>
          <Input.TextArea rows={3} placeholder="请输入 Skill 摘要" />
        </Form.Item>
        <Form.Item label="分类" name="category" rules={[{ required: true, message: "请选择分类" }]}>
          <Select options={categoryOptions} />
        </Form.Item>
        <Form.Item label="标签" name="tags">
          <Select mode="tags" placeholder="输入标签后回车" />
        </Form.Item>
        <Form.Item label="适用场景" name="applicableScenes">
          <Select mode="tags" placeholder="输入场景后回车，可多个" />
        </Form.Item>
        <Form.Item label="完整内容" name="content" rules={[{ required: true, message: "请输入完整内容" }]}>
          <Input.TextArea rows={6} placeholder="描述该 Skill 的执行逻辑、参数、输出等" />
        </Form.Item>
        <Form.Item
          label="启用状态"
          name="status"
          valuePropName="checked"
          getValueProps={(value: SkillItem["status"]) => ({ checked: value === "enabled" })}
          normalize={(checked: boolean) => (checked ? "enabled" : "disabled")}
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
    </>
  );
}
