import { Button, Card, Descriptions, Flex, Tag, Typography } from "antd";
import pkgJson from "../../../package.json";
import { useSelector } from "react-redux";
import { settingSlice } from "@/store/slice/setting";
import { DescriptionsItemType } from "antd/es/descriptions";

// 解构 package.json 数据
const { dependencies, devDependencies, name, version, homepage, repository } = pkgJson;

const transformDependenciesToItems = (dependencies: Record<string, string>) => {
  return Object.entries(dependencies).map((item) => {
    const [name, version] = item;
    return {
      label: name,
      children: version,
    };
  });
};
const dependenciesItems: DescriptionsItemType[] = transformDependenciesToItems(dependencies);
const devDependenciesItems: DescriptionsItemType[] = transformDependenciesToItems(devDependencies);

export const Component = () => {
  const settings = useSelector(settingSlice.selectors.getSettings);
  const primary = settings.color.primary;

  const infoItems: DescriptionsItemType[] = [
    {
      label: "版本",
      children: (
        <Tag color={primary} bordered>
          {version}
        </Tag>
      ),
    },
    {
      label: "最新构建时间",
      children: (
        <Tag color={primary} bordered>
          {BUILD_TIME}
        </Tag>
      ),
    },
    {
      label: "Github地址",
      children: (
        <a href={"https://github.com/JY764234162/jy-admin"} style={{ color: primary }} target="_blank" rel="noreferrer">
          Github地址
        </a>
      ),
    },
    {
      label: "项目预览地址",
      children: (
        <a href={"http://jy-admin.site/"} style={{ color: primary }} target="_blank" rel="noreferrer">
          项目预览地址
        </a>
      ),
    },
  ];
  return (
    <Flex vertical style={{ padding: 16, gap: 16 }}>
      <Card title="项目信息" size="small">
        <Descriptions items={infoItems} column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }} size="small" bordered></Descriptions>
      </Card>
      <Card title="系统概览" size="small">
        <Typography.Paragraph>
          JY-Admin 是一个基于 <b>Go(Gin)</b> + <b>React(Vite)</b> 的通用后台管理系统，包含认证授权、角色/菜单管理、文件上传与对象存储、客户管理，以及一组前端能力示例页面（编辑器、预览、图像处理等），适合作为企业后台或个人脚手架的基础工程。
        </Typography.Paragraph>
      </Card>
      <Card title="核心功能与亮点" size="small">
        <Typography.Paragraph strong>前端部分</Typography.Paragraph>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li>基于 React 18 + TypeScript + Vite + Ant Design 的现代技术栈。</li>
          <li>使用 Redux Toolkit 管理全局状态（用户信息、布局配置、动态路由等）。</li>
          <li>菜单数据驱动的动态路由系统：后端菜单 → 前端路由 → 布局渲染与权限可见性。</li>
          <li>统一的请求封装与错误处理，支持 token 鉴权、全局提示等。</li>
          <li>大量前端能力示例页（如富文本编辑器、PDF 预览、图片懒加载/渐进式加载、图像处理等）。</li>
        </ul>
        <Typography.Paragraph strong>后端部分</Typography.Paragraph>
        <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
          <li>Gin + GORM 构建的 RESTful API，支持 MySQL / SQLite。</li>
          <li>JWT 认证 + Token 黑名单机制，支持安全登出与黑名单持久化。</li>
          <li>角色/菜单权限模型，预留 RBAC 中间件，便于细粒度权限控制。</li>
          <li>文件上传支持本地存储与腾讯云 COS，可按配置切换。</li>
          <li>结构化日志（Zap）+ 轮转，便于线上排错与审计。</li>
        </ul>
        <Typography.Paragraph strong>工程与部署</Typography.Paragraph>
        <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
          <li>前端采用 pnpm workspace 管理多包（主后台 + 演示站点 + 公共 utils）。</li>
          <li>提供 Docker Compose 一键启动：MySQL + 后端服务 + Nginx 前端服务。</li>
          <li>GitHub Actions 工作流支持 push 到 main 分支后自动 SSH 部署到服务器。</li>
        </ul>
      </Card>
      <Card title="生产依赖" size="small">
        <Descriptions items={dependenciesItems} column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }} size="small" bordered></Descriptions>
      </Card>
      <Card title="开发依赖" size="small">
        <Descriptions
          items={devDependenciesItems}
          column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
          size="small"
          bordered
        ></Descriptions>
      </Card>
    </Flex>
  );
};
