import { useState, useEffect } from "react";
import { Form, Input, Button, Checkbox, message, Divider, Card } from "antd";
import { EyeInvisibleOutlined, EyeTwoTone, UserOutlined, LockOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import styles from "./styles.module.css";
import { SwitchThemeButton } from "@/components/SwitchThemeButton";
import logo from "@/assets/logo.svg";
import { SvgIcon } from "@/components/SvgIcon";
import WaveBg from "./waveBg";
import { loginApi } from "@/api";
import { localStg } from "@/utils/storage";
import type { CaptchaResponse } from "@/api/types";

interface LoginFormValues {
  username: string;
  password: string;
  code?: string;
  code_id?: string;
  remember: boolean;
}

interface SmsFormValues {
  phone: string;
  code: string;
}

export const Component = () => {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<"password" | "sms">("password");
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaData, setCaptchaData] = useState<CaptchaResponse | null>(null);
  const [passwordForm] = Form.useForm<LoginFormValues>();
  const [smsForm] = Form.useForm<SmsFormValues>();

  // 获取验证码
  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const res = await loginApi.getCaptcha();
      if (res.code === 0 && res.data) {
        setCaptchaData(res.data);
        passwordForm.setFieldsValue({ code_id: res.data.captchaId });
      }
    } catch (error) {
      console.error("获取验证码失败:", error);
    } finally {
      setCaptchaLoading(false);
    }
  };

  // 初始化时获取验证码
  useEffect(() => {
    if (loginType === "password") {
      fetchCaptcha();
    }
  }, [loginType]);

  // 密码登录
  const handlePasswordLogin = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const res = await loginApi.login({
        username: values.username,
        password: values.password,
        code: values.code,
        code_id: values.code_id || captchaData?.captchaId || "",
      });

      if (res.code === 0 && res.data) {
        // 存储 token 和用户信息
        localStg.set("token", res.data.token);
        localStg.set("userInfo", res.data.user);

        message.success("登录成功！");

        // 跳转到首页
        navigate("/home");
      }
    } catch (error: any) {
      // 登录失败后刷新验证码
      fetchCaptcha();
      passwordForm.setFieldsValue({ code: "" });
    } finally {
      setLoading(false);
    }
  };

  // 验证码登录
  const handleSmsLogin = async (values: SmsFormValues) => {
    setLoading(true);
    try {
      // 模拟登录请求
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log("验证码登录:", values);
      message.success("登录成功！");

      // 跳转到首页
      navigate("/home");
    } catch (error) {
      message.error("登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 发送验证码
  const handleSendCode = async () => {
    try {
      const phone = smsForm.getFieldValue("phone");
      if (!phone) {
        message.warning("请先输入手机号");
        return;
      }

      // 模拟发送验证码
      await new Promise((resolve) => setTimeout(resolve, 500));
      message.success("验证码已发送");
    } catch (error) {
      message.error("发送验证码失败");
    }
  };

  // 快速登录（角色）
  const handleQuickLogin = (role: "super" | "admin" | "user") => {
    setLoading(true);
    setTimeout(() => {
      const roleMap = {
        super: "超级管理员",
        admin: "管理员",
        user: "普通用户",
      };
      message.success(`以${roleMap[role]}身份登录成功！`);
      navigate("/home");
      setLoading(false);
    }, 500);
  };

  return (
    <div className={styles.loginContainer}>
      <WaveBg />

      {/* 登录卡片 */}
      <Card className={styles.loginCard} title={null} styles={{ body: { padding: 0 } }}>
        {/* 头部 */}
        <div className={styles.header}>
          <div className={styles.logoSection} style={{ color: "var(--ant-color-primary)" }}>
            <div>
              <SvgIcon icon={logo} size={36} style={{ fill: "var(--ant-color-primary)" }} />
            </div>
            <span style={{ fontSize: "20px", fontWeight: "600" }}>JiangYi 管理系统</span>
          </div>
          <div className={styles.headerActions}>
            <SwitchThemeButton />
          </div>
        </div>

        {/* 登录表单 */}
        {loginType === "password" ? (
          <Form form={passwordForm} name="passwordLogin" onFinish={handlePasswordLogin} autoComplete="off" size="large">
            <div className="text-base font-bold my-4" style={{ color: "var(--ant-color-primary)" }}>
              密码登录
            </div>

            <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
              <Input prefix={<UserOutlined />} placeholder="JiangYi" />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="······"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>

            {captchaData?.openCaptcha && (
              <Form.Item>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Form.Item name="code" noStyle rules={[{ required: true, message: "请输入验证码" }]}>
                    <Input placeholder="请输入验证码" style={{ flex: 1 }} />
                  </Form.Item>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    {captchaData.picPath && (
                      <img
                        src={captchaData.picPath}
                        alt="验证码"
                        style={{ height: "32px", cursor: "pointer", border: "1px solid #d9d9d9", borderRadius: "4px" }}
                        onClick={fetchCaptcha}
                      />
                    )}
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      loading={captchaLoading}
                      onClick={fetchCaptcha}
                      style={{ padding: "4px" }}
                    />
                  </div>
                </div>
                <Form.Item name="code_id" noStyle>
                  <Input type="hidden" />
                </Form.Item>
              </Form.Item>
            )}

            <div className={styles.formOptions}>
              <Form.Item name="remember" valuePropName="checked" style={{ margin: 0 }}>
                <Checkbox>记住我</Checkbox>
              </Form.Item>
              <a href="#">忘记密码?</a>
            </div>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                确认
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Form form={smsForm} name="smsLogin" onFinish={handleSmsLogin} autoComplete="off" size="large">
            <div className="text-base font-bold my-4" style={{ color: "var(--ant-color-primary)" }}>
              密码登录
            </div>

            <Form.Item
              name="phone"
              rules={[
                { required: true, message: "请输入手机号" },
                { pattern: /^1[3-9]\d{9}$/, message: "请输入正确的手机号" },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="请输入手机号" />
            </Form.Item>

            <Form.Item name="code" rules={[{ required: true, message: "请输入验证码" }]}>
              <div style={{ display: "flex", gap: "8px" }}>
                <Input placeholder="请输入验证码" />
                <Button onClick={handleSendCode}>发送验证码</Button>
              </div>
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                确认
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* 切换登录方式 */}
        <div className={styles.switchButtons}>
          <Button
            type="default"
            onClick={() => {
              setLoginType(loginType === "password" ? "sms" : "password");
              passwordForm.resetFields();
              smsForm.resetFields();
            }}
          >
            {loginType === "password" ? "验证码登录" : "密码登录"}
          </Button>
          <Button
            type="default"
            onClick={() => {
              message.info("注册功能开发中");
            }}
          >
            注册账号
          </Button>
        </div>

        {/* 其他账号登录 */}
        <Divider style={{ fontSize: 14 }}>其他账号登录</Divider>

        <div className={styles.roleButtons}>
          <Button type="primary" onClick={() => handleQuickLogin("super")} loading={loading}>
            超级管理员
          </Button>
          <Button type="primary" onClick={() => handleQuickLogin("admin")} loading={loading}>
            管理员
          </Button>
          <Button type="primary" onClick={() => handleQuickLogin("user")} loading={loading}>
            普通用户
          </Button>
        </div>
      </Card>
    </div>
  );
};
