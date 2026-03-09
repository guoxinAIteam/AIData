import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Tree,
  Typography,
  message,
} from "antd";
import type { DataNode } from "antd/es/tree";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, domainApi } from "../../../services/mockApi";
import type { GlossaryTerm, KnowledgeSystemCard as CardType, MetricItem, MetricKnowledgeLink, TreeNode } from "../../../types/domain";

interface KnowledgeMetricTabProps {
  systemId: string;
  treeData: TreeNode[];
  metrics: MetricItem[];
  onSaved?: () => void;
  isCreator?: boolean;
}

function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((n) => ({
    ...n,
    children: n.children ? cloneTree(n.children) : undefined,
  }));
}

function setNodeByKey(nodes: TreeNode[], key: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.key === key) return updater(n);
    if (n.children) return { ...n, children: setNodeByKey(n.children, key, updater) };
    return n;
  });
}

function removeNodeByKey(nodes: TreeNode[], key: string): TreeNode[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (n.children ? { ...n, children: removeNodeByKey(n.children, key) } : n));
}

function addChildByKey(nodes: TreeNode[], parentKey: string | null, title: string, newKey: string): TreeNode[] {
  if (parentKey === null) {
    return [...nodes, { key: newKey, title }];
  }
  return setNodeByKey(nodes, parentKey, (n) => ({
    ...n,
    children: [...(n.children ?? []), { key: newKey, title }],
  }));
}

const metricTypeOptions: { value: MetricItem["metricType"]; label: string }[] = [
  { value: "基础指标", label: "基础指标" },
  { value: "复合指标", label: "复合指标" },
];

export function KnowledgeMetricTab({ systemId, treeData, metrics, onSaved, isCreator = true }: KnowledgeMetricTabProps) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [selectedTreeKeys, setSelectedTreeKeys] = useState<React.Key[]>([]);
  const [treeNodeModalOpen, setTreeNodeModalOpen] = useState(false);
  const [treeNodeModalMode, setTreeNodeModalMode] = useState<"addRoot" | "addChild" | "edit">("addRoot");
  const [treeNodeForm] = Form.useForm<{ title: string }>();
  const [metricModalOpen, setMetricModalOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<MetricItem | null>(null);
  const [metricForm] = Form.useForm<Partial<MetricItem>>();
  const [saving, setSaving] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [metricLinks, setMetricLinks] = useState<MetricKnowledgeLink[]>([]);
  const [pendingMetricSyncIds, setPendingMetricSyncIds] = useState<string[]>([]);
  const [knowledgeSystems, setKnowledgeSystems] = useState<CardType[]>([]);
  const [linkGlossaryTerms, setLinkGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [linkForm] = Form.useForm<{ knowledgeSystemId: string; termIds: string[] }>();

  useEffect(() => {
    if (!systemId) return;
    void domainApi.getMetricKnowledgeLinks(systemId).then(setMetricLinks);
    void domainApi.getPendingMetricSync().then(setPendingMetricSyncIds);
    void domainApi.getKnowledgeSystems().then(setKnowledgeSystems);
  }, [systemId]);

  const linkByMetricId = useMemo(() => {
    const m: Record<string, MetricKnowledgeLink> = {};
    metricLinks.forEach((l) => (m[l.metricId] = l));
    return m;
  }, [metricLinks]);

  const filtered = useMemo(
    () => metrics.filter((item) => (keyword ? item.name.includes(keyword) || item.code.includes(keyword) : true)),
    [metrics, keyword],
  );

  const saveTree = useCallback(
    async (nextTree: TreeNode[]) => {
      try {
        const session = authApi.getSessionSync();
        await domainApi.updateKnowledgeMetricTree(systemId, nextTree, session?.userId);
        const operator = session?.displayName ?? session?.username ?? "未登录";
        domainApi.appendOperationLog({
          module: "knowledge",
          moduleName: "语义知识库",
          actionType: "编辑",
          actionSummary: "编辑指标目录树",
          relatedObject: undefined,
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
        messageApi.success("指标目录树已更新");
        onSaved?.();
      } catch (e) {
        messageApi.error(e instanceof Error ? e.message : "更新失败");
      }
    },
    [systemId, messageApi, onSaved],
  );

  const openAddRoot = () => {
    setTreeNodeModalMode("addRoot");
    treeNodeForm.setFieldsValue({ title: "" });
    setTreeNodeModalOpen(true);
  };

  const openAddChild = () => {
    if (selectedTreeKeys.length === 0) {
      messageApi.warning("请先选中一个节点");
      return;
    }
    setTreeNodeModalMode("addChild");
    treeNodeForm.setFieldsValue({ title: "" });
    setTreeNodeModalOpen(true);
  };

  const openEditNode = () => {
    if (selectedTreeKeys.length === 0) {
      messageApi.warning("请先选中一个节点");
      return;
    }
    const key = String(selectedTreeKeys[0]);
    const find = (nodes: TreeNode[]): TreeNode | null => {
      for (const n of nodes) {
        if (n.key === key) return n;
        if (n.children) {
          const found = find(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    const node = find(treeData);
    if (node) {
      setTreeNodeModalMode("edit");
      treeNodeForm.setFieldsValue({ title: node.title });
      setTreeNodeModalOpen(true);
    }
  };

  const submitTreeNode = async () => {
    const { title } = await treeNodeForm.validateFields();
    if (!title.trim()) return;
    const newKey = `metric-node-${Date.now()}`;
    let nextTree: TreeNode[];
    if (treeNodeModalMode === "addRoot") {
      nextTree = addChildByKey(cloneTree(treeData), null, title.trim(), newKey);
    } else if (treeNodeModalMode === "addChild") {
      const parentKey = String(selectedTreeKeys[0]);
      nextTree = addChildByKey(cloneTree(treeData), parentKey, title.trim(), newKey);
    } else {
      const key = String(selectedTreeKeys[0]);
      nextTree = setNodeByKey(cloneTree(treeData), key, (n) => ({ ...n, title: title.trim() }));
    }
    await saveTree(nextTree);
    setTreeNodeModalOpen(false);
  };

  const deleteTreeNode = async () => {
    if (selectedTreeKeys.length === 0) return;
    const key = String(selectedTreeKeys[0]);
    const nextTree = removeNodeByKey(cloneTree(treeData), key);
    await saveTree(nextTree);
    setSelectedTreeKeys([]);
  };

  const openAddMetric = () => {
    setEditingMetric(null);
    metricForm.setFieldsValue({ name: "", metricType: "基础指标", definition: "", code: "" });
    linkForm.setFieldsValue({ knowledgeSystemId: systemId, termIds: [] });
    void domainApi.getGlossaryTerms({ knowledgeSystemId: systemId }).then(setLinkGlossaryTerms);
    setMetricModalOpen(true);
  };

  const openEditMetric = (item: MetricItem) => {
    setEditingMetric(item);
    metricForm.setFieldsValue({
      name: item.name,
      metricType: item.metricType,
      definition: item.definition,
      code: item.code,
    });
    const link = linkByMetricId[item.id];
    if (link) {
      linkForm.setFieldsValue({ knowledgeSystemId: link.knowledgeSystemId, termIds: link.termIds });
      void domainApi.getGlossaryTerms({ knowledgeSystemId: link.knowledgeSystemId }).then(setLinkGlossaryTerms);
    } else {
      linkForm.setFieldsValue({ knowledgeSystemId: systemId, termIds: [] });
      setLinkGlossaryTerms([]);
    }
    setMetricModalOpen(true);
  };

  const onLinkKnowledgeSystemChange = (ksId: string) => {
    linkForm.setFieldValue("termIds", []);
    void domainApi.getGlossaryTerms({ knowledgeSystemId: ksId }).then(setLinkGlossaryTerms);
  };

  const submitMetric = async () => {
    const values = await metricForm.validateFields();
    const linkValues = linkForm.getFieldsValue();
    const knowledgeSystemId = linkValues.knowledgeSystemId ?? systemId;
    const termIds = Array.isArray(linkValues.termIds) ? linkValues.termIds : [];
    setSaving(true);
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    try {
      if (editingMetric) {
        await domainApi.updateMetric(systemId, editingMetric.id, values, session?.userId);
        await domainApi.setMetricKnowledgeLink(systemId, editingMetric.id, { knowledgeSystemId, termIds });
        domainApi.appendOperationLog({
          module: "knowledge",
          moduleName: "语义知识库",
          actionType: "编辑",
          actionSummary: "编辑指标",
          relatedObject: editingMetric.name,
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
        if (termIds.length > 0) {
          domainApi.appendOperationLog({
            module: "knowledge",
            moduleName: "语义知识库",
            actionType: "关联",
            actionSummary: "指标关联语义知识库术语",
            relatedObject: editingMetric.name,
            operator,
            operatorId: session?.userId,
            status: "成功",
          });
        }
        messageApi.success("指标已更新");
      } else {
        const list = await domainApi.createMetric(systemId, values as Pick<MetricItem, "name" | "metricType" | "definition" | "code">, session?.userId);
        const newId = list[0]?.id;
        if (newId) {
          await domainApi.setMetricKnowledgeLink(systemId, newId, { knowledgeSystemId, termIds });
        }
        const name = values.name as string;
        domainApi.appendOperationLog({
          module: "knowledge",
          moduleName: "语义知识库",
          actionType: "新增",
          actionSummary: "新增指标",
          relatedObject: name,
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
        if (newId && termIds.length > 0) {
          domainApi.appendOperationLog({
            module: "knowledge",
            moduleName: "语义知识库",
            actionType: "关联",
            actionSummary: "指标关联语义知识库术语",
            relatedObject: name,
            operator,
            operatorId: session?.userId,
            status: "成功",
          });
        }
        messageApi.success("指标已创建");
      }
      setMetricModalOpen(false);
      void domainApi.getMetricKnowledgeLinks(systemId).then(setMetricLinks);
      onSaved?.();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const clearPendingSync = async () => {
    try {
      await domainApi.clearPendingMetricSync();
      setPendingMetricSyncIds([]);
      messageApi.success("已清除同步提醒");
    } catch {
      messageApi.error("清除失败");
    }
  };

  const treeDataForRender = useMemo(() => {
    const map = (nodes: TreeNode[]): DataNode[] =>
      nodes.map((n) => ({
        key: n.key,
        title: n.title,
        children: n.children?.length ? map(n.children) : undefined,
      }));
    return map(treeData);
  }, [treeData]);

  return (
    <>
      {contextHolder}
      {pendingMetricSyncIds.length > 0 && (
        <Alert
          type="info"
          message="以下指标关联的语义知识已变更，请核对"
          description={
            <Space>
              <span>涉及指标 ID：{pendingMetricSyncIds.slice(0, 5).join("、")}{pendingMetricSyncIds.length > 5 ? " 等" : ""}</span>
              <Button size="small" onClick={clearPendingSync}>
                一键清除提醒
              </Button>
            </Space>
          }
          style={{ marginBottom: 12 }}
        />
      )}
      <Row gutter={12}>
        <Col xs={24} xl={5}>
          <Card
            title="指标目录树"
            bodyStyle={{ padding: 10 }}
            style={{ minHeight: 420 }}
            extra={
              isCreator ? (
                <Space size={4} wrap>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openAddRoot}>
                    新增
                  </Button>
                  <Button size="small" icon={<PlusOutlined />} onClick={openAddChild}>
                    子节点
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={openEditNode} disabled={selectedTreeKeys.length === 0}>
                    编辑
                  </Button>
                  <Popconfirm title="确认删除该节点？" onConfirm={deleteTreeNode}>
                    <Button size="small" danger icon={<DeleteOutlined />} disabled={selectedTreeKeys.length === 0} />
                  </Popconfirm>
                </Space>
              ) : null
            }
          >
            <Tree
              blockNode
              defaultExpandAll
              treeData={treeDataForRender}
              selectedKeys={selectedTreeKeys}
              onSelect={(keys) => setSelectedTreeKeys(keys)}
              fieldNames={{ title: "title", key: "key", children: "children" }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={19}>
          <Card
            title="指标列表"
            extra={
              <Space wrap>
                <Input.Search
                  allowClear
                  placeholder="按指标名称或编码搜索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ width: 260 }}
                />
                {isCreator ? (
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAddMetric}>
                    新增指标
                  </Button>
                ) : null}
              </Space>
            }
          >
            <Row gutter={[12, 12]}>
              {filtered.length === 0 ? (
                <Col span={24}>
                  <Empty description="暂无匹配指标" />
                </Col>
              ) : (
                filtered.map((item) => {
                  const link = linkByMetricId[item.id];
                  const termCount = link?.termIds.length ?? 0;
                  return (
                  <Col xs={24} md={12} xl={8} key={item.id}>
                    <Card
                      size="small"
                      className="zy-card-hover"
                      extra={
                        isCreator ? (
                          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditMetric(item)}>
                            编辑
                          </Button>
                        ) : null
                      }
                    >
                      <Typography.Title level={5} style={{ marginTop: 0 }}>
                        {item.name}
                      </Typography.Title>
                      <Typography.Paragraph type="secondary" style={{ minHeight: 44 }}>
                        类型：{item.metricType}
                        <br />
                        编码：{item.code}
                        {item.source != null && (
                          <>
                            <br />
                            来源：{item.source === "skill_excel" ? "Excel 解析" : item.source === "document_extract" ? "文档抽取" : "手动"}
                          </>
                        )}
                      </Typography.Paragraph>
                      <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ minHeight: 36 }}>
                        口径：{item.definition}
                      </Typography.Paragraph>
                      <Space wrap>
                        {termCount > 0 && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            已关联语义知识 {termCount} 条
                            <Button
                              type="link"
                              size="small"
                              style={{ padding: 0, height: "auto" }}
                              onClick={() => link?.termIds[0] && navigate(`/domain/glossary/${link.termIds[0]}/edit`)}
                            >
                              查看
                            </Button>
                          </Typography.Text>
                        )}
                        <Button
                          icon={<LinkOutlined />}
                          size="small"
                          onClick={() => {
                            messageApi.info(`已打开“${item.name}”的数据关联配置（POC）`);
                          }}
                        >
                          数据关联
                        </Button>
                      </Space>
                    </Card>
                  </Col>
                  );
                })
              )}
            </Row>
          </Card>
        </Col>
      </Row>

      <Modal
        title={
          treeNodeModalMode === "edit" ? "编辑节点" : treeNodeModalMode === "addChild" ? "新增子节点" : "新增根节点"
        }
        open={treeNodeModalOpen}
        onCancel={() => setTreeNodeModalOpen(false)}
        onOk={() => void submitTreeNode()}
        destroyOnClose
      >
        <Form form={treeNodeForm} layout="vertical">
          <Form.Item name="title" label="节点名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="节点名称" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingMetric ? "编辑指标" : "新增指标"}
        open={metricModalOpen}
        onCancel={() => setMetricModalOpen(false)}
        onOk={() => void submitMetric()}
        confirmLoading={saving}
        destroyOnClose
        width={520}
      >
        <Form form={metricForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="指标名称" />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: "请输入编码" }]}>
            <Input placeholder="如 METRIC_XXX" />
          </Form.Item>
          <Form.Item name="metricType" label="类型" rules={[{ required: true }]}>
            <Select options={metricTypeOptions} />
          </Form.Item>
          <Form.Item name="definition" label="口径/计算逻辑">
            <Input.TextArea rows={3} placeholder="指标定义或计算逻辑" />
          </Form.Item>
        </Form>
        <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
          关联语义知识
        </Typography.Text>
        <Form form={linkForm} layout="vertical">
          <Form.Item name="knowledgeSystemId" label="知识库">
            <Select
              options={knowledgeSystems.map((k) => ({ value: k.id, label: k.name }))}
              placeholder="选择知识库"
              onChange={onLinkKnowledgeSystemChange}
            />
          </Form.Item>
          <Form.Item name="termIds" label="关联术语">
            <Select
              mode="multiple"
              options={linkGlossaryTerms.map((t) => ({ value: t.id, label: t.term }))}
              placeholder="选择术语（可多选）"
              allowClear
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
