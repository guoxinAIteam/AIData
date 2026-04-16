import { CloudUploadOutlined, DeleteOutlined, EditOutlined, EyeOutlined, ShareAltOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Card, Col, Popconfirm, Row, Space, Statistic, Typography } from "antd";
import type { KnowledgeSystemCard as KnowledgeSystemCardType } from "../../../types/domain";

interface KnowledgeSystemCardProps {
  system: KnowledgeSystemCardType;
  onManage: (id: string) => void;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
  onUpload?: (id: string) => void;
  /** 是否为该知识库对应 Skill 的创建者（仅创建者可见删除） */
  isCreator?: boolean;
}

export function KnowledgeSystemCard({ system, onManage, onView, onDelete, onUpload, isCreator = true }: KnowledgeSystemCardProps) {
  const { message } = AntdApp.useApp();

  return (
    <Card
      className="zy-card-hover"
      size="small"
      title={<Typography.Text strong>{system.name}</Typography.Text>}
      extra={
        <Space size={6}>
          <Button
            size="small"
            type="text"
            icon={<ShareAltOutlined />}
            onClick={() => {
              message.success(`已复制分享链接（POC）：${system.name}`);
            }}
          />
          {isCreator ? (
            <>
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => {
                  message.info("知识库基础信息编辑入口将在下一版本开放");
                }}
              />
              <Popconfirm title="确认删除该知识库？" onConfirm={() => onDelete(system.id)}>
                <Button size="small" danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          ) : null}
        </Space>
      }
      style={{ borderRadius: 10 }}
      bodyStyle={{ paddingTop: 12 }}
    >
      <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ minHeight: 42 }}>
        {system.description}
      </Typography.Paragraph>

      <Row gutter={10} style={{ marginBottom: 10 }}>
        <Col span={12}>
          <Statistic title="知识集合" value={system.datasetCount} />
        </Col>
        <Col span={12}>
          <Statistic title="指标数" value={system.metricCount} />
        </Col>
      </Row>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
        更新人：{system.owner} · 更新时间：{system.updatedAt}
      </Typography.Paragraph>

      <Space wrap>
        <Button size="small" icon={<EyeOutlined />} onClick={() => onView(system.id)}>
          查看语义知识视图
        </Button>
        <Button size="small" type="primary" onClick={() => onManage(system.id)}>
          语义知识管理
        </Button>
        <Button
          size="small"
          icon={<CloudUploadOutlined />}
          onClick={() => onUpload?.(system.id)}
        >
          素材上传
        </Button>
      </Space>
    </Card>
  );
}
