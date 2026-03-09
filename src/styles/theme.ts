import type { ThemeConfig } from "antd";

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 8,
    colorBgLayout: "#f4f7fb",
    colorBgContainer: "#ffffff",
    fontFamily:
      "Inter, 'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxShadowSecondary: "0 8px 28px rgba(15, 42, 78, 0.08)",
  },
  components: {
    Layout: {
      siderBg: "#ffffff",
      bodyBg: "#f4f7fb",
      headerBg: "#ffffff",
    },
    Menu: {
      itemBg: "transparent",
      itemBorderRadius: 6,
      itemHeight: 38,
      itemSelectedBg: "rgba(22,119,255,0.12)",
      itemSelectedColor: "#1677ff",
      itemColor: "#34495e",
    },
    Card: {
      bodyPadding: 16,
    },
    Table: {
      headerBg: "#f7f9fc",
      rowHoverBg: "#f5faff",
    },
  },
};
