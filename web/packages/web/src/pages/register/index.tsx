import { useState, useEffect } from "react";
import { Form, Input, Button, message, Card, Spin } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone, UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { useNavigate, Link } from "react-router-dom";
import styles from "../login/styles.module.css";
import { SwitchThemeButton } from "@/components/SwitchThemeButton";
import logo from "@/assets/logo.svg";
import { SvgIcon } from "@/components/SvgIcon";
import WaveBg from "../login/waveBg";
import { loginApi } from "@/api";
import type { CaptchaResponse } from "@/api/types";

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
  nickName: string;
  code?: string;
  code_id?: string;
}

export const Component = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaData, setCaptchaData] = useState<CaptchaResponse | null>(null);
  const [registerForm] = Form.useForm<RegisterFormValues>();

  // 获取验证码
  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const res = await loginApi.getCaptcha();
      if (res.code === 0 && res.data) {
        setCaptchaData(res.data);
        registerForm.setFieldsValue({ code_id: res.data.captchaId });
      }
    } catch (error) {
      console.error("获取验证码失败:", error);
    } finally {
      setCaptchaLoading(false);
    }
  };

  // 初始化时获取验证码
  useEffect(() => {
    fetchCaptcha();
  }, []);

  // 注册
  const handleRegister = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const res = await loginApi.register({
        username: values.username,
        password: values.password,
        nickName: values.nickName,
        code: values.code,
        code_id: values.code_id || captchaData?.captchaId || "",
      });

      if (res.code === 0) {
        message.success("注册成功，请登录");
        // 跳转到登录页
        navigate("/login");
      }
    } catch (error: any) {
      // 注册失败后刷新验证码
      fetchCaptcha();
      registerForm.setFieldsValue({ code: "" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <WaveBg />

      {/* 注册卡片 */}
      <Card className={styles.loginCard} title={null} styles={{ body: { padding: 0 } }}>
        {/* 头部 */}
        <div className={styles.header}>
          <div className={`${styles.logoSection} text-[var(--ant-color-primary)]`}>
            <div>
              <SvgIcon icon={logo} size={36} className="fill-[var(--ant-color-primary)]" />
            </div>
            <span className="text-xl font-semibold">JiangYi 管理系统</span>
          </div>
          <div className={styles.headerActions}>
            <SwitchThemeButton />
          </div>
        </div>

        {/* 注册表单 */}
        <Form form={registerForm} name="register" onFinish={handleRegister} autoComplete="off" size="large">
          <div className="text-base font-bold my-4 text-[var(--ant-color-primary)]">用户注册</div>

          <Form.Item
            name="username"
            rules={[
              { required: true, message: "请输入用户名" },
              { min: 3, message: "用户名长度不能少于3位" },
              { max: 20, message: "用户名长度不能超过20位" },
              { pattern: /^[a-zA-Z0-9_]+$/, message: "用户名只能包含字母、数字和下划线" },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            name="nickName"
            rules={[
              { required: true, message: "请输入昵称" },
              { min: 2, message: "昵称长度不能少于2位" },
              { max: 20, message: "昵称长度不能超过20位" },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入昵称" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 6, message: "密码长度不能少于6位" },
              { max: 20, message: "密码长度不能超过20位" },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请确认密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请确认密码"
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
            />
          </Form.Item>

          {captchaData?.openCaptcha && (
            <Form.Item>
              <div className="flex gap-2 items-center">
                <Form.Item name="code" noStyle rules={[{ required: true, message: "请输入验证码" }]}>
                  <Input placeholder="请输入验证码" className="flex-1" />
                </Form.Item>
                <Spin spinning={captchaLoading} className="flex items-center gap-1">
                  {captchaData.picPath && (
                    <img
                      src={captchaData.picPath}
                      alt="验证码"
                      className="h-10 cursor-pointer border border-gray-300 rounded"
                      onClick={fetchCaptcha}
                    />
                  )}
                </Spin>
              </div>
              <Form.Item name="code_id" noStyle>
                <Input type="hidden" />
              </Form.Item>
            </Form.Item>
          )}

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              注册
            </Button>
          </Form.Item>
        </Form>

        {/* 返回登录 */}
        <div className={styles.switchButtons}>
          <Button
            type="default"
            onClick={() => {
              navigate("/login");
            }}
          >
            已有账号？去登录
          </Button>
        </div>
      </Card>
    </div>
  );
};

