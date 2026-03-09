import { LinkOutlined } from "@ant-design/icons";
import { Button, Modal, Table, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../common/EmptyState";

export interface KnowledgeEntryLink {
  knowledgeSystemId: string;
  knowledgeSystemName?: string;
  entryId: string;
  entryTitle: string;
  entryType: "metric" | "dimension";
}

interface GlossaryReferenceModalProps {
  open: boolean;
  term: string;
  references: string[];
  knowledgeEntries?: KnowledgeEntryLink[];
  onCancel: () => void;
}

export function GlossaryReferenceModal({
  open,
  term,
  references,
  knowledgeEntries = [],
  onCancel,
}: GlossaryReferenceModalProps) {
  const navigate = useNavigate();

  return (
    <Modal title={`术语引用 - ${term}`} open={open} footer={null} onCancel={onCancel} width={860}>
      <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
        引用该术语的自然语言问题
      </Typography.Text>
      {references.length === 0 ? (
        <EmptyState description="当前术语暂无引用问题" />
      ) : (
        <Table
          rowKey={(_, i) => String(i)}
          pagination={false}
          dataSource={references.map((item, index) => ({ id: index + 1, question: item }))}
          locale={{ emptyText: "暂无引用问题" }}
          columns={[
            { title: "序号", dataIndex: "id", width: 70 },
            { title: "自然语言问题", dataIndex: "question" },
          ]}
        />
      )}

      <Typography.Text strong style={{ display: "block", marginTop: 20, marginBottom: 8 }}>
        关联的语义知识库条目
      </Typography.Text>
      {knowledgeEntries.length === 0 ? (
        <EmptyState description="暂无关联的语义知识库条目" />
      ) : (
        <Table<KnowledgeEntryLink>
          rowKey={(r) => `${r.knowledgeSystemId}-${r.entryId}`}
          pagination={false}
          dataSource={knowledgeEntries}
          size="small"
          columns={[
            { title: "知识库", dataIndex: "knowledgeSystemName", key: "knowledgeSystemName", width: 140, ellipsis: true, render: (name: string, r: KnowledgeEntryLink) => name || r.knowledgeSystemId },
            { title: "条目标题", dataIndex: "entryTitle" },
            {
              title: "类型",
              dataIndex: "entryType",
              width: 80,
              render: (t: string) => (t === "metric" ? "指标" : "维度"),
            },
            {
              title: "操作",
              key: "action",
              width: 100,
              render: (_, row) => (
                <Button
                  type="link"
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() =>
                    navigate(
                      `/domain/knowledge-systems/${row.knowledgeSystemId}/manage/${row.entryType === "metric" ? "metrics" : "dimensions"}`,
                      { state: { highlightEntryId: row.entryId } },
                    )
                  }
                >
                  跳转
                </Button>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}
