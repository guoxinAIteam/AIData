import { Card, Carousel, Empty, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import type { SkillItem } from "../../../types/domain";

const SLICE_SIZE = 3;

interface SkillCarouselProps {
  skills: SkillItem[];
  loading?: boolean;
  onSkillClick?: (skill: SkillItem) => void;
}

export function SkillCarousel({ skills, loading, onSkillClick }: SkillCarouselProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="zy-skill-carousel zy-skill-carousel-loading">
        <Typography.Text type="secondary">加载中…</Typography.Text>
      </div>
    );
  }

  if (!skills.length) {
    return (
      <div className="zy-skill-carousel">
        <Empty description="暂无 Skill 数据，请先同步榜单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const slices: SkillItem[][] = [];
  for (let i = 0; i < skills.length; i += SLICE_SIZE) {
    slices.push(skills.slice(i, i + SLICE_SIZE));
  }

  const handleCardClick = (skill: SkillItem) => {
    if (onSkillClick) {
      onSkillClick(skill);
    } else {
      navigate("/domain/skills");
    }
  };

  return (
    <div className="zy-skill-carousel">
      <Carousel autoplay effect="fade" dots={{ className: "zy-skill-carousel-dots" }}>
        {slices.map((chunk, idx) => (
          <div key={idx} className="zy-skill-carousel-slide">
            <Space size={12} wrap style={{ width: "100%", justifyContent: "flex-start" }}>
              {chunk.map((skill) => (
                <Card
                  key={skill.id}
                  className="zy-card-hover zy-skill-carousel-card"
                  size="small"
                  style={{ flex: "1 1 200px", minWidth: 0, maxWidth: 360 }}
                  onClick={() => handleCardClick(skill)}
                >
                  <Typography.Title level={5} ellipsis style={{ marginBottom: 4 }}>
                    {skill.name}
                  </Typography.Title>
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{ fontSize: 12, marginBottom: 8 }}
                  >
                    {skill.summary || "暂无简介"}
                  </Typography.Paragraph>
                  <Space size={[4, 4]} wrap>
                    {skill.installsText && (
                      <Tag color="blue">{skill.installsText}</Tag>
                    )}
                    <Tag>{skill.category}</Tag>
                    {skill.tags.slice(0, 2).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </Space>
                </Card>
              ))}
            </Space>
          </div>
        ))}
      </Carousel>
    </div>
  );
}
