import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Radio, Select, Space, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authApi, domainApi } from "../../../services/mockApi";
import { setGlossaryTerms } from "../../../store/domainSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { GlossaryTerm } from "../../../types/domain";

type GlossaryFormValues = Omit<GlossaryTerm, "id" | "updatedBy" | "updatedAt" | "status" | "references"> & {
  ontologyClass?: string;
  attributes?: { key: string; value: string }[];
  relations?: { type: "synonym" | "hypernym" | "hyponym"; targetTermId: string }[];
};

export function GlossaryFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const knowledgeSystems = useAppSelector((state) => state.domain.knowledgeSystems);
  const allTerms = useAppSelector((state) => state.domain.glossaryTerms);
  const [form] = Form.useForm<GlossaryFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [linkedMetricIds, setLinkedMetricIds] = useState<string[]>([]);
  const [linkedDimensionIds, setLinkedDimensionIds] = useState<string[]>([]);
  const [linkedMetricSystemId, setLinkedMetricSystemId] = useState<string | null>(null);
  const [linkedDimensionSystemId, setLinkedDimensionSystemId] = useState<string | null>(null);

  const isEdit = Boolean(id);

  useEffect(() => {
    if (!id) return;
    void domainApi.getLinksByGlossaryTerm(id).then(({ metricIds, dimensionIds }) => {
      setLinkedMetricIds(metricIds);
      setLinkedDimensionIds(dimensionIds);
      if (metricIds.length > 0) {
        setLinkedMetricSystemId(domainApi.getMetricSystemId(metricIds[0]) ?? null);
      } else {
        setLinkedMetricSystemId(null);
      }
      if (dimensionIds.length > 0) {
        setLinkedDimensionSystemId(domainApi.getDimensionSystemId(dimensionIds[0]) ?? null);
      } else {
        setLinkedDimensionSystemId(null);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const detail = await domainApi.getGlossaryTermById(id);
        if (!detail) {
          messageApi.warning("未找到术语，已返回列表页");
          navigate("/domain/glossary", { replace: true });
          return;
        }
        const session = authApi.getSessionSync();
        const operator = session?.displayName ?? session?.username ?? "未登录";
        domainApi.appendOperationLog({
          module: "glossary",
          moduleName: "业务术语词典",
          actionType: "查看",
          actionSummary: "查看术语",
          relatedObject: detail.term,
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
        form.setFieldsValue({
          knowledgeSystemId: detail.knowledgeSystemId,
          knowledgeSystemName: detail.knowledgeSystemName,
          term: detail.term,
          termType: detail.termType,
          description: detail.description,
          fieldMapping: detail.fieldMapping,
          synonyms: detail.synonyms,
          exampleUsage: detail.exampleUsage,
          valueMapping: detail.valueMapping,
          sqlSnippet: detail.sqlSnippet,
          ontologyClass: detail.ontologyClass,
          attributes: detail.attributes ?? [],
          relations: detail.relations ?? [],
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [form, id, messageApi, navigate]);

  const onSubmit = async (values: GlossaryFormValues) => {
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    const selectedSystem = knowledgeSystems.find((item) => item.id === values.knowledgeSystemId);
    const payload: GlossaryTerm = {
      id: id ?? "",
      ...values,
      knowledgeSystemName: selectedSystem?.name ?? values.knowledgeSystemName,
      updatedBy: "赵金慧",
      updatedAt: "",
      status: "enabled",
      references: [],
      ontologyClass: values.ontologyClass,
      attributes: values.attributes,
      relations: values.relations,
    };
    try {
      const list = await domainApi.saveGlossaryTerm(payload);
      dispatch(setGlossaryTerms(list));
      domainApi.appendOperationLog({
        module: "glossary",
        moduleName: "业务术语词典",
        actionType: isEdit ? "编辑" : "新增",
        actionSummary: isEdit ? "编辑术语" : "新增术语",
        relatedObject: payload.term,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      messageApi.success(isEdit ? "术语更新成功" : "术语创建成功");
      navigate("/domain/glossary");
    } catch (e) {
      const text = e instanceof Error ? e.message : "未知错误";
      domainApi.appendOperationLog({
        module: "glossary",
        moduleName: "业务术语词典",
        actionType: isEdit ? "编辑" : "新增",
        actionSummary: isEdit ? "编辑术语" : "新增术语",
        relatedObject: payload.term,
        operator,
        operatorId: session?.userId,
        status: "失败",
        failReason: text,
      });
      messageApi.error(text);
    }
  };

  return (
    <>
      {contextHolder}
      <Card
        loading={loading}
        title={isEdit ? "编辑术语" : "新增术语"}
        extra={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/domain/glossary")}>
            返回
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            void onSubmit(values);
          }}
          initialValues={{
            termType: "全局",
            synonyms: [],
            valueMapping: "{}",
            sqlSnippet: "",
            attributes: [],
            relations: [],
          }}
        >
          <Form.Item
            label="所属知识库"
            name="knowledgeSystemId"
            rules={[{ required: true, message: "请选择知识库" }]}
          >
            <Select
              placeholder="请选择所属知识库"
              options={knowledgeSystems.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Form.Item>
          <Form.Item label="术语" name="term" rules={[{ required: true, message: "请输入术语" }]}>
            <Input placeholder="请输入术语" />
          </Form.Item>
          <Form.Item label="术语类型" name="termType">
            <Radio.Group
              options={[
                { label: "全局", value: "全局" },
                { label: "智能匹配", value: "智能匹配" },
              ]}
            />
          </Form.Item>
          <Form.Item label="层级分类（本体）" name="ontologyClass">
            <Select
              placeholder="可选，选择层级分类"
              allowClear
              options={[
                { label: "指标", value: "指标" },
                { label: "维度", value: "维度" },
                { label: "实体", value: "实体" },
                { label: "属性", value: "属性" },
              ]}
            />
          </Form.Item>
          <Form.Item label="属性定义（键值对）">
            <Form.List name="attributes">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => (
                    <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                      <Form.Item {...rest} name={[name, "key"]} rules={[{ required: true, message: "键" }]}>
                        <Input placeholder="键" style={{ width: 120 }} />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, "value"]} rules={[{ required: true, message: "值" }]}>
                        <Input placeholder="值" style={{ width: 160 }} />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)}>
                        删除
                      </Button>
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add()} block>
                    + 添加属性
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item label="关联关系（同义/上下位）">
            <Form.List name="relations">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => (
                    <Space key={key} style={{ display: "flex", marginBottom: 8 }} align="baseline">
                      <Form.Item {...rest} name={[name, "type"]} rules={[{ required: true }]}>
                        <Select
                          placeholder="关系类型"
                          style={{ width: 120 }}
                          options={[
                            { label: "同义", value: "synonym" },
                            { label: "上位", value: "hypernym" },
                            { label: "下位", value: "hyponym" },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, "targetTermId"]} rules={[{ required: true, message: "请选择目标术语" }]}>
                        <Select
                          placeholder="目标术语"
                          style={{ width: 200 }}
                          showSearch
                          optionFilterProp="label"
                          options={allTerms
                            .filter((t) => t.id !== id)
                            .map((t) => ({ label: t.term, value: t.id }))}
                        />
                      </Form.Item>
                      <Button type="text" danger onClick={() => remove(name)}>
                        删除
                      </Button>
                    </Space>
                  ))}
                  <Button type="dashed" onClick={() => add()} block>
                    + 添加关系
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item label="解释说明" name="description" rules={[{ required: true, message: "请输入解释说明" }]}>
            <Input.TextArea rows={3} placeholder="请输入用于避免歧义的解释说明" />
          </Form.Item>
          <Form.Item
            label="对应字段"
            name="fieldMapping"
            rules={[
              { required: true, message: "请输入对应字段" },
              { pattern: /^[a-zA-Z_][\w]*\.[a-zA-Z_][\w]*$/, message: "格式需为 table.column" },
            ]}
          >
            <Input placeholder="table.column" />
          </Form.Item>
          <Form.Item label="同义词列表（选填）" name="synonyms">
            <Select mode="tags" placeholder="输入后回车添加多个同义词，可不填" />
          </Form.Item>
          <Form.Item label="示例用法" name="exampleUsage">
            <Input.TextArea rows={3} placeholder="请输入包含术语的示例问题" />
          </Form.Item>
          <Form.Item
            label="值映射（JSON）"
            name="valueMapping"
            rules={[
              {
                validator(_, value) {
                  if (!value) {
                    return Promise.resolve();
                  }
                  try {
                    JSON.parse(value);
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(new Error("请输入合法 JSON"));
                  }
                },
              },
            ]}
          >
            <Input.TextArea rows={4} placeholder='{"A":"套餐A","B":"套餐B"}' />
          </Form.Item>
          <Form.Item label="SQL 片段" name="sqlSnippet">
            <Input.TextArea rows={4} placeholder="复杂指标 SQL 表达式" />
          </Form.Item>
          <Space>
            <Button onClick={() => navigate("/domain/glossary")}>取消</Button>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存
            </Button>
          </Space>
        </Form>
        {isEdit && (
          <Card size="small" title="关联的指标/维度" style={{ marginTop: 16 }}>
            {linkedMetricIds.length > 0 || linkedDimensionIds.length > 0 ? (
              <Space wrap>
                {linkedMetricIds.length > 0 && linkedMetricSystemId && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate(`/domain/knowledge-systems/${linkedMetricSystemId}/manage/metrics`)}
                  >
                    关联指标 {linkedMetricIds.length} 条（跳转至语义知识管理）
                  </Button>
                )}
                {linkedDimensionIds.length > 0 && linkedDimensionSystemId && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate(`/domain/knowledge-systems/${linkedDimensionSystemId}/manage/dimensions`)}
                  >
                    关联维度 {linkedDimensionIds.length} 条（跳转至语义知识管理）
                  </Button>
                )}
              </Space>
            ) : (
              <Typography.Text type="secondary">暂无关联的指标或维度</Typography.Text>
            )}
          </Card>
        )}
      </Card>
    </>
  );
}
