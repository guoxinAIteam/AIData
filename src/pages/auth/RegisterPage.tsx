import { LockOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Space, Typography, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { authApi, type RegisterPayload } from "../../services/mockApi";
import { useAppDispatch } from "../../store/hooks";
import { setSession } from "../../store/authSlice";

export function RegisterPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const onFinish = async (values: RegisterPayload) => {
    try {
      const session = await authApi.register(values);
      dispatch(setSession(session));
      messageApi.success("注册成功，已自动登录");
      navigate("/domain/workbench", { replace: true });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "注册失败";
      messageApi.error(errMsg);
    }
  };

  return (
    <>
      {contextHolder}
      <Card className="zy-auth-panel" bodyStyle={{ padding: "34px 32px" }}>
        <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 26 }}>
          <h1 className="zy-auth-title">语义知识平台 · 创建账号</h1>
          <p className="zy-auth-subtitle">科技风企业级语义系统体验账号注册</p>
        </Space>

        <Form layout="vertical" onFinish={(values) => void onFinish(values)}>
          <Form.Item
            label={<span style={{ color: "rgba(255,255,255,.9)" }}>用户名</span>}
            name="username"
            rules={[{ required: true, message: "请输入用户名" }, { min: 2, message: "用户名至少 2 位" }]}
          >
            <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label={<span style={{ color: "rgba(255,255,255,.9)" }}>密码</span>}
            name="password"
            rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少 6 位" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            label={<span style={{ color: "rgba(255,255,255,.9)" }}>确认密码</span>}
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请再次输入密码" },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次密码输入不一致"));
                },
              }),
            ]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              placeholder="请再次输入密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Button block type="primary" size="large" htmlType="submit" icon={<UserAddOutlined />}>
            注册并登录
          </Button>
        </Form>

        <Typography.Paragraph style={{ textAlign: "center", marginBottom: 0, marginTop: 16, color: "#d7def0" }}>
          已有账号？
          <Link to="/login" style={{ marginLeft: 6, color: "#69b1ff" }}>
            返回登录
          </Link>
        </Typography.Paragraph>
      </Card>
    </>
  );
}
