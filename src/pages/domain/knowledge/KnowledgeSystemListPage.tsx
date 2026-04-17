import { LinkOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Col, Descriptions, Drawer, Form, Input, Modal, Pagination, Row, Select, Space, Table, Tabs, Typography, message } from "antd";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { KnowledgeSystemCard } from "../../../components/domain/knowledge/KnowledgeSystemCard";
import { authApi, domainApi } from "../../../services/mockApi";
import { setKnowledgeSystems } from "../../../store/domainSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { SkillKnowledgeEntry } from "../../../types/domain";

interface CreateForm {
  skillId: string;
  name?: string;
  description?: string;
}

export function KnowledgeSystemListPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const systems = useAppSelector((state) => state.domain.knowledgeSystems);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<CreateForm>();
  const [activeTab, setActiveTab] = useState<string>("systems");
  const [skillEntries, setSkillEntries] = useState<SkillKnowledgeEntry[]>([]);
  const [skillEntriesLoading, setSkillEntriesLoading] = useState(false);
  const [entryDetail, setEntryDetail] = useState<SkillKnowledgeEntry | null>(null);
  const [skillOptions, setSkillOptions] = useState<
    Array<{ id: string; name: string; boundSystemName?: string }>
  >([]);
  const [skillOptionsLoading, setSkillOptionsLoading] = useState(false);
  const [myCreatorSkillIds, setMyCreatorSkillIds] = useState<Set<string>>(new Set());
  const [systemsPage, setSystemsPage] = useState(1);
  const systemsPageSize = 10;

  const loadData = async (query = "") => {
    setLoading(true);
    try {
      const list = await domainApi.getKnowledgeSystems(query);
      dispatch(setKnowledgeSystems(list));
      const session = authApi.getSessionSync();
      if (session?.userId) {
        const { list: myList } = await domainApi.getSkillRanking({
          page: 1,
          pageSize: 500,
          createdByUserId: session.userId,
          sourceType: "own",
        });
        setMyCreatorSkillIds(new Set(myList.map((s) => s.id)));
      } else {
        setMyCreatorSkillIds(new Set());
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "未知错误";
      messageApi.error(`加载语义知识库失败：${text}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSkillEntries = async () => {
    setSkillEntriesLoading(true);
    try {
      const list = await domainApi.getSkillKnowledgeEntries();
      setSkillEntries(list);
    } finally {
      setSkillEntriesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "skill-entries") void loadSkillEntries();
  }, [activeTab]);

  const loadSkillOptionsForCreate = useCallback(async () => {
    setSkillOptionsLoading(true);
    try {
      const { list } = await domainApi.getSkillRanking({
        page: 1,
        pageSize: 500,
      });
      const boundMap = new Map<string, string>();
      systems.forEach((s) => {
        if (s.skillId) boundMap.set(s.skillId, s.name);
      });
      const options = list.map((s) => ({
        id: s.id,
        name: s.name,
        boundSystemName: boundMap.get(s.id),
      }));
      setSkillOptions(options);
    } finally {
      setSkillOptionsLoading(false);
    }
  }, [systems]);

  useEffect(() => {
    if (open) void loadSkillOptionsForCreate();
  }, [open, loadSkillOptionsForCreate]);

  const content = useMemo(() => {
    if (systems.length === 0) {
      return <EmptyState description="暂无知识库，请点击“创建”新增" />;
    }
    const start = (systemsPage - 1) * systemsPageSize;
    const pagedSystems = systems.slice(start, start + systemsPageSize);
    return (
      <>
        <Row gutter={[12, 12]}>
          {pagedSystems.map((item) => (
            <Col xs={24} md={12} xl={8} key={item.id}>
              <KnowledgeSystemCard
                system={item}
                isCreator={item.skillId ? myCreatorSkillIds.has(item.skillId) : false}
                onView={(id) => navigate(`/domain/knowledge-systems/${id}/manage/datasets`)}
                onManage={(id) => navigate(`/domain/knowledge-systems/${id}/manage/datasource`)}
                onUpload={(id) => navigate(`/domain/knowledge-systems/${id}/manage/rag`)}
                onDelete={(id) => {
                  void (async () => {
                    const session = authApi.getSessionSync();
                    const operator = session?.displayName ?? session?.username ?? "未登录";
                    const name = systems.find((s) => s.id === id)?.name ?? id;
                    try {
                      const next = await domainApi.removeKnowledgeSystem(id, session?.userId);
                      dispatch(setKnowledgeSystems(next));
                      domainApi.appendOperationLog({
                        module: "knowledge",
                        moduleName: "语义知识库",
                        actionType: "删除",
                        actionSummary: "删除语义知识库",
                        relatedObject: name,
                        operator,
                        operatorId: session?.userId,
                        status: "成功",
                      });
                      messageApi.success("删除成功");
                    } catch (error) {
                      const text = error instanceof Error ? error.message : "未知错误";
                      domainApi.appendOperationLog({
                        module: "knowledge",
                        moduleName: "语义知识库",
                        actionType: "删除",
                        actionSummary: "删除语义知识库",
                        relatedObject: name,
                        operator,
                        operatorId: session?.userId,
                        status: "失败",
                        failReason: text,
                      });
                      messageApi.error(`删除失败：${text}`);
                    }
                  })();
                }}
              />
            </Col>
          ))}
        </Row>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <Pagination
            current={systemsPage}
            total={systems.length}
            pageSize={systemsPageSize}
            onChange={setSystemsPage}
            showTotal={(t) => `共 ${t} 条`}
          />
        </div>
      </>
    );
  }, [dispatch, messageApi, navigate, systems, myCreatorSkillIds, systemsPage]);

  const skillEntriesContent = useMemo(
    () => (
      <>
        <Table<SkillKnowledgeEntry>
          rowKey="id"
          loading={skillEntriesLoading}
          dataSource={skillEntries}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
          columns={[
            { title: "标题", dataIndex: "title", key: "title", ellipsis: true, width: 200 },
            { title: "来源", dataIndex: "source", key: "source", width: 120, render: (v: string) => (v === "skill_create" ? "新建" : "外部导入") },
            { title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", width: 160 },
            {
              title: "操作",
              key: "action",
              width: 180,
              render: (_: unknown, record: SkillKnowledgeEntry) => (
                <Space>
                  <Button type="link" size="small" onClick={() => setEntryDetail(record)}>
                    查看详情
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    icon={<LinkOutlined />}
                    onClick={() => navigate("/domain/skills", { state: { highlightSkillId: record.skillId } })}
                  >
                    跳转 Skill
                  </Button>
                </Space>
              ),
            },
          ]}
        />
        <Drawer
          title={entryDetail?.title ?? "Skill 关联条目"}
          open={!!entryDetail}
          onClose={() => setEntryDetail(null)}
          width={560}
        >
          {entryDetail && (
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="标题">{entryDetail.title}</Descriptions.Item>
              <Descriptions.Item label="摘要">{entryDetail.summary}</Descriptions.Item>
              <Descriptions.Item label="触发条件">{entryDetail.triggerCondition}</Descriptions.Item>
              <Descriptions.Item label="输入">{entryDetail.inputSpec}</Descriptions.Item>
              <Descriptions.Item label="步骤">{entryDetail.steps}</Descriptions.Item>
              <Descriptions.Item label="检查">{entryDetail.checkCriteria}</Descriptions.Item>
              <Descriptions.Item label="中止条件">{entryDetail.abortCondition}</Descriptions.Item>
              <Descriptions.Item label="恢复方式">{entryDetail.recoveryMethod}</Descriptions.Item>
              <Descriptions.Item label="来源">{entryDetail.source === "skill_create" ? "新建" : "外部导入"}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{entryDetail.updatedAt}</Descriptions.Item>
              {entryDetail.versionHistory && entryDetail.versionHistory.length > 0 && (
                <Descriptions.Item label="版本记录">
                  {entryDetail.versionHistory.map((v: { at: string; summary: string }, i: number) => (
                    <div key={i}>
                      {v.at} {v.summary}
                    </div>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
          {entryDetail && (
            <div style={{ marginTop: 16 }}>
              <Button type="primary" icon={<LinkOutlined />} onClick={() => navigate("/domain/skills", { state: { highlightSkillId: entryDetail.skillId } })}>
                跳转至对应 Skill
              </Button>
            </div>
          )}
        </Drawer>
      </>
    ),
    [entryDetail, navigate, skillEntries, skillEntriesLoading],
  );

  return (
    <>
      {contextHolder}
      <Card
        title={<Typography.Text strong>语义知识库</Typography.Text>}
        extra={
          <Space>
            <Input.Search
              allowClear
              placeholder="按知识库名称搜索"
              style={{ width: 240 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={(value) => {
                setSystemsPage(1);
                void loadData(value);
              }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setOpen(true);
                form.resetFields();
              }}
            >
              创建
            </Button>
          </Space>
        }
        loading={loading}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: "systems", label: "知识库系统", children: content },
            { key: "skill-entries", label: "Skill 关联条目", children: skillEntriesContent },
          ]}
        />
      </Card>

      <Modal
        title="创建知识库"
        open={open}
        confirmLoading={creating}
        onCancel={() => setOpen(false)}
        onOk={() => {
          void form.validateFields().then(async (values) => {
            setCreating(true);
            const session = authApi.getSessionSync();
            const operator = session?.displayName ?? session?.username ?? "未登录";
            try {
              const skill = skillOptions.find((s) => s.id === values.skillId);
              const next = await domainApi.createKnowledgeSystem(
                values.skillId,
                values.name || skill?.name,
                values.description,
                session?.userId,
              );
              dispatch(setKnowledgeSystems(next));
              domainApi.appendOperationLog({
                module: "knowledge",
                moduleName: "语义知识库",
                actionType: "新增",
                actionSummary: "新增语义知识库",
                relatedObject: skill?.name ?? values.skillId,
                operator,
                operatorId: session?.userId,
                status: "成功",
              });
              messageApi.success("创建成功");
              setOpen(false);
            } catch (error) {
              const text = error instanceof Error ? error.message : "未知错误";
              domainApi.appendOperationLog({
                module: "knowledge",
                moduleName: "语义知识库",
                actionType: "新增",
                actionSummary: "新增语义知识库",
                relatedObject: values.skillId,
                operator,
                operatorId: session?.userId,
                status: "失败",
                failReason: text,
              });
              messageApi.error(`创建失败：${text}`);
            } finally {
              setCreating(false);
            }
          });
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="选择 Skill（展示全部 Skill，已绑定知识库的将以标签提示并不可选）"
            name="skillId"
            rules={[{ required: true, message: "请选择 Skill" }]}
          >
            <Select
              placeholder="请选择 Skill"
              loading={skillOptionsLoading}
              showSearch
              filterOption={(input, opt) => {
                const raw = (opt as { skillName?: string })?.skillName ?? "";
                return raw.toLowerCase().includes(input.toLowerCase());
              }}
              options={skillOptions.map((s) => ({
                value: s.id,
                skillName: s.name,
                disabled: Boolean(s.boundSystemName),
                label: s.boundSystemName ? (
                  <Space size={6}>
                    <span>{s.name}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      已绑定：{s.boundSystemName}
                    </Typography.Text>
                  </Space>
                ) : (
                  s.name
                ),
              }))}
            />
          </Form.Item>
          <Form.Item label="知识库名称（选填，默认取 Skill 名称）" name="name">
            <Input placeholder="留空则使用 Skill 名称" />
          </Form.Item>
          <Form.Item label="描述（选填）" name="description">
            <Input.TextArea rows={3} placeholder="留空则使用 Skill 摘要" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
