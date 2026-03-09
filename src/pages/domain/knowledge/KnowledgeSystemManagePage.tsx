import { Alert, Card, Tabs, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { KnowledgeDataSourceTab } from "../../../components/domain/knowledge/KnowledgeDataSourceTab";
import { KnowledgeDatasetTab } from "../../../components/domain/knowledge/KnowledgeDatasetTab";
import { KnowledgeDimensionTab } from "../../../components/domain/knowledge/KnowledgeDimensionTab";
import { KnowledgeMetricTab } from "../../../components/domain/knowledge/KnowledgeMetricTab";
import { authApi, domainApi } from "../../../services/mockApi";
import type { KnowledgeSystemDetail, ImportedTable } from "../../../types/domain";

type ManageTabKey = "datasource" | "datasets" | "metrics" | "dimensions";

const tabItems: Array<{ key: ManageTabKey; label: string }> = [
  { key: "datasource", label: "源数据管理" },
  { key: "datasets", label: "知识集合" },
  { key: "metrics", label: "指标" },
  { key: "dimensions", label: "维度" },
];

export function KnowledgeSystemManagePage() {
  const { id = "", tab = "datasource" } = useParams();
  const navigate = useNavigate();
  const [, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<(KnowledgeSystemDetail & { creatorUserId?: string }) | null>(null);

  const activeKey: ManageTabKey = tabItems.some((item) => item.key === tab)
    ? (tab as ManageTabKey)
    : "datasource";

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await domainApi.getKnowledgeDetail(id);
      setDetail(res);
      const session = authApi.getSessionSync();
      const operator = session?.displayName ?? session?.username ?? "未登录";
      domainApi.appendOperationLog({
        module: "knowledge",
        moduleName: "语义知识库",
        actionType: "查看",
        actionSummary: "查看语义知识视图",
        relatedObject: res?.dataSource?.name ?? id,
        operator,
        operatorId: session?.userId,
        status: "成功",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      void loadDetail();
    }
  }, [id, loadDetail]);

  const tabContent = useMemo(() => {
    if (!detail) {
      return null;
    }
    const session = authApi.getSessionSync();
    const isCreator = Boolean(detail.creatorUserId != null && detail.creatorUserId === session?.userId);
    if (activeKey === "datasource") {
      return (
        <KnowledgeDataSourceTab
          systemId={id}
          config={detail.dataSource}
          importedTables={(detail as KnowledgeSystemDetail & { importedTables?: ImportedTable[] }).importedTables ?? []}
          datasets={detail.datasets}
          onSaved={loadDetail}
          isCreator={isCreator}
        />
      );
    }
    if (activeKey === "datasets") {
      return (
        <KnowledgeDatasetTab
          systemId={id}
          uploadRecords={detail.uploadRecords ?? []}
          dataSource={detail.dataSource}
          knowledgeCollection={detail.knowledgeCollection}
          treeData={detail.datasetTree}
          datasets={detail.datasets}
          onSaved={loadDetail}
          isCreator={isCreator}
        />
      );
    }
    if (activeKey === "metrics") {
      return (
        <KnowledgeMetricTab
          systemId={id}
          treeData={detail.metricTree}
          metrics={detail.metrics}
          onSaved={loadDetail}
          isCreator={isCreator}
        />
      );
    }
    if (activeKey === "dimensions") {
      return (
        <KnowledgeDimensionTab
          systemId={id}
          treeData={detail.dimensionTree}
          dimensions={detail.dimensions}
          onSaved={loadDetail}
          isCreator={isCreator}
        />
      );
    }
    return null;
  }, [activeKey, detail, id, loadDetail]);

  if (!id) {
    return <Alert type="warning" message="未找到知识库 ID" />;
  }

  return (
    <>
      {contextHolder}
      <Card
        loading={loading}
        title="语义知识管理"
        extra={
          <span className="zy-small-muted">
            系统 ID: <strong>{id}</strong>
          </span>
        }
      >
        <Tabs
          activeKey={activeKey}
          items={tabItems}
          onChange={(nextTab) => navigate(`/domain/knowledge-systems/${id}/manage/${nextTab}`)}
        />
        {tabContent}
      </Card>
    </>
  );
}
