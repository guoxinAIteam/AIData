import { useEffect, useState } from "react";
import { App as AntdApp, ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./router";
import { appTheme } from "./styles/theme";
import { initStoreFromBackend } from "./services/mockApi";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initStoreFromBackend()
      .catch((err) => console.warn("[App] store init failed, using seed data:", err))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <ConfigProvider locale={zhCN} theme={appTheme}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          <Spin size="large" tip="正在初始化数据..." />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <AntdApp>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
