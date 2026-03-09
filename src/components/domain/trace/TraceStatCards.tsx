import { CheckCircleOutlined, ClockCircleOutlined, FieldTimeOutlined } from "@ant-design/icons";
import { Card, Col, Progress, Row, Statistic } from "antd";
import type { TraceStat } from "../../../types/domain";

interface TraceStatCardsProps {
  stats: TraceStat;
}

export function TraceStatCards({ stats }: TraceStatCardsProps) {
  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8} xl={6}>
        <Card className="zy-card-hover">
          <Progress type="dashboard" percent={stats.score} strokeColor="#1677ff" size={140} />
        </Card>
      </Col>
      <Col xs={24} md={16} xl={18}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card className="zy-card-hover">
              <Statistic title="成功率" value={stats.successRate} suffix="%" prefix={<CheckCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card className="zy-card-hover">
              <Statistic
                title="平均耗时(ms)"
                value={stats.avgLatency}
                precision={2}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card className="zy-card-hover">
              <Statistic title="累计耗时(ms)" value={stats.totalLatency} prefix={<FieldTimeOutlined />} />
            </Card>
          </Col>
        </Row>
      </Col>
    </Row>
  );
}
