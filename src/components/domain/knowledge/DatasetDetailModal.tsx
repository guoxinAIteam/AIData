import { DownloadOutlined } from "@ant-design/icons";
import { Button, Descriptions, Modal, Pagination, Space, Table, Tabs, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { domainApi } from "../../../services/mockApi";
import type { DatasetDetailView, ReadOnlyQueryResult } from "../../../types/domain";

const PAGE_SIZE = 20;
const DEFAULT_SQL = "SELECT * FROM {tableName} LIMIT 100";

interface DatasetDetailModalProps {
  open: boolean;
  systemId: string;
  datasetId: string | null;
  datasetName?: string;
  onCancel: () => void;
}

function downloadCsv(columns: string[], rows: Record<string, unknown>[]) {
  const header = columns.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((r) =>
    columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","),
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `query_result_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DatasetDetailModal({
  open,
  systemId,
  datasetId,
  datasetName,
  onCancel,
}: DatasetDetailModalProps) {
  const [detail, setDetail] = useState<DatasetDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [sql, setSql] = useState("");
  const [queryResult, setQueryResult] = useState<ReadOnlyQueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryPage, setQueryPage] = useState(1);
  const [messageApi, contextHolder] = message.useMessage();

  const loadDetail = useCallback(async () => {
    if (!systemId || !datasetId) return;
    setLoading(true);
    try {
      const view = await domainApi.getDatasetDetail(systemId, datasetId);
      setDetail(view);
      const name = view?.importedTable?.name ?? view?.dataset?.name ?? "table";
      setSql(DEFAULT_SQL.replace("{tableName}", name));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [systemId, datasetId]);

  useEffect(() => {
    if (open && systemId && datasetId) {
      loadDetail();
      setQueryResult(null);
      setQueryPage(1);
    }
  }, [open, systemId, datasetId, loadDetail]);

  const runQuery = async () => {
    if (!systemId || !datasetId || !sql.trim()) return;
    const writeRe = /(\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bTRUNCATE\b)/i;
    if (writeRe.test(sql)) {
      messageApi.warning("仅支持 SELECT 只读查询");
      return;
    }
    setQueryLoading(true);
    try {
      const res = await domainApi.runReadOnlyQuery(systemId, datasetId, sql, 1, PAGE_SIZE);
      setQueryResult(res);
      setQueryPage(1);
      messageApi.success("查询成功");
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "查询失败");
      setQueryResult(null);
    } finally {
      setQueryLoading(false);
    }
  };

  const onQueryPageChange = async (page: number) => {
    if (!systemId || !datasetId || !sql.trim()) return;
    setQueryLoading(true);
    try {
      const res = await domainApi.runReadOnlyQuery(systemId, datasetId, sql, page, PAGE_SIZE);
      setQueryResult(res);
      setQueryPage(page);
    } finally {
      setQueryLoading(false);
    }
  };

  const exportCsv = () => {
    if (!queryResult || queryResult.rows.length === 0) {
      messageApi.warning("无数据可导出");
      return;
    }
    downloadCsv(queryResult.columns, queryResult.rows);
    messageApi.success("已导出 CSV");
  };

  const sampleColumns: ColumnsType<Record<string, unknown>> =
    detail?.sampleRows?.length
      ? Object.keys(detail.sampleRows[0]!).map((key) => ({
          title: key,
          dataIndex: key,
          key,
          ellipsis: true,
          render: (v: unknown) => (v != null ? String(v) : "—"),
        }))
      : [];

  const queryColumns: ColumnsType<Record<string, unknown>> =
    queryResult?.columns.map((key) => ({
      title: key,
      dataIndex: key,
      key,
      ellipsis: true,
      render: (v: unknown) => (v != null ? String(v) : "—"),
    })) ?? [];

  if (!open) return null;

  return (
    <>
      {contextHolder}
      <Modal
        title={`数据集详情${datasetName ? `：${datasetName}` : ""}`}
        open={open}
        onCancel={onCancel}
        footer={null}
        width={900}
        destroyOnClose
      >
        {loading ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Typography.Text type="secondary">加载中…</Typography.Text>
          </div>
        ) : !detail ? (
          <Typography.Text type="secondary">未找到数据集详情</Typography.Text>
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: "overview",
                label: "概览",
                children: (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="表名">{detail.dataset.name}</Descriptions.Item>
                    <Descriptions.Item label="字段总数">{detail.dataset.fieldCount}</Descriptions.Item>
                    <Descriptions.Item label="数据量">
                      {detail.importedTable?.rowCount ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="主键字段">
                      {detail.dataset.primaryKey || detail.importedTable?.primaryKey || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="更新时间">
                      {detail.dataset.updatedAt ?? detail.importedTable?.updatedAt ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="数据来源">
                      {detail.dataset.dataSourceLabel ?? detail.importedTable?.sourceType ?? "—"}
                    </Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: "sample",
                label: "数据预览",
                children: (
                  <div style={{ maxHeight: 400, overflow: "auto" }}>
                    <Table
                      size="small"
                      rowKey={(_, i) => String(i)}
                      columns={sampleColumns}
                      dataSource={detail.sampleRows}
                      pagination={false}
                      scroll={{ x: "max-content" }}
                      locale={{ emptyText: "暂无样本" }}
                    />
                  </div>
                ),
              },
              {
                key: "sql",
                label: "SQL 查询",
                children: (
                  <div>
                    <Space direction="vertical" style={{ width: "100%" }} size="middle">
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          仅支持 SELECT；禁止 INSERT/UPDATE/DELETE/DROP 等
                        </Typography.Text>
                        <textarea
                          value={sql}
                          onChange={(e) => setSql(e.target.value)}
                          placeholder="SELECT * FROM table LIMIT 100"
                          style={{
                            width: "100%",
                            minHeight: 80,
                            marginTop: 8,
                            padding: 8,
                            fontFamily: "monospace",
                            fontSize: 13,
                            border: "1px solid #d9d9d9",
                            borderRadius: 6,
                          }}
                        />
                        <Space style={{ marginTop: 8 }}>
                          <Button type="primary" loading={queryLoading} onClick={() => void runQuery()}>
                            执行
                          </Button>
                          {queryResult && (
                            <Button icon={<DownloadOutlined />} onClick={exportCsv}>
                              导出 CSV
                            </Button>
                          )}
                        </Space>
                      </div>
                      {queryResult && (
                        <>
                          <Table
                            size="small"
                            rowKey={(_, i) => String(i)}
                            columns={queryColumns}
                            dataSource={queryResult.rows}
                            pagination={false}
                            scroll={{ x: "max-content" }}
                          />
                          <Pagination
                            current={queryPage}
                            pageSize={PAGE_SIZE}
                            total={queryResult.total}
                            showSizeChanger={false}
                            showTotal={(t) => `共 ${t} 条`}
                            onChange={onQueryPageChange}
                          />
                        </>
                      )}
                    </Space>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Modal>
    </>
  );
}
