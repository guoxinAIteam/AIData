import { Button, Card, Input, List, Modal, Space, Typography, message } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useState } from "react";
import { domainApi } from "../../../services/mockApi";
import type { OntologyLibrary } from "../../../types/domain";

interface OntologyLibraryPanelProps {
  libraries: OntologyLibrary[];
  selectedLibId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
}

export function OntologyLibraryPanel({
  libraries,
  selectedLibId,
  onSelect,
  onRefresh,
}: OntologyLibraryPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      message.warning("请输入本体库名称");
      return;
    }
    setCreating(true);
    try {
      await domainApi.createOntologyLibrary({ name: name.trim(), description: description.trim() || undefined });
      message.success("创建成功");
      setCreateOpen(false);
      setName("");
      setDescription("");
      onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await domainApi.deleteOntologyLibrary(id);
      if (selectedLibId === id) onSelect(null);
      onRefresh();
      message.success("已删除");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <Card
      title="本体库"
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建
        </Button>
      }
    >
      <List
        size="small"
        dataSource={libraries}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDelete(item.id)}
              />,
            ]}
          >
            <List.Item.Meta
              title={
                <span
                  style={{ cursor: "pointer", fontWeight: selectedLibId === item.id ? 600 : 400 }}
                  onClick={() => onSelect(selectedLibId === item.id ? null : item.id)}
                >
                  {item.name}
                </span>
              }
              description={item.description || item.domain || "—"}
            />
          </List.Item>
        )}
      />
      <Modal
        title="新建本体库"
        open={createOpen}
        confirmLoading={creating}
        onOk={() => void handleCreate()}
        onCancel={() => { setCreateOpen(false); setName(""); setDescription(""); }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Typography.Text type="secondary">名称</Typography.Text>
            <Input placeholder="本体库名称" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Typography.Text type="secondary">描述</Typography.Text>
            <Input.TextArea rows={2} placeholder="可选" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </Space>
      </Modal>
    </Card>
  );
}
