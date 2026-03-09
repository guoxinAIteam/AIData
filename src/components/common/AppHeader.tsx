import {
  FullscreenExitOutlined,
  FullscreenOutlined,
  ImportOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Avatar, Breadcrumb, Button, Dropdown, Input, Layout, Space, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const { Header } = Layout;

interface AppHeaderProps {
  username: string;
  onLogout: () => Promise<void>;
}

const breadcrumbMap: Array<{ match: RegExp; items: string[] }> = [
  {
    match: /^\/domain\/workbench/,
    items: ["语义知识平台", "工作台"],
  },
  {
    match: /^\/domain\/knowledge-systems\/[^/]+\/manage\/[^/]+/,
    items: ["语义知识平台", "语义知识库", "语义知识管理"],
  },
  {
    match: /^\/domain\/knowledge-systems/,
    items: ["语义知识平台", "语义知识库"],
  },
  {
    match: /^\/domain\/example-questions/,
    items: ["语义知识平台", "示例问题库"],
  },
  {
    match: /^\/domain\/glossary\/new/,
    items: ["语义知识平台", "业务术语词典", "新增术语"],
  },
  {
    match: /^\/domain\/glossary\/[^/]+\/edit/,
    items: ["语义知识平台", "业务术语词典", "编辑术语"],
  },
  {
    match: /^\/domain\/glossary/,
    items: ["语义知识平台", "业务术语词典"],
  },
  {
    match: /^\/domain\/operation-logs/,
    items: ["语义知识平台", "操作日志"],
  },
  {
    match: /^\/domain\/trace-center/,
    items: ["语义知识平台", "操作日志"],
  },
  {
    match: /^\/domain\/skills/,
    items: ["语义知识平台", "Skill 库"],
  },
  {
    match: /^\/domain\/metric-qa/,
    items: ["语义知识平台", "经营指标问数"],
  },
];

function getBreadcrumbItems(pathname: string) {
  const found = breadcrumbMap.find((item) => item.match.test(pathname));
  return found?.items ?? ["语义知识平台"];
}

export function AppHeader({ username, onLogout }: AppHeaderProps) {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [globalKeyword, setGlobalKeyword] = useState("");

  const breadcrumbItems = useMemo(
    () => getBreadcrumbItems(location.pathname).map((item) => ({ title: item })),
    [location.pathname],
  );

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      return;
    }
    await document.exitFullscreen();
    setIsFullscreen(false);
  };

  return (
    <Header
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 16px",
        borderBottom: "1px solid #edf1f6",
      }}
    >
      <Space size={12} style={{ minWidth: 0 }}>
        <Breadcrumb items={breadcrumbItems} />
        <Button
          icon={<ImportOutlined />}
          type="primary"
          onClick={() => message.info("全局导入入口已触发，POC 暂不接入真实文件服务")}
        >
          导入文件
        </Button>
      </Space>

      <Space size={8}>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder="全局搜索"
          value={globalKeyword}
          onChange={(event) => setGlobalKeyword(event.target.value)}
          onPressEnter={() => {
            if (!globalKeyword.trim()) {
              message.warning("请输入搜索关键词");
              return;
            }
            message.success(`已触发全局搜索：${globalKeyword}`);
          }}
          style={{ width: 190 }}
        />
        <Tooltip title="刷新">
          <Button
            shape="circle"
            icon={<ReloadOutlined />}
            onClick={() => {
              window.location.reload();
            }}
          />
        </Tooltip>
        <Tooltip title={isFullscreen ? "退出全屏" : "全屏"}>
          <Button
            shape="circle"
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => {
              void toggleFullscreen();
            }}
          />
        </Tooltip>
        <Dropdown
          menu={{
            items: [
              {
                key: "profile",
                label: "个人中心",
                icon: <UserOutlined />,
              },
              {
                type: "divider",
              },
              {
                key: "logout",
                label: "退出登录",
                icon: <LogoutOutlined />,
              },
            ],
            onClick: ({ key }) => {
              if (key === "profile") {
                navigate("/domain/workbench");
              }
              if (key === "logout") {
                void onLogout();
              }
            },
          }}
        >
          <Space style={{ cursor: "pointer", paddingInline: 8 }}>
            <Avatar style={{ backgroundColor: "#1677ff" }}>{username.slice(0, 1).toUpperCase()}</Avatar>
            <Typography.Text>{username}</Typography.Text>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
}
