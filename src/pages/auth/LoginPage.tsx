import { LockOutlined, LoginOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { authApi, type LoginPayload } from "../../services/mockApi";
import { useAppDispatch } from "../../store/hooks";
import { setSession } from "../../store/authSlice";

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<LoginPayload>();

  const onFinish = async (values: LoginPayload) => {
    try {
      const session = await authApi.login(values);
      dispatch(setSession(session));
      messageApi.success("登录成功");
      navigate("/domain/workbench", { replace: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "登录失败";
      messageApi.error(errMsg);
    }
  };

  return (
    <>
      {contextHolder}
      <Card className="zy-auth-panel" bodyStyle={{ padding: "34px 32px" }}>
        <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 26 }}>
          <h1 className="zy-auth-title">语义知识平台</h1>
          <p className="zy-auth-subtitle">企业级语义与知识运营系统 · 登录</p>
        </Space>

        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            void onFinish(values);
          }}
          initialValues={{ username: "zhaojinhui", password: "123456" }}
        >
          <Form.Item
            label={<span style={{ color: "rgba(255,255,255,.9)" }}>用户名</span>}
            name="username"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            label={<span style={{ color: "rgba(255,255,255,.9)" }}>密码</span>}
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Button block type="primary" size="large" htmlType="submit" icon={<LoginOutlined />}>
            登录
          </Button>
        </Form>

        <Typography.Paragraph style={{ textAlign: "center", marginBottom: 0, marginTop: 16, color: "#d7def0" }}>
          还没有账号？
          <Link to="/register" style={{ marginLeft: 6, color: "#69b1ff" }}>
            立即注册
          </Link>
        </Typography.Paragraph>
      </Card>
    </>
  );
}
