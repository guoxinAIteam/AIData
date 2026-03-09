import {
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExportOutlined,
  EyeOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  BellOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlossaryReferenceModal } from "../../../components/domain/glossary/GlossaryReferenceModal";
import { authApi, domainApi } from "../../../services/mockApi";
import { setGlossaryTerms } from "../../../store/domainSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { GlossaryTerm, Nl2SemiticHit, PendingGlossaryTerm } from "../../../types/domain";

export function GlossaryListPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const terms = useAppSelector((state) => state.domain.glossaryTerms);
  const knowledgeSystems = useAppSelector((state) => state.domain.knowledgeSystems);
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [knowledgeSystemId, setKnowledgeSystemId] = useState<string>();
  const [termType, setTermType] = useState<GlossaryTerm["termType"]>();
  const [keyword, setKeyword] = useState("");
  const [refModal, setRefModal] = useState<{
    open: boolean;
    term: string;
    refs: string[];
    knowledgeEntries: { knowledgeSystemId: string; entryId: string; entryTitle: string; entryType: "metric" | "dimension" }[];
  }>({
    open: false,
    term: "",
    refs: [],
    knowledgeEntries: [],
  });
  const [nl2Open, setNl2Open] = useState(false);
  const [nl2Query, setNl2Query] = useState("");
  const [nl2Loading, setNl2Loading] = useState(false);
  const [nl2Hits, setNl2Hits] = useState<Nl2SemiticHit[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "pending">("list");
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingList, setPendingList] = useState<PendingGlossaryTerm[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    item: PendingGlossaryTerm | null;
    description?: string;
    knowledgeSystemId?: string;
    linkToTermId?: string;
    similarTerms?: GlossaryTerm[];
  }>({
    open: false,
    item: null,
  });

  const load = async (override?: {
    knowledgeSystemId?: string;
    termType?: GlossaryTerm["termType"];
    keyword?: string;
  }) => {
    setLoading(true);
    try {
      const filter = {
        knowledgeSystemId,
        termType,
        keyword,
        ...override,
      };
      const list = await domainApi.getGlossaryTerms({
        knowledgeSystemId: filter.knowledgeSystemId,
        termType: filter.termType,
        keyword: filter.keyword,
      });
      dispatch(setGlossaryTerms(list));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgeSystemId, keyword, termType]);

  const loadPendingCount = async () => {
    const count = await domainApi.getPendingGlossaryTermsCount();
    setPendingCount(count);
  };

  const loadPendingList = async () => {
    setPendingLoading(true);
    try {
      const list = await domainApi.getPendingGlossaryTerms();
      setPendingList(list);
      setPendingCount(list.length);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    void loadPendingCount();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "pending") void loadPendingList();
  }, [activeTab]);

  const columns: ColumnsType<GlossaryTerm> = useMemo(
    () => [
      {
        title: "术语",
        dataIndex: "term",
        width: 140,
      },
      {
        title: "同义词",
        dataIndex: "synonyms",
        render: (value: string[]) => value.join("、"),
      },
      {
        title: "解释说明",
        dataIndex: "description",
        ellipsis: true,
      },
      {
        title: "术语类型",
        dataIndex: "termType",
        width: 100,
        render: (value: GlossaryTerm["termType"]) => (
          <Tag color={value === "全局" ? "blue" : "purple"}>{value}</Tag>
        ),
      },
      {
        title: "层级分类",
        dataIndex: "ontologyClass",
        width: 100,
        render: (v: string) => v ?? "—",
      },
      {
        title: "关系数",
        key: "relationsCount",
        width: 80,
        render: (_, record) => (record.relations?.length ?? 0),
      },
      {
        title: "更新人",
        dataIndex: "updatedBy",
        width: 90,
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
        render: (value: GlossaryTerm["status"], record) => (
          <Switch
            checked={value === "enabled"}
            size="small"
            onChange={(checked) => {
              void (async () => {
                const session = authApi.getSessionSync();
                const operator = session?.displayName ?? session?.username ?? "未登录";
                try {
                  const list = await domainApi.toggleGlossaryStatus(record.id, checked);
                  dispatch(setGlossaryTerms(list));
                  domainApi.appendOperationLog({
                    module: "glossary",
                    moduleName: "业务术语词典",
                    actionType: "状态切换",
                    actionSummary: `将术语「${record.term}」${checked ? "启用" : "停用"}`,
                    relatedObject: record.term,
                    operator,
                    operatorId: session?.userId,
                    status: "成功",
                  });
                } catch (e) {
                  const text = e instanceof Error ? e.message : "未知错误";
                  domainApi.appendOperationLog({
                    module: "glossary",
                    moduleName: "业务术语词典",
                    actionType: "状态切换",
                    actionSummary: `将术语「${record.term}」${checked ? "启用" : "停用"}`,
                    relatedObject: record.term,
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
        width: 210,
        render: (_, record) => (
          <Space size={4} className="zy-table-actions">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => navigate(`/domain/glossary/${record.id}/edit`)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除该术语？"
              onConfirm={() => {
                void (async () => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  const termName = record.term;
                  try {
                    const list = await domainApi.removeGlossaryTerms([record.id]);
                    dispatch(setGlossaryTerms(list));
                    domainApi.appendOperationLog({
                      module: "glossary",
                      moduleName: "业务术语词典",
                      actionType: "删除",
                      actionSummary: "删除术语",
                      relatedObject: termName,
                      operator,
                      operatorId: session?.userId,
                      status: "成功",
                    });
                    messageApi.success("删除成功");
                  } catch (e) {
                    const text = e instanceof Error ? e.message : "未知错误";
                    domainApi.appendOperationLog({
                      module: "glossary",
                      moduleName: "业务术语词典",
                      actionType: "删除",
                      actionSummary: "删除术语",
                      relatedObject: termName,
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
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                void (async () => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  const links = await domainApi.getLinksByGlossaryTerm(record.id);
                  domainApi.appendOperationLog({
                    module: "glossary",
                    moduleName: "业务术语词典",
                    actionType: "查看",
                    actionSummary: "查看术语引用（关联指标/维度/知识库）",
                    relatedObject: record.term,
                    operator,
                    operatorId: session?.userId,
                    status: "成功",
                  });
                  setRefModal({
                    open: true,
                    term: record.term,
                    refs: record.references,
                    knowledgeEntries: links.knowledgeEntries ?? [],
                  });
                })();
              }}
            >
              查看引用
            </Button>
          </Space>
        ),
      },
    ],
    [dispatch, messageApi, navigate],
  );

  return (
    <>
      {contextHolder}
      <Card
        title="业务术语词典"
        extra={
          <Space>
            <Badge count={pendingCount} size="small" offset={[-2, 2]}>
              <Button
                icon={<BellOutlined />}
                onClick={() => setActiveTab("pending")}
                title={`待确认：${pendingCount} 条`}
              >
                待确认
              </Button>
            </Badge>
            <Select
              allowClear
              style={{ width: 220 }}
              placeholder="所属知识库"
              value={knowledgeSystemId}
              onChange={setKnowledgeSystemId}
              options={knowledgeSystems.map((item) => ({ label: item.name, value: item.id }))}
            />
            <Select
              allowClear
              style={{ width: 130 }}
              placeholder="术语类型"
              value={termType}
              onChange={(value) => setTermType(value)}
              options={[
                { label: "全局", value: "全局" },
                { label: "智能匹配", value: "智能匹配" },
              ]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={keyword}
              placeholder="搜索术语/同义词/解释"
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => void load()}
              style={{ width: 220 }}
            />
            <Button onClick={() => void load()}>查询</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/domain/glossary/new")}>
              新增
            </Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => setNl2Open(true)}>
              智能检索
            </Button>
            <Dropdown
              menu={{
                items: [
                  { key: "download", label: "下载模板" },
                  { key: "import", label: "导入数据" },
                ],
                onClick: ({ key }) => {
                  messageApi.success(key === "download" ? "模板下载已触发（POC）" : "导入任务已提交（POC）");
                },
              }}
            >
              <Button icon={<ImportOutlined />}>
                导入 <DownOutlined />
              </Button>
            </Dropdown>
            <Popconfirm
              title="确认批量删除所选术语？"
              disabled={selectedRowKeys.length === 0}
              onConfirm={() => {
                void (async () => {
                  const session = authApi.getSessionSync();
                  const operator = session?.displayName ?? session?.username ?? "未登录";
                  const ids = selectedRowKeys.map((item) => item.toString());
                  try {
                    const list = await domainApi.removeGlossaryTerms(ids);
                    dispatch(setGlossaryTerms(list));
                    domainApi.appendOperationLog({
                      module: "glossary",
                      moduleName: "业务术语词典",
                      actionType: "删除",
                      actionSummary: `批量删除 ${ids.length} 条术语`,
                      operator,
                      operatorId: session?.userId,
                      status: "成功",
                    });
                    setSelectedRowKeys([]);
                    messageApi.success("批量删除成功");
                  } catch (e) {
                    const text = e instanceof Error ? e.message : "未知错误";
                    domainApi.appendOperationLog({
                      module: "glossary",
                      moduleName: "业务术语词典",
                      actionType: "删除",
                      actionSummary: "批量删除术语",
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
              <Button disabled={selectedRowKeys.length === 0} icon={<DeleteOutlined />}>
                批量删除
              </Button>
            </Popconfirm>
            <Button icon={<ExportOutlined />} onClick={() => messageApi.success("导出成功（POC）")}>
              导出
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setKnowledgeSystemId(undefined);
                setTermType(undefined);
                setKeyword("");
                setSelectedRowKeys([]);
                void load({ knowledgeSystemId: undefined, termType: undefined, keyword: "" });
              }}
            >
              重置
            </Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as "list" | "pending")}
          items={[
            {
              key: "list",
              label: "术语列表",
              children: (
                <Table<GlossaryTerm>
          rowKey="id"
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: (nextKeys) => setSelectedRowKeys(nextKeys),
          }}
          columns={columns}
          dataSource={terms}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: "暂无匹配术语，请调整筛选条件" }}
        />
              ),
            },
            {
              key: "pending",
              label: "待确认术语",
              children: (
                <Table<PendingGlossaryTerm>
                  rowKey="id"
                  loading={pendingLoading}
                  columns={[
                    { title: "术语名称", dataIndex: "term", width: 140 },
                    { title: "来源 Skill", width: 180, render: (_: unknown, r: PendingGlossaryTerm) => `${r.sourceSkillName} (${r.sourceSkillId})` },
                    { title: "业务领域", dataIndex: "domain", width: 120 },
                    { title: "释义片段", dataIndex: "description", ellipsis: true },
                    {
                      title: "操作",
                      width: 160,
                      render: (_: unknown, record: PendingGlossaryTerm) => (
                        <Space>
                          <Button
                            type="link"
                            size="small"
                            onClick={() => {
                              setConfirmModal({
                                open: true,
                                item: record,
                                description: record.description,
                              });
                              domainApi.getSimilarGlossaryTerms(record.term).then((similar) => {
                                setConfirmModal((prev) => (prev.item?.id === record.id ? { ...prev, similarTerms: similar } : prev));
                              });
                            }}
                          >
                            确认
                          </Button>
                          <Popconfirm
                            title="驳回后该术语将删除，是否继续？"
                            onConfirm={async () => {
                              const session = authApi.getSessionSync();
                              const operator = session?.displayName ?? session?.username ?? "未登录";
                              try {
                                await domainApi.rejectPendingTerms([record.id]);
                                await loadPendingList();
                                domainApi.appendOperationLog({
                                  module: "glossary",
                                  moduleName: "业务术语词典",
                                  actionType: "驳回",
                                  actionSummary: `驳回待确认术语：${record.term}`,
                                  relatedObject: record.term,
                                  operator,
                                  operatorId: session?.userId,
                                  status: "成功",
                                });
                                messageApi.success("已驳回");
                              } catch (e) {
                                const text = e instanceof Error ? e.message : "驳回失败";
                                domainApi.appendOperationLog({
                                  module: "glossary",
                                  moduleName: "业务术语词典",
                                  actionType: "驳回",
                                  actionSummary: `驳回待确认术语：${record.term}`,
                                  operator,
                                  operatorId: session?.userId,
                                  status: "失败",
                                  failReason: text,
                                });
                                messageApi.error(text);
                              }
                            }}
                          >
                            <Button type="link" size="small" danger>驳回</Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                  dataSource={pendingList}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: "暂无待确认术语" }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="确认术语"
        open={confirmModal.open}
        onCancel={() => setConfirmModal({ open: false, item: null })}
        onOk={async () => {
          if (!confirmModal.item) return;
          const session = authApi.getSessionSync();
          const operator = session?.displayName ?? session?.username ?? "未登录";
          try {
            await domainApi.confirmPendingTerm(
              confirmModal.item.id,
              {
                description: confirmModal.description,
                knowledgeSystemId: confirmModal.knowledgeSystemId,
              },
              {
                linkToTermId: confirmModal.linkToTermId,
                runOntologyExtract: true,
                logContext: { operator, operatorId: session?.userId },
              },
            );
            const list = await domainApi.getGlossaryTerms({});
            dispatch(setGlossaryTerms(list));
            await loadPendingList();
            domainApi.appendOperationLog({
              module: "glossary",
              moduleName: "业务术语词典",
              actionType: "确认",
              actionSummary: `确认待确认术语：${confirmModal.item.term}`,
              relatedObject: confirmModal.item.term,
              operator,
              operatorId: session?.userId,
              status: "成功",
            });
            messageApi.success("已加入术语词典");
            setConfirmModal({ open: false, item: null });
          } catch (e) {
            const text = e instanceof Error ? e.message : "确认失败";
            domainApi.appendOperationLog({
              module: "glossary",
              moduleName: "业务术语词典",
              actionType: "确认",
              actionSummary: `确认待确认术语：${confirmModal.item.term}`,
              operator,
              operatorId: session?.userId,
              status: "失败",
              failReason: text,
            });
            messageApi.error(text);
          }
        }}
        destroyOnClose
        width={520}
      >
        {confirmModal.item && (
          <Space direction="vertical" style={{ width: "100%" }}>
            {confirmModal.similarTerms != null && confirmModal.similarTerms.length > 0 && (
              <Typography.Text type="warning">
                以下已有术语可能重复或雷同：{confirmModal.similarTerms.map((t) => t.term).join("、")}。可选用「关联为同义术语」归类。
              </Typography.Text>
            )}
            <Typography.Text>术语：{confirmModal.item.term}</Typography.Text>
            <div>
              <Typography.Text strong>释义（可编辑）：</Typography.Text>
              <Input.TextArea
                rows={3}
                value={confirmModal.description ?? confirmModal.item.description}
                onChange={(e) => setConfirmModal((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="术语释义"
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <Typography.Text strong>所属知识库：</Typography.Text>
              <Select
                style={{ width: "100%", marginTop: 4 }}
                placeholder="选择知识库"
                value={confirmModal.knowledgeSystemId}
                onChange={(v) => setConfirmModal((prev) => ({ ...prev, knowledgeSystemId: v }))}
                options={knowledgeSystems.map((k) => ({ label: k.name, value: k.id }))}
                allowClear
              />
            </div>
            {confirmModal.similarTerms != null && confirmModal.similarTerms.length > 0 && (
              <div>
                <Typography.Text strong>关联为同义术语（可选）：</Typography.Text>
                <Select
                  style={{ width: "100%", marginTop: 4 }}
                  placeholder="选择已有术语作为同义"
                  value={confirmModal.linkToTermId}
                  onChange={(v) => setConfirmModal((prev) => ({ ...prev, linkToTermId: v }))}
                  options={confirmModal.similarTerms.map((t) => ({ label: `${t.term}（${t.knowledgeSystemName}）`, value: t.id }))}
                  allowClear
                />
              </div>
            )}
          </Space>
        )}
      </Modal>

      <GlossaryReferenceModal
        open={refModal.open}
        term={refModal.term}
        references={refModal.refs}
        knowledgeEntries={refModal.knowledgeEntries}
        onCancel={() => setRefModal((prev) => ({ ...prev, open: false }))}
      />

      <Modal
        title="智能检索（NL2Semitic）"
        open={nl2Open}
        onCancel={() => { setNl2Open(false); setNl2Hits([]); setNl2Query(""); }}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            placeholder="输入自然语言描述，如：收入、用户数、套餐"
            value={nl2Query}
            onChange={(e) => setNl2Query(e.target.value)}
            onPressEnter={(e) => {
              const q = (e.target as HTMLInputElement).value.trim();
              if (!q) return;
              setNl2Loading(true);
              domainApi.nl2SemiticQuery(q).then((res) => {
                setNl2Hits(res.hits);
                if (res.hits.length === 0) messageApi.info("未命中相关术语");
              }).finally(() => setNl2Loading(false));
            }}
          />
          <Button
            type="primary"
            loading={nl2Loading}
            onClick={() => {
              if (!nl2Query.trim()) return;
              setNl2Loading(true);
              domainApi.nl2SemiticQuery(nl2Query).then((res) => {
                setNl2Hits(res.hits);
                if (res.hits.length === 0) messageApi.info("未命中相关术语");
              }).finally(() => setNl2Loading(false));
            }}
          >
            查询
          </Button>
        </Space.Compact>
        {nl2Hits.length > 0 && (
          <List
            dataSource={nl2Hits}
            renderItem={(hit, idx) => (
              <List.Item key={idx}>
                <div style={{ width: "100%" }}>
                  <Typography.Text strong>命中概念：</Typography.Text> {hit.concept}
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="secondary">对应术语：</Typography.Text>
                    <Space wrap size={4} style={{ marginLeft: 8 }}>
                      {(hit.terms ?? []).length > 0
                        ? (hit.terms ?? []).map((t) => (
                            <Button
                              key={t.id}
                              type="link"
                              size="small"
                              onClick={() => { setNl2Open(false); navigate(`/domain/glossary/${t.id}/edit`); }}
                            >
                              {t.term}
                            </Button>
                          ))
                        : "—"}
                    </Space>
                  </div>
                  {(hit.relatedTerms ?? []).length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Typography.Text type="secondary">关联术语：</Typography.Text>
                      <Space wrap size={4} style={{ marginLeft: 8 }}>
                        {(hit.relatedTerms ?? []).map((t) => (
                          <Button
                            key={t.id}
                            type="link"
                            size="small"
                            onClick={() => { setNl2Open(false); navigate(`/domain/glossary/${t.id}/edit`); }}
                          >
                            {t.term}
                          </Button>
                        ))}
                      </Space>
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </Modal>
    </>
  );
}
