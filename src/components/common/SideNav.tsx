import {
  ApartmentOutlined,
  AppstoreOutlined,
  BookOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  DotChartOutlined,
  FundProjectionScreenOutlined,
  LaptopOutlined,
  ReadOutlined,
  RobotOutlined,
  SearchOutlined,
  SnippetsOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  hasPermission,
  menuGroups,
  menuPermissionItems,
  resolveMenuKeyByPath,
} from "../../config/permissionMap";
import { useAppSelector } from "../../store/hooks";

const { Sider } = Layout;

const iconMap: Record<string, ReactNode> = {
  "/domain/workbench": <LaptopOutlined />,
  "/domain/knowledge-systems": <DatabaseOutlined />,
  "/domain/example-questions": <SnippetsOutlined />,
  "/domain/glossary": <ReadOutlined />,
  "/domain/operation-logs": <FundProjectionScreenOutlined />,
  "/domain/skills": <RobotOutlined />,
  "/domain/metric-qa": <SearchOutlined />,
  "/domain/ontology-modeling": <ApartmentOutlined />,
  "/domain/question-labeling": <TagsOutlined />,
};

const groupIconMap: Record<string, ReactNode> = {
  "knowledge-center": <CloudServerOutlined />,
  "skill-center": <ThunderboltOutlined />,
  "app-scenario": <AppstoreOutlined />,
};

type MenuItem = {
  key: string;
  icon: ReactNode;
  label: string;
  children?: Array<{ key: string; icon: ReactNode; label: string }>;
};

export function SideNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const session = useAppSelector((state) => state.auth.session);
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  const { flatItems, groupKeys } = useMemo(() => {
    const filtered = menuPermissionItems.filter((item) =>
      hasPermission(session, item.permissionCode),
    );

    const topLevel = filtered.filter((item) => !item.parentKey);
    const groups = Object.values(menuGroups);

    const result: MenuItem[] = [];
    const allGroupKeys: string[] = [];
    let topInserted = false;

    for (const item of topLevel) {
      result.push({
        key: item.route,
        icon: iconMap[item.route] ?? <DotChartOutlined />,
        label: item.label,
      });
    }

    const insertIdx = result.findIndex((r) => r.key === "/domain/workbench");
    let insertPos = insertIdx >= 0 ? insertIdx + 1 : result.length;

    for (const group of groups) {
      const children = filtered.filter((item) => item.parentKey === group.key);
      if (children.length === 0) continue;

      allGroupKeys.push(group.key);
      const groupItem: MenuItem = {
        key: group.key,
        icon: groupIconMap[group.key] ?? <DotChartOutlined />,
        label: group.label,
        children: children.map((c) => ({
          key: c.route,
          label: c.label,
          icon: iconMap[c.route] ?? <DotChartOutlined />,
        })),
      };

      result.splice(insertPos, 0, groupItem);
      insertPos++;
    }

    return { flatItems: result, groupKeys: allGroupKeys };
  }, [session]);

  useEffect(() => {
    if (groupKeys.length > 0) {
      setOpenKeys((prev) => {
        const newKeys = groupKeys.filter((k) => !prev.includes(k));
        return newKeys.length > 0 ? [...prev, ...newKeys] : prev;
      });
    }
  }, [pathname, groupKeys]);

  const selectedKeys = useMemo(() => [resolveMenuKeyByPath(pathname)], [pathname]);

  const onOpenChange: MenuProps["onOpenChange"] = (keys) => {
    setOpenKeys(keys as string[]);
  };

  return (
    <Sider width={248} theme="light" style={{ borderRight: "1px solid #edf1f6", minHeight: "100vh" }}>
      <Space
        align="center"
        size={10}
        style={{
          width: "100%",
          padding: "18px 16px 14px",
          borderBottom: "1px solid #edf1f6",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "linear-gradient(145deg, #1677ff 0%, #5ea8ff 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 18,
          }}
        >
          <DatabaseOutlined />
        </div>
        <div>
          <Typography.Text className="zy-logo-title">语义知识平台</Typography.Text>
          <div className="zy-small-muted">
            <DotChartOutlined /> 企业语义与知识运营中台
          </div>
        </div>
      </Space>

      <Menu
        mode="inline"
        selectedKeys={selectedKeys}
        openKeys={openKeys}
        onOpenChange={onOpenChange}
        onClick={({ key }) => {
          if (key.startsWith("/domain/")) navigate(key);
        }}
        style={{ borderInlineEnd: "none", paddingInline: 8 }}
      >
        {flatItems.map((item) =>
          item.children ? (
            <Menu.SubMenu
              key={item.key}
              icon={item.icon}
              title={item.label}
            >
              {item.children.map((child) => (
                <Menu.Item key={child.key} icon={child.icon}>
                  {child.label}
                </Menu.Item>
              ))}
            </Menu.SubMenu>
          ) : (
            <Menu.Item key={item.key} icon={item.icon}>
              {item.label}
            </Menu.Item>
          ),
        )}
      </Menu>
    </Sider>
  );
}
