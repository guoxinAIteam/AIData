import { Layout } from "antd";
import { Outlet, useNavigate } from "react-router-dom";
import { AppHeader } from "../components/common/AppHeader";
import { SideNav } from "../components/common/SideNav";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { clearSession } from "../store/authSlice";
import { authApi } from "../services/mockApi";

const { Content } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const session = useAppSelector((state) => state.auth.session);

  const handleLogout = async () => {
    await authApi.logout();
    dispatch(clearSession());
    navigate("/login", { replace: true });
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <SideNav />
      <Layout>
        <AppHeader username={session?.displayName ?? "赵金慧"} onLogout={handleLogout} />
        <Content
          style={{
            padding: 16,
            overflow: "auto",
          }}
        >
          <div className="zy-page-container">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
