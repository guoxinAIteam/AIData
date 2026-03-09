import { Card, Col, Row, Space, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { OntologyLibraryPanel } from "../../../components/domain/ontology/OntologyLibraryPanel";
import { domainApi } from "../../../services/mockApi";
import type { OntologyConcept, OntologyLibrary, OntologyRelation } from "../../../types/domain";

export function OntologyModelingPage() {
  const [libraries, setLibraries] = useState<OntologyLibrary[]>([]);
  const [selectedLibId, setSelectedLibId] = useState<string | null>(null);
  const [dataByLib, setDataByLib] = useState<Record<string, { concepts: OntologyConcept[]; relations: OntologyRelation[] }>>({});

  useEffect(() => {
    domainApi.getOntologyLibraries().then(setLibraries);
  }, []);

  useEffect(() => {
    if (!selectedLibId) return;
    let cancelled = false;
    Promise.all([
      domainApi.getOntologyConcepts(selectedLibId),
      domainApi.getOntologyRelations(selectedLibId),
    ]).then(([concepts, relations]) => {
      if (!cancelled) setDataByLib((prev) => ({ ...prev, [selectedLibId]: { concepts, relations } }));
    });
    return () => { cancelled = true; };
  }, [selectedLibId]);

  const concepts = selectedLibId ? (dataByLib[selectedLibId]?.concepts ?? []) : [];
  const relations = selectedLibId ? (dataByLib[selectedLibId]?.relations ?? []) : [];

  const refreshLibraries = () => domainApi.getOntologyLibraries().then(setLibraries);

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card title="本体知识建模">
          <Typography.Paragraph type="secondary">
            管理本体库、概念与语义关系，可与术语词典、语义知识库、经营指标问数联动。
          </Typography.Paragraph>
        </Card>

        <Row gutter={16}>
          <Col xs={24} lg={8}>
            <OntologyLibraryPanel
              libraries={libraries}
              selectedLibId={selectedLibId}
              onSelect={setSelectedLibId}
              onRefresh={refreshLibraries}
            />
          </Col>
          <Col xs={24} lg={16}>
            {selectedLibId ? (
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Card title="概念" size="small">
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={concepts}
                    columns={[
                      { title: "名称", dataIndex: "name", width: 140 },
                      { title: "描述", dataIndex: "description", ellipsis: true },
                    ]}
                  />
                </Card>
                <Card title="关系" size="small">
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={relations}
                    columns={[
                      { title: "源概念", dataIndex: "sourceConceptId", width: 120 },
                      { title: "关系类型", dataIndex: "relationType", width: 100 },
                      { title: "目标概念", dataIndex: "targetConceptId", width: 120 },
                    ]}
                  />
                </Card>
              </Space>
            ) : (
              <Card>
                <Typography.Text type="secondary">请从左侧选择或新建本体库</Typography.Text>
              </Card>
            )}
          </Col>
        </Row>
      </Space>
    </>
  );
}
