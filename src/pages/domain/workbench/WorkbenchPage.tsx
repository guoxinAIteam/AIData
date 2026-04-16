import {
  ApiOutlined,
  BookOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  HistoryOutlined,
  RiseOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  TagsOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Card, Col, List, Row, Space, Statistic, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { domainApi } from "../../../services/mockApi";
import type { SkillItem, TraceRecord, TraceStat, TraceTrendPoint } from "../../../types/domain";
import { SkillCarousel } from "../../../components/domain/workbench/SkillCarousel";

const quickEntries = [
  {
    title: "智能指标问数",
    desc: "自然语言提问，RAG 检索知识库上下文，自动生成可执行 SQL。",
    to: "/domain/metric-qa",
    icon: <SearchOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
  {
    title: "语义知识库",
    desc: "管理数据集、指标、维度，RAG 素材切片与语义检索。",
    to: "/domain/knowledge-systems",
    icon: <CloudServerOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
  {
    title: "Skill 库",
    desc: "查看技能排行、详情与用户自定义 Skill 管理。",
    to: "/domain/skills",
    icon: <ThunderboltOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
  {
    title: "样本打标",
    desc: "上传参考分类与样例问题清单，由大模型打标并支持人工复核。",
    to: "/domain/question-labeling",
    icon: <TagsOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
  {
    title: "业务术语词典",
    desc: "维护业务术语、同义词与解释，支撑语义匹配。",
    to: "/domain/glossary",
    icon: <UnorderedListOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
  {
    title: "本体知识建模",
    desc: "构建领域本体概念、属性与关系，驱动知识图谱推理。",
    to: "/domain/ontology-modeling",
    icon: <BookOutlined style={{ fontSize: 28, color: "#1677ff" }} />,
  },
];

interface WorkbenchSummary {
  knowledgeSystemCount: number;
  skillCount: number;
  questionLabelingJobCount: number;
  glossaryTermCount: number;
  lastSkillSyncAt: string;
  traceStats: TraceStat;
  traceTrend: TraceTrendPoint[];
  traceRecordCount: number;
  skillList: SkillItem[];
  recentTraceRecords: TraceRecord[];
}

const defaultSummary: WorkbenchSummary = {
  knowledgeSystemCount: 0,
  skillCount: 0,
  questionLabelingJobCount: 0,
  glossaryTermCount: 0,
  lastSkillSyncAt: "",
  traceStats: {
    score: 0,
    successRate: 0,
    avgLatency: 0,
    totalLatency: 0,
  },
  traceTrend: [],
  traceRecordCount: 0,
  skillList: [],
  recentTraceRecords: [],
};

export function WorkbenchPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WorkbenchSummary>(defaultSummary);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    Promise.all([
      domainApi.getKnowledgeSystems(),
      domainApi.getSkillRanking({ page: 1, pageSize: 100 }),
      domainApi.getTraceDashboard({ keyword: "", status: "全部", model: "全部" }),
      domainApi.getQuestionLabelingJobs(),
      domainApi.getGlossaryTerms({}),
    ])
      .then(([knowledgeList, skillRes, traceRes, labelingJobs, glossaryTerms]) => {
        if (cancelled) return;
        setSummary({
          knowledgeSystemCount: knowledgeList.length,
          skillCount: skillRes.total,
          questionLabelingJobCount: labelingJobs.length,
          glossaryTermCount: glossaryTerms.length,
          lastSkillSyncAt: skillRes.lastSyncAt,
          traceStats: traceRes.stats,
          traceTrend: traceRes.trend,
          traceRecordCount: traceRes.records.length,
          skillList: skillRes.list.slice(0, 8),
          recentTraceRecords: traceRes.records.slice(0, 5),
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <Typography.Text type="danger">工作台数据加载失败：{error}</Typography.Text>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }} className="zy-workbench">
      <Card
        title={
          <Space>
            <DashboardOutlined />
            <span>工作台总览</span>
          </Space>
        }
        loading={loading}
        className="zy-workbench-section"
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="已启用知识库"
                value={summary.knowledgeSystemCount}
                prefix={<BookOutlined style={{ color: "#1677ff" }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="Skill 总数"
                value={summary.skillCount}
                prefix={<ThunderboltOutlined style={{ color: "#1677ff" }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="样本打标任务"
                value={summary.questionLabelingJobCount}
                prefix={<TagsOutlined style={{ color: "#1677ff" }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="业务术语数"
                value={summary.glossaryTermCount}
                prefix={<UnorderedListOutlined style={{ color: "#1677ff" }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="问数请求"
                value={summary.traceRecordCount}
                prefix={<ApiOutlined style={{ color: "#1677ff" }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8} lg={4}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="成功率"
                value={summary.traceStats.successRate}
                precision={2}
                suffix="%"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={12} lg={12}>
            <Card className="zy-card-hover zy-workbench-metric-card" size="small">
              <Statistic
                title="平均耗时"
                value={summary.traceStats.avgLatency}
                precision={0}
                suffix="ms"
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={12} lg={12}>
            <Card className="zy-card-hover zy-workbench-metric-card zy-workbench-trend-card" size="small">
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                耗时趋势
              </Typography.Text>
              <div style={{ height: 56, marginTop: 4 }}>
                {summary.traceTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={summary.traceTrend} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                      <XAxis dataKey="time" hide />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip formatter={(v) => [v != null ? `${v} ms` : "-", "耗时"]} contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="latency" stroke="#1677ff" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    暂无趋势数据
                  </Typography.Text>
                )}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space>
            <ThunderboltOutlined />
            <span>Skill 能力</span>
          </Space>
        }
        className="zy-workbench-section"
      >
        <SkillCarousel skills={summary.skillList} loading={loading} />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="快捷入口"
            className="zy-workbench-section"
          >
            <Row gutter={[12, 12]}>
              {quickEntries.map((item) => (
                <Col xs={24} md={8} key={item.title}>
                  <Link to={item.to} style={{ display: "block" }}>
                    <Card className="zy-card-hover" size="small">
                      <Space align="start" size={12}>
                        {item.icon}
                        <div>
                          <Typography.Title level={5} style={{ margin: 0 }}>
                            {item.title}
                          </Typography.Title>
                          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                            {item.desc}
                          </Typography.Paragraph>
                          <Typography.Link style={{ fontSize: 12 }}>进入功能</Typography.Link>
                        </div>
                      </Space>
                    </Card>
                  </Link>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <HistoryOutlined />
                <span>最近执行</span>
              </Space>
            }
            extra={
              summary.recentTraceRecords.length > 0 ? (
                <Link to="/domain/operation-logs">查看全部</Link>
              ) : null
            }
            className="zy-workbench-section"
          >
            {summary.recentTraceRecords.length === 0 ? (
              <Typography.Text type="secondary">暂无执行记录</Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={summary.recentTraceRecords}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ width: "100%" }}>
                      <Typography.Text ellipsis style={{ display: "block" }}>
                        {item.question}
                      </Typography.Text>
                      <Space size={8} style={{ marginTop: 4 }}>
                        <Tag color={item.status === "成功" ? "green" : "red"}>{item.status}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {item.executionTime} ms
                        </Typography.Text>
                      </Space>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
