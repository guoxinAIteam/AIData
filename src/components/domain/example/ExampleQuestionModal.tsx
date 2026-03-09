import { Form, Input, Modal, Select } from "antd";
import type { ExampleQuestion } from "../../../types/domain";

interface ExampleQuestionModalProps {
  open: boolean;
  editing?: ExampleQuestion | null;
  onCancel: () => void;
  onSubmit: (payload: ExampleQuestion) => Promise<void>;
}

export function ExampleQuestionModal({ open, editing, onCancel, onSubmit }: ExampleQuestionModalProps) {
  const [form] = Form.useForm<ExampleQuestion>();

  return (
    <Modal
      title={editing ? "编辑示例问题" : "新增示例问题"}
      open={open}
      width={860}
      onCancel={() => {
        onCancel();
        form.resetFields();
      }}
      afterOpenChange={(visible) => {
        if (visible && editing) {
          form.setFieldsValue(editing);
        }
        if (visible && !editing) {
          form.setFieldsValue({
            id: "",
            question: "",
            sql: "",
            datasource: "MYSQL",
            status: "enabled",
            author: "赵金慧",
            updatedAt: "",
          });
        }
      }}
      onOk={() => {
        void form.validateFields().then(async (values) => {
          await onSubmit({
            ...values,
            id: editing?.id ?? "",
            updatedAt: editing?.updatedAt ?? "",
          });
          form.resetFields();
        });
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="示例问题" rules={[{ required: true, message: "请输入示例问题" }]}>
          <Input.TextArea rows={3} placeholder="请输入自然语言问题" />
        </Form.Item>
        <Form.Item name="sql" label="SQL 语句" rules={[{ required: true, message: "请输入 SQL 语句" }]}>
          <Input.TextArea rows={5} placeholder="SELECT ... FROM ... WHERE ..." />
        </Form.Item>
        <Form.Item name="datasource" label="数据源类型">
          <Select options={[{ value: "MYSQL", label: "MYSQL" }]} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
