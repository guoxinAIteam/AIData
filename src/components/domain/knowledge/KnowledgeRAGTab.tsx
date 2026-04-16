import { DeleteOutlined, SearchOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Card, Input, Space, Table, Tag, Typography, message } from "antd";
import { useMemo, useState } from "react";
import type { RAGChunk, RAGCollectionStats } from "../../../types/domain";

interface KnowledgeRAGTabProps {
  systemId: string;
}

const DEFAULT_FOLDER = "/Users/anzp/environment/AIData/s1.5 - 副本 (2)";

export function KnowledgeRAGTab({ systemId }: KnowledgeRAGTabProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [folderPath, setFolderPath] = useState(DEFAULT_FOLDER);
  const [queryText, setQueryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<RAGCollectionStats | null>(null);
  const [chunks, setChunks] = useState<RAGChunk[]>([]);

  const collectionId = useMemo(() => systemId, [systemId]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/text2sql/rag/stats/${encodeURIComponent(collectionId)}`);
      const data = (await res.json()) as { success?: boolean } & RAGCollectionStats & { error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "加载统计失败");
      }
      setStats({
        collection_id: data.collection_id,
        chunk_count: data.chunk_count,
        file_count: data.file_count,
        file_sources: data.file_sources ?? [],
      });
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "加载统计失败");
    } finally {
      setLoading(false);
    }
  };

  const ingestFolder = async () => {
    if (!folderPath.trim()) {
      messageApi.warning("请先输入素材文件夹路径");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/text2sql/rag/ingest-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: collectionId,
          folder_path: folderPath.trim(),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        ingested_files?: string[];
        ingested_chunk_count?: number;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "入库失败");
      }
      messageApi.success(`入库完成：${data.ingested_files?.length ?? 0} 个文件，${data.ingested_chunk_count ?? 0} 个切片`);
      await loadStats();
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "入库失败");
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    if (!queryText.trim()) {
      messageApi.warning("请输入检索问题");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/text2sql/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: collectionId,
          query_text: queryText.trim(),
          top_k: 10,
        }),
      });
      const data = (await res.json()) as { success?: boolean; items?: RAGChunk[]; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "检索失败");
      }
      setChunks(data.items ?? []);
      messageApi.success(`检索完成：命中 ${data.items?.length ?? 0} 条切片`);
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  const clearCollection = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/text2sql/rag/collection/${encodeURIComponent(collectionId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "清空失败");
      }
      setChunks([]);
      setStats(null);
      messageApi.success("向量集合已清空");
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "清空失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {contextHolder}
      <Card title="素材导入（切片入库）" extra={<Button onClick={() => void loadStats()}>刷新统计</Button>}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="输入服务器可访问的素材文件夹绝对路径"
          />
          <Space>
            <Button type="primary" icon={<UploadOutlined />} loading={loading} onClick={() => void ingestFolder()}>
              导入文件夹并切片
            </Button>
            <Button danger icon={<DeleteOutlined />} loading={loading} onClick={() => void clearCollection()}>
              清空向量集合
            </Button>
          </Space>
          {stats ? (
            <Typography.Text type="secondary">
              当前集合 `{stats.collection_id}`：{stats.chunk_count} 个切片，{stats.file_count} 个文件
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">点击「刷新统计」查看当前集合状态。</Typography.Text>
          )}
          {!!stats?.file_sources?.length && (
            <Space wrap>
              {stats.file_sources.map((f) => (
                <Tag key={f}>{f}</Tag>
              ))}
            </Space>
          )}
        </Space>
      </Card>

      <Card title="检索测试">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.TextArea
            rows={2}
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="例如：202512 分省移网新发展用户数口径"
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void runQuery()}>
            语义检索
          </Button>
          <Table<RAGChunk>
            size="small"
            rowKey={(r) => r.id}
            dataSource={chunks}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: "来源文件", dataIndex: ["metadata", "source_file"], width: 220, ellipsis: true },
              {
                title: "类型",
                dataIndex: ["metadata", "chunk_type"],
                width: 130,
                render: (v: string) => <Tag>{v}</Tag>,
              },
              {
                title: "得分",
                dataIndex: "score",
                width: 90,
                render: (v: number | undefined) => (v != null ? v.toFixed(4) : "-"),
              },
              {
                title: "切片内容",
                dataIndex: "text",
                render: (v: string) => (
                  <Typography.Paragraph ellipsis={{ rows: 3, expandable: true, symbol: "展开" }} style={{ marginBottom: 0 }}>
                    {v}
                  </Typography.Paragraph>
                ),
              },
            ]}
            locale={{ emptyText: "暂无检索结果，先导入素材后再检索。" }}
          />
        </Space>
      </Card>
    </Space>
  );
}
