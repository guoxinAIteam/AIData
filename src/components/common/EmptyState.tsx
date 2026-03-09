import { InboxOutlined } from "@ant-design/icons";
import { Empty } from "antd";

interface EmptyStateProps {
  description?: string;
}

export function EmptyState({ description = "暂无数据" }: EmptyStateProps) {
  return (
    <div className="zy-empty-wrap">
      <Empty
        image={<InboxOutlined style={{ fontSize: 44, color: "#b7c1d6" }} />}
        description={description}
      />
    </div>
  );
}
