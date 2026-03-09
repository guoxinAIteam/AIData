import {
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Input,
  Pagination,
  Segmented,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/common/EmptyState";
import { SkillDetailModal } from "../../../components/domain/skills/SkillDetailModal";
import { SkillEditModal } from "../../../components/domain/skills/SkillEditModal";
import { SkillImportModal } from "../../../components/domain/skills/SkillImportModal";
import { authApi, domainApi } from "../../../services/mockApi";
import { useAppSelector } from "../../../store/hooks";
import type { EntityStatus, SkillItem, SkillLeaderboardMode, SkillSourceType } from "../../../types/domain";
import { getSkillSourceType } from "../../../types/domain";

function getSourceChannelLabel(record: SkillItem): string {
  if (getSkillSourceType(record) === "external_crawl") {
    return record.crawlChannel ?? "skills.sh 爬虫";
  }
  switch (record.importSource) {
    case "file_xlsx":
      return "Excel 导入";
    case "file_md":
      return "MD 导入";
    case "file_docx":
      return "Word 导入";
    default:
      return "手动创建";
  }
}

const modeLabelMap: Record<SkillLeaderboardMode, string> = {
  all: "All Time",
  trending: "Trending (24h)",
  hot: "Hot",
};

export function SkillRankingPage() {
  const navigate = useNavigate();
  const session = useAppSelector((state) => state.auth.session);
  const [activeListTab, setActiveListTab] = useState<"my" | "external">("my");
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<SkillItem["category"] | "all">("all");
  const [status, setStatus] = useState<EntityStatus | "all">("all");
  const [sourceType, setSourceType] = useState<SkillSourceType | "all">("all");
  const [mode, setMode] = useState<SkillLeaderboardMode>("all");
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [total, setTotal] = useState(0);
  const [sourceCounts, setSourceCounts] = useState<{ own: number; external_crawl: number } | undefined>();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [detailSkill, setDetailSkill] = useState<SkillItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editSkill, setEditSkill] = useState<SkillItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const canMaintain = (record: SkillItem) =>
    record.isCustom &&
    (record.createdByUserId == null || record.createdByUserId === session?.userId);

  const load = async (
    override?: Partial<{
      keyword: string;
      category: SkillItem["category"] | "all";
      status: EntityStatus | "all";
      sourceType: SkillSourceType | "all";
      mode: SkillLeaderboardMode;
      page: number;
      createdByUserId: string | undefined;
    }>,
  ) => {
    const nextKeyword = override?.keyword ?? keyword;
    const nextCategory = override?.category ?? category;
    const nextStatus = override?.status ?? status;
    const nextSourceType = override?.sourceType ?? (activeListTab === "my" ? "own" : "external_crawl");
    const nextCreatedBy = override?.createdByUserId !== undefined ? override.createdByUserId : (activeListTab === "my" ? session?.userId : undefined);
    const nextMode = override?.mode ?? mode;
    const nextPage = override?.page ?? page;
    setLoading(true);
    try {
      const data = await domainApi.getSkillRanking({
        keyword: nextKeyword,
        category: nextCategory,
        status: nextStatus,
        sourceType: nextSourceType,
        mode: nextMode,
        page: nextPage,
        pageSize,
        createdByUserId: nextCreatedBy,
      });
      setSkills(data.list);
      setTotal(data.total);
      setPage(nextPage);
      setSourceCounts(data.sourceCounts);
      setLastSyncAt(data.lastSyncAt);
      if (nextKeyword?.trim()) {
        const operator = session?.displayName ?? session?.username ?? "未登录";
        domainApi.appendOperationLog({
          module: "skill_lib",
          moduleName: "Skill 库",
          actionType: "检索",
          actionSummary: "检索 Skill 榜单",
          relatedObject: nextKeyword.trim(),
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "未知错误";
      messageApi.error(`加载 Skill 库失败：${text}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ category, status, sourceType: activeListTab === "my" ? "own" : "external_crawl", createdByUserId: activeListTab === "my" ? session?.userId : undefined, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, status, sourceType, activeListTab, mode, session?.userId]);

  const openDetail = async (skillId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailSkill(null);
    try {
      const detail = await domainApi.getSkillById(skillId);
      if (!detail) {
        messageApi.warning("未找到 Skill 详情");
        return;
      }
      setDetailSkill(detail);
      const session = authApi.getSessionSync();
      domainApi.appendOperationLog({
        module: "skill_lib",
        moduleName: "Skill 库",
        actionType: "查看",
        actionSummary: "查看 Skill 详情",
        relatedObject: detail.name,
        operator: session?.displayName ?? session?.username ?? "未登录",
        operatorId: session?.userId,
        status: "成功",
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "未知错误";
      messageApi.error(`加载 Skill 详情失败：${text}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const syncManually = async () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    const session = authApi.getSessionSync();
    const operator = session?.displayName ?? session?.username ?? "未登录";
    try {
      const synced = await domainApi.syncSkillSnapshotManually(mode);
      setLastSyncAt(synced.lastSyncAt);
      domainApi.appendOperationLog({
        module: "skill_lib",
        moduleName: "Skill 库",
        actionType: "同步",
        actionSummary: `手动同步 ${modeLabelMap[mode]} 榜单，共 ${synced.list.length} 条`,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
      if (synced.termsExtractedCount != null && synced.termsExtractedCount > 0) {
        domainApi.appendOperationLog({
          module: "glossary",
          moduleName: "业务术语词典",
          actionType: "导入",
          actionSummary: `术语自动提取：从 ${synced.list.length} 条外部 Skill 提取 ${synced.termsExtractedCount} 条待确认术语`,
          operator,
          operatorId: session?.userId,
          status: "成功",
        });
      }
      messageApi.success(`${modeLabelMap[mode]} 榜单同步完成，共 ${synced.list.length} 条 Skill`);
      await load();
    } catch (error) {
      const text = error instanceof Error ? error.message : "未知错误";
      domainApi.appendOperationLog({
        module: "skill_lib",
        moduleName: "Skill 库",
        actionType: "同步",
        actionSummary: "手动同步榜单",
        operator,
        operatorId: session?.userId,
        status: "失败",
        failReason: text,
      });
      messageApi.error(text);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Card
        className="zy-skill-rank-card"
        title="Skill 库"
        extra={
          <Space>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索 Skill 名称、标签、场景"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onPressEnter={() => void load()}
              style={{ width: 260 }}
            />
            <Select
              value={category}
              style={{ width: 140 }}
              onChange={setCategory}
              options={[
                { label: "全部分类", value: "all" },
                { label: "官方推荐", value: "官方推荐" },
                { label: "开发提效", value: "开发提效" },
                { label: "数据分析", value: "数据分析" },
                { label: "Agent 编排", value: "Agent 编排" },
                { label: "用户创建", value: "用户创建" },
              ]}
            />
            <Select
              value={status}
              style={{ width: 110 }}
              onChange={setStatus}
              options={[
                { label: "全部状态", value: "all" },
                { label: "启用", value: "enabled" },
                { label: "停用", value: "disabled" },
              ]}
            />
            <Select
              value={sourceType}
              style={{ width: 120 }}
              onChange={setSourceType}
              options={[
                { label: "全部来源", value: "all" },
                { label: "自有", value: "own" },
                { label: "外部爬取", value: "external_crawl" },
              ]}
            />
            <Button loading={loading} onClick={() => void load({ page: 1 })}>
              查询
            </Button>
            <Button
              icon={<RetweetOutlined />}
              onClick={() => {
                setKeyword("");
                setCategory("all");
                setStatus("all");
                setSourceType("all");
                setPage(1);
                void load({
                  keyword: "",
                  category: "all",
                  status: "all",
                  sourceType: activeListTab === "my" ? "own" : "external_crawl",
                  createdByUserId: activeListTab === "my" ? session?.userId : undefined,
                  mode,
                  page: 1,
                });
              }}
            >
              重置
            </Button>
            <Tooltip title={`上次同步时间：${lastSyncAt || "-"}`}>
              <Button
                icon={<ReloadOutlined />}
                loading={syncing}
                disabled={syncing || loading}
                onClick={() => void syncManually()}
              >
                手动同步
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={syncing}
              onClick={() => {
                setEditSkill(null);
                setEditOpen(true);
              }}
            >
              新增 Skill
            </Button>
            <Button
              icon={<PlusOutlined />}
              disabled={syncing}
              onClick={() => setImportOpen(true)}
            >
              文件导入
            </Button>
          </Space>
        }
      >
        <Tabs
          activeKey={activeListTab}
          onChange={(k) => {
            setActiveListTab(k as "my" | "external");
            setPage(1);
            void load({
              sourceType: k === "my" ? "own" : "external_crawl",
              createdByUserId: k === "my" ? session?.userId : undefined,
              page: 1,
            });
          }}
          items={[
            { key: "my", label: "我的 Skill" },
            { key: "external", label: "外部 Skill" },
          ]}
        />
        <div className="zy-skill-rank-mode-row">
          <Segmented
            value={mode}
            onChange={(value) => setMode(value as SkillLeaderboardMode)}
            options={[
              { label: "All Time", value: "all" },
              { label: "Trending (24h)", value: "trending" },
              { label: "Hot", value: "hot" },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            当前模式：{modeLabelMap[mode]}
          </Typography.Text>
          {sourceCounts != null && (
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>
              {activeListTab === "my" ? `当前用户自有：${total} 条` : `外部爬取：${total} 条`}
            </Typography.Text>
          )}
        </div>

        <div className="zy-skill-rank-board">
          <div className="zy-skill-rank-board-head">
            <div>#</div>
            <div>SKILL / 触发条件摘要 / 更新·操作人·来源</div>
            <div>操作</div>
          </div>
          {loading ? (
            <div className="zy-skill-rank-loading">榜单加载中...</div>
          ) : skills.length === 0 ? (
            <EmptyState description="暂无 Skill 数据，可点击“手动同步”或“新增 Skill”" />
          ) : (
            skills.map((record, index) => (
              <div
                key={record.id}
                className="zy-skill-rank-row"
                onClick={() => {
                  void openDetail(record.id);
                }}
              >
                <div className="zy-skill-rank-number">{record.rank ?? index + 1}</div>
                <div className="zy-skill-rank-main">
                  <Space size={8} wrap>
                    {getSkillSourceType(record) === "own" ? (
                      <Tag color="blue">【自有】</Tag>
                    ) : (
                      <Tag color="orange">【外部爬取】</Tag>
                    )}
                    <Typography.Text strong>{record.name}</Typography.Text>
                    <Tag color="geekblue">{record.category}</Tag>
                  </Space>
                  <Typography.Text type="secondary" className="zy-skill-rank-repo" style={{ display: "block", marginTop: 4 }}>
                    触发条件：{(record.triggerCondition ?? "").trim().slice(0, 20) || "-"}
                    {(record.triggerCondition ?? "").trim().length > 20 ? "…" : ""}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {record.updatedAt}
                    {getSkillSourceType(record) === "own" ? ` · ${record.author}` : ` · ${getSourceChannelLabel(record)}`}
                  </Typography.Text>
                  <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                    {record.tags.slice(0, 4).map((item) => (
                      <Tag key={`${record.id}-${item}`}>{item}</Tag>
                    ))}
                  </Space>
                </div>
                <div
                  className="zy-skill-rank-side"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Typography.Text className="zy-skill-rank-installs">
                    {record.installsText || "-"}
                  </Typography.Text>
                  <Space size={4} wrap>
                    {canMaintain(record) && (
                      <Switch
                        size="small"
                        checked={record.status === "enabled"}
                        loading={togglingId === record.id}
                        disabled={syncing}
                        onChange={(checked) => {
                          void (async () => {
                            setTogglingId(record.id);
                            const session = authApi.getSessionSync();
                            const operator = session?.displayName ?? session?.username ?? "未登录";
                            try {
                              await domainApi.toggleSkillStatus(record.id, checked, session?.userId);
                              domainApi.appendOperationLog({
                                module: "skill_lib",
                                moduleName: "Skill 库",
                                actionType: "状态切换",
                                actionSummary: `将 Skill「${record.name}」${checked ? "启用" : "停用"}`,
                                relatedObject: record.name,
                                operator,
                                operatorId: session?.userId,
                                status: "成功",
                              });
                              await load();
                              messageApi.success("状态更新成功");
                            } catch (error) {
                              const text = error instanceof Error ? error.message : "未知错误";
                              domainApi.appendOperationLog({
                                module: "skill_lib",
                                moduleName: "Skill 库",
                                actionType: "状态切换",
                                actionSummary: `将 Skill「${record.name}」${checked ? "启用" : "停用"}`,
                                relatedObject: record.name,
                                operator,
                                operatorId: session?.userId,
                                status: "失败",
                                failReason: text,
                              });
                              messageApi.error(`状态更新失败：${text}`);
                            } finally {
                              setTogglingId(null);
                            }
                          })();
                        }}
                      />
                    )}
                    <Button
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => {
                        void openDetail(record.id);
                      }}
                    >
                      查看
                    </Button>
                    {canMaintain(record) && (
                      <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditSkill(record);
                          setEditOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                    )}
                    {!record.isCustom && (
                      <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditSkill(record);
                          setEditOpen(true);
                        }}
                      >
                        复制
                      </Button>
                    )}
                    <Button
                      type="link"
                      size="small"
                      icon={<LinkOutlined />}
                      onClick={() => {
                        navigate("/domain/metrics", { state: { bindSkillIds: [record.id] } });
                      }}
                    >
                      关联问数
                    </Button>
                  </Space>
                </div>
              </div>
            ))
          )}

        {total > 0 && (
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger={false}
              showQuickJumper
              showTotal={(t) => `共 ${t} 条`}
              onChange={(p) => void load({ page: p })}
            />
          </div>
        )}
        </div>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          最近同步时间：{lastSyncAt || "-"}（数据源：skills.sh，本地代理手动触发，支持 All Time/Trending/Hot）
        </Typography.Text>
      </Card>

      <SkillDetailModal
        open={detailOpen}
        loading={detailLoading}
        skill={detailSkill}
        onCancel={() => {
          setDetailOpen(false);
          setDetailSkill(null);
        }}
        currentUserId={session?.userId}
        onEdit={(s) => {
          setDetailOpen(false);
          setDetailSkill(null);
          setEditSkill(s);
          setEditOpen(true);
        }}
      />

      <SkillEditModal
        open={editOpen}
        editingSkill={editSkill}
        confirmLoading={saving}
        onCancel={() => {
          setEditOpen(false);
          setEditSkill(null);
        }}
        onSubmit={async (payload) => {
          setSaving(true);
          const session = authApi.getSessionSync();
          const operator = session?.displayName ?? "当前用户";
          try {
            await domainApi.saveSkill(
              payload,
              session?.displayName ?? "当前用户",
              session?.userId,
            );
            const isCloneFromOfficial = Boolean(editSkill && !editSkill.isCustom);
            domainApi.appendOperationLog({
              module: "skill_lib",
              moduleName: "Skill 库",
              actionType: editSkill ? "编辑" : "新增",
              actionSummary: isCloneFromOfficial ? `另存为自定义 Skill：${payload.name}` : (editSkill ? `编辑 Skill：${payload.name}` : `新增 Skill：${payload.name}`),
              relatedObject: payload.name,
              operator,
              operatorId: session?.userId,
              status: "成功",
            });
            if (isCloneFromOfficial) {
              messageApi.success("已生成自定义 Skill 副本");
            } else {
              messageApi.success(editSkill ? "Skill 更新成功" : "Skill 创建成功");
            }
            setEditOpen(false);
            setEditSkill(null);
            await load();
          } catch (error) {
            const text = error instanceof Error ? error.message : "未知错误";
            domainApi.appendOperationLog({
              module: "skill_lib",
              moduleName: "Skill 库",
              actionType: editSkill ? "编辑" : "新增",
              actionSummary: editSkill ? `编辑 Skill：${payload.name}` : `新增 Skill：${payload.name}`,
              relatedObject: payload.name,
              operator,
              operatorId: session?.userId,
              status: "失败",
              failReason: text,
            });
            messageApi.error(`Skill 保存失败：${text}`);
          } finally {
            setSaving(false);
          }
        }}
      />

      <SkillImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={async () => {
          setImportOpen(false);
          await load({ page: 1 });
        }}
        currentUserId={session?.userId}
        currentUserName={session?.displayName ?? "当前用户"}
      />
    </>
  );
}
