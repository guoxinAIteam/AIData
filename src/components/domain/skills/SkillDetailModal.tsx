import { Modal, Skeleton, Space, Tag, Typography, Button, Collapse } from "antd";
import type { SkillItem } from "../../../types/domain";
import { getSkillSourceType } from "../../../types/domain";
import { EmptyState } from "../../common/EmptyState";

function getSourceDetailLabel(skill: SkillItem): string {
  if (getSkillSourceType(skill) === "external_crawl") {
    return "skills.sh 爬虫渠道";
  }
  switch (skill.importSource) {
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

interface SkillDetailModalProps {
  open: boolean;
  loading?: boolean;
  skill: SkillItem | null;
  onCancel: () => void;
  /** 当前用户 ID，用于判断是否展示/编辑检查清单（仅创建者可见） */
  currentUserId?: string;
  /** 创建者点击编辑时回调（如打开编辑弹窗） */
  onEdit?: (skill: SkillItem) => void;
}

export function SkillDetailModal({
  open,
  loading = false,
  skill,
  onCancel,
  currentUserId,
  onEdit,
}: SkillDetailModalProps) {
  return (
    <Modal title={skill?.name ?? "Skill 详情"} open={open} footer={null} onCancel={onCancel} width={820}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !skill ? (
        <EmptyState description="未找到 Skill 详情" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Paragraph>{skill.summary}</Typography.Paragraph>
          <Space wrap>
            {getSkillSourceType(skill) === "own" ? (
              <Tag color="blue">【自有】</Tag>
            ) : (
              <Tag color="orange">【外部爬取】</Tag>
            )}
            <Tag color="blue">{skill.category}</Tag>
            <Tag color={skill.status === "enabled" ? "success" : "default"}>
              {skill.status === "enabled" ? "启用" : "停用"}
            </Tag>
            {skill.installsText ? <Tag color="gold">安装量 {skill.installsText}</Tag> : null}
            {skill.tags.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </Space>
          <Typography.Paragraph>
            <strong>来源类型：</strong>
            {getSkillSourceType(skill) === "own" ? "自有" : "外部爬取"}
            {" · "}
            <strong>来源详情：</strong>
            {getSourceDetailLabel(skill)}
            {skill.sourceUrl ? (
              <>
                {" "}
                <Typography.Link href={skill.sourceUrl} target="_blank" rel="noreferrer">
                  查看原始页面
                </Typography.Link>
              </>
            ) : null}
          </Typography.Paragraph>
          <Typography.Paragraph>
            <strong>作者：</strong>
            {skill.author}
          </Typography.Paragraph>
          {skill.owner && skill.repository ? (
            <Typography.Paragraph>
              <strong>仓库：</strong>
              {skill.owner}/{skill.repository}
            </Typography.Paragraph>
          ) : null}
          <Typography.Paragraph>
            <strong>更新时间：</strong>
            {skill.updatedAt}
          </Typography.Paragraph>
          <Typography.Paragraph>
            <strong>适用场景：</strong>
            {skill.applicableScenes.length > 0 ? skill.applicableScenes.join("、") : "暂无"}
          </Typography.Paragraph>
          {skill.createdByUserId !== undefined && skill.createdByUserId === currentUserId && (
            <>
              <Typography.Paragraph>
                <strong>检查清单（仅创建者可见）</strong>
                {onEdit ? (
                  <Button type="link" size="small" style={{ marginLeft: 8 }} onClick={() => onEdit(skill)}>
                    编辑
                  </Button>
                ) : null}
              </Typography.Paragraph>
              <Collapse
                items={[
                  {
                    key: "checklist",
                    label: "触发条件、输入、步骤、检查、中止条件、恢复方式",
                    children: (
                      <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <div>
                          <Typography.Text type="secondary">触发条件：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.triggerCondition || "—"}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">输入：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.inputSpec || "—"}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">步骤：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.steps || "—"}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">检查：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.checkCriteria || "—"}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">中止条件：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.abortCondition || "—"}
                          </Typography.Paragraph>
                        </div>
                        <div>
                          <Typography.Text type="secondary">恢复方式：</Typography.Text>
                          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: "pre-wrap" }}>
                            {skill.recoveryMethod || "—"}
                          </Typography.Paragraph>
                        </div>
                      </Space>
                    ),
                  },
                ]}
              />
            </>
          )}
          <Typography.Paragraph>
            <strong>完整内容：</strong>
            <br />
            <span style={{ whiteSpace: "pre-wrap" }}>{skill.content || "暂无详细内容"}</span>
          </Typography.Paragraph>
        </Space>
      )}
    </Modal>
  );
}
