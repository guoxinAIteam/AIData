import {
  CloudUploadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Input,
  List,
  Modal,
  Progress,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { RAGChunk, RAGCollectionStats } from "../../../types/domain";

const { Text, Paragraph } = Typography;
const { Search } = Input;

interface KnowledgeRAGTabProps {
  systemId: string;
  onSaved?: () => void;
  isCreator?: boolean;
}

export function KnowledgeRAGTab({
  systemId,
  onSaved,
  isCreator = true,
}: KnowledgeRAGTabProps) {
  const [stats, setStats] = useState<RAGCollectionStats | null>(null);
  const [chunks, setChunks] = useState<RAGChunk[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const [ingesting, setIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState(0);
  const [folderPath, setFolderPath] = useState("");
  const [folderModalOpen, setFolderModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RAGChunk[]>([]);
  const [searching, setSearching] = useState(false);

  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploadIngesting, setUploadIngesting] = useState(false);

  const collectionId = systemId;

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/text2sql/rag/stats/${collectionId}`);
      const data = await res.json();
      if (data.success) {
        setStats({
          collection_id: data.collection_id,
          chunk_count: data.chunk_count,
          file_count: data.file_count,
          file_sources: data.file_sources,
        });
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingStats(false);
    }
  }, [collectionId]);

  const loadChunks = useCallback(
    async (offset = 0) => {
      setLoadingChunks(true);
      try {
        const res = await fetch("/api/text2sql/rag/list-chunks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection_id: collectionId, limit: 50, offset }),
        });
        const data = await res.json();
        if (data.success) {
          setChunks(data.chunks ?? []);
          setTotalChunks(data.total ?? 0);
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingChunks(false);
      }
    },
    [collectionId],
  );

  useEffect(() => {
    void loadStats();
    void loadChunks();
  }, [loadStats, loadChunks]);

  const handleIngestFolder = async () => {
    if (!folderPath.trim()) {
      message.warning("请输入文件夹路径");
      return;
    }
    setIngesting(true);
    setIngestProgress(30);
    try {
      const res = await fetch("/api/text2sql/rag/ingest-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: collectionId,
          folder_path: folderPath.trim(),
        }),
      });
      setIngestProgress(80);
      const data = await res.json();
      if (data.success) {
        message.success(
          `导入成功：${data.chunk_count} 个切片，来自 ${data.file_count} 个文件`,
        );
        setFolderModalOpen(false);
        setFolderPath("");
        void loadStats();
        void loadChunks();
        onSaved?.();
      } else {
        message.error(data.error || "导入失败");
      }
    } catch (err) {
      message.error("导入请求失败");
    } finally {
      setIngestProgress(100);
      setTimeout(() => {
        setIngesting(false);
        setIngestProgress(0);
      }, 500);
    }
  };

  const handleUploadIngest = async () => {
    if (fileList.length === 0) {
      message.warning("请先选择文件");
      return;
    }
    setUploadIngesting(true);
    try {
      const paths = fileList
        .map((f) => (f as any).originFileObj?.path || f.name)
        .filter(Boolean);
      if (paths.length === 0) {
        message.warning("无法获取文件路径，请使用文件夹导入");
        return;
      }
      const res = await fetch("/api/text2sql/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection_id: collectionId, file_paths: paths }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(
          `导入成功：${data.chunk_count} 个切片，来自 ${data.file_count} 个文件`,
        );
        setFileList([]);
        void loadStats();
        void loadChunks();
        onSaved?.();
      } else {
        message.error(data.error || "导入失败");
      }
    } catch {
      message.error("导入请求失败");
    } finally {
      setUploadIngesting(false);
    }
  };

  const handleSearch = async (value: string) => {
    if (!value.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/text2sql/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collection_id: collectionId,
          query_text: value.trim(),
          top_k: 8,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.chunks ?? []);
      }
    } catch {
      message.error("检索失败");
    } finally {
      setSearching(false);
    }
  };

  const handleDeleteCollection = async () => {
    try {
      const res = await fetch(`/api/text2sql/rag/collection/${collectionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        message.success("集合已清空");
        void loadStats();
        setChunks([]);
        setTotalChunks(0);
        setSearchResults([]);
        onSaved?.();
      }
    } catch {
      message.error("清空失败");
    }
  };

  const chunkColumns = [
    {
      title: "来源文件",
      dataIndex: ["metadata", "source_file"],
      key: "source",
      width: 180,
      render: (v: string) => <Tag>{v || "unknown"}</Tag>,
    },
    {
      title: "切片类型",
      dataIndex: ["metadata", "chunk_type"],
      key: "type",
      width: 120,
      render: (v: string) => {
        const map: Record<string, string> = {
          markdown_section: "Markdown",
          excel_row: "Excel",
          text_paragraph: "文本段落",
        };
        return <Tag color="blue">{map[v] || v}</Tag>;
      },
    },
    {
      title: "段落标题",
      dataIndex: ["metadata", "section_title"],
      key: "section",
      width: 150,
      ellipsis: true,
    },
    {
      title: "内容预览",
      dataIndex: "text",
      key: "text",
      ellipsis: true,
      render: (v: string) => (
        <Text style={{ fontSize: 12 }}>
          {v && v.length > 120 ? v.slice(0, 120) + "..." : v}
        </Text>
      ),
    },
    {
      title: "字符数",
      dataIndex: "text",
      key: "chars",
      width: 80,
      render: (v: string) => v?.length ?? 0,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <Card size="small" loading={loadingStats}>
        <Row gutter={24}>
          <Col span={6}>
            <Statistic title="总切片数" value={stats?.chunk_count ?? 0} />
          </Col>
          <Col span={6}>
            <Statistic title="文件来源数" value={stats?.file_count ?? 0} />
          </Col>
          <Col span={12}>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                文件来源：
              </Text>
              <div style={{ marginTop: 4 }}>
                {stats?.file_sources?.map((f) => (
                  <Tag key={f} style={{ marginBottom: 4 }}>
                    {f}
                  </Tag>
                )) || <Text type="secondary">暂无数据</Text>}
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Import Area */}
      <Card
        title="素材导入"
        size="small"
        extra={
          isCreator && (
            <Space>
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={() => {
                  Modal.confirm({
                    title: "确认清空",
                    content: "清空后所有切片数据将丢失，确认继续？",
                    onOk: handleDeleteCollection,
                  });
                }}
                disabled={!stats?.chunk_count}
              >
                清空集合
              </Button>
            </Space>
          )
        }
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space>
            <Button
              icon={<FolderOpenOutlined />}
              onClick={() => setFolderModalOpen(true)}
              disabled={!isCreator}
            >
              文件夹导入
            </Button>
            <Upload
              multiple
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: fl }) => setFileList(fl)}
              accept=".md,.xlsx,.txt,.csv"
              disabled={!isCreator}
            >
              <Button icon={<CloudUploadOutlined />} disabled={!isCreator}>
                选择文件
              </Button>
            </Upload>
            {fileList.length > 0 && (
              <Button
                type="primary"
                onClick={handleUploadIngest}
                loading={uploadIngesting}
                disabled={!isCreator}
              >
                开始切片入库 ({fileList.length} 个文件)
              </Button>
            )}
          </Space>
          {ingesting && <Progress percent={ingestProgress} size="small" />}
        </Space>
      </Card>

      {/* Search Area */}
      <Card title="语义检索测试" size="small">
        <Search
          placeholder="输入自然语言查询，测试 RAG 检索效果"
          enterButton={
            <Button icon={<SearchOutlined />} type="primary">
              检索
            </Button>
          }
          loading={searching}
          onSearch={handleSearch}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="large"
          style={{ marginBottom: 16 }}
        />
        {searchResults.length > 0 && (
          <List
            dataSource={searchResults}
            renderItem={(item: RAGChunk, idx: number) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color="green">#{idx + 1}</Tag>
                      <Tag>{item.metadata?.source_file}</Tag>
                      {item.metadata?.section_title && (
                        <Tag color="blue">{item.metadata.section_title}</Tag>
                      )}
                      <Text type="secondary">
                        相似度: {((item.score ?? 0) * 100).toFixed(1)}%
                      </Text>
                    </Space>
                  }
                  description={
                    <Collapse
                      size="small"
                      items={[
                        {
                          key: "1",
                          label: (
                            <Text style={{ fontSize: 12 }}>
                              {item.text?.slice(0, 100)}...
                            </Text>
                          ),
                          children: (
                            <Paragraph
                              style={{
                                whiteSpace: "pre-wrap",
                                fontSize: 12,
                                maxHeight: 200,
                                overflow: "auto",
                              }}
                            >
                              {item.text}
                            </Paragraph>
                          ),
                        },
                      ]}
                    />
                  }
                />
              </List.Item>
            )}
          />
        )}
        {searchResults.length === 0 && searchQuery && !searching && (
          <Empty description="无匹配结果" />
        )}
      </Card>

      {/* Chunk Browser */}
      <Card title="切片浏览" size="small">
        <Table
          dataSource={chunks}
          columns={chunkColumns}
          rowKey="id"
          size="small"
          loading={loadingChunks}
          pagination={{
            total: totalChunks,
            pageSize: 50,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page) => void loadChunks((page - 1) * 50),
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Folder Import Modal */}
      <Modal
        title="文件夹导入"
        open={folderModalOpen}
        onOk={handleIngestFolder}
        onCancel={() => setFolderModalOpen(false)}
        confirmLoading={ingesting}
        okText="开始导入"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Alert
            message="请输入服务器端文件夹的绝对路径或相对于项目根目录的路径"
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
          />
          <Input
            placeholder="例如: s1.5 - 副本 (2)"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            size="large"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            支持格式：.md / .xlsx / .txt
          </Text>
        </Space>
      </Modal>
    </div>
  );
}
