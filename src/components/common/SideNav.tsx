import {
  BookOutlined,
  DatabaseOutlined,
  DotChartOutlined,
  FundProjectionScreenOutlined,
  LaptopOutlined,
  ReadOutlined,
  RobotOutlined,
  SnippetsOutlined,
  ApartmentOutlined,
  TagsOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { Layout, Menu, Space, Typography } from "antd";
import type { MenuProps } from "antd";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  applicationScenarioLabel,
  applicationScenarioMenuKey,
  hasPermission,
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
  "/domain/metric-qa": <BookOutlined />,
  "/domain/ontology-modeling": <ApartmentOutlined />,
  "/domain/question-labeling": <TagsOutlined />,
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

  const { flatItems } = useMemo(() => {
    const filtered = menuPermissionItems.filter((item) => hasPermission(session, item.permissionCode));
    const appScenario = filtered.filter((item) => item.parentKey === applicationScenarioMenuKey);
    const topLevel = filtered.filter((item) => item.parentKey !== applicationScenarioMenuKey);
    const flat: MenuItem[] = [];
    for (const item of topLevel) {
      if (item.key === "ontology-modeling" && appScenario.length > 0) {
        flat.push({
          key: applicationScenarioMenuKey,
          icon: <AppstoreOutlined />,
          label: applicationScenarioLabel,
          children: appScenario.map((c) => ({
            key: c.route,
            label: c.label,
            icon: iconMap[c.route] ?? <DotChartOutlined />,
          })),
        });
      }
      flat.push({
        key: item.route,
        icon: iconMap[item.route] ?? <DotChartOutlined />,
        label: item.label,
      });
    }
    if (appScenario.length > 0 && !flat.some((r) => r.key === applicationScenarioMenuKey)) {
      flat.push({
        key: applicationScenarioMenuKey,
        icon: <AppstoreOutlined />,
        label: applicationScenarioLabel,
        children: appScenario.map((c) => ({
          key: c.route,
          label: c.label,
          icon: iconMap[c.route] ?? <DotChartOutlined />,
        })),
      });
    }
    return { flatItems: flat };
  }, [session]);

  useEffect(() => {
    const hasAppScenario = flatItems.some((item) => item.key === applicationScenarioMenuKey);
    if (hasAppScenario) {
      setOpenKeys((prev) =>
        prev.includes(applicationScenarioMenuKey) ? prev : [...prev, applicationScenarioMenuKey],
      );
    }
  }, [pathname, flatItems]);

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
