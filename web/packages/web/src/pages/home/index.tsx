import React from "react";
import { Card, Row, Col, Typography, Space, Tag, Divider } from "antd";
import {
  AppstoreOutlined,
  InteractionOutlined,
  FileTextOutlined,
  CodeOutlined,
  ToolOutlined,
  ApiOutlined,
  EditOutlined,
  BulbOutlined,
  ExperimentOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { settingSlice } from "@/store/slice/setting";
import styles from "./index.module.less";

const { Title, Paragraph, Text } = Typography;

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  path?: string;
  tags?: string[];
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, path, tags }) => {
  const navigate = useNavigate();
  const settings = useSelector(settingSlice.selectors.getSettings);
  const primary = settings.color.primary;

  const handleClick = () => {
    if (path) {
      navigate(path);
    }
  };

  return (
    <Card
      hoverable={!!path}
      onClick={handleClick}
      className={styles.featureCard}
      bodyStyle={{ height: "100%" }}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div className={styles.iconWrapper} style={{ color: primary }}>
          {icon}
        </div>
        <Title level={4} style={{ margin: 0 }}>
          {title}
        </Title>
        <Paragraph style={{ margin: 0, color: "#666" }}>{description}</Paragraph>
        {tags && tags.length > 0 && (
          <Space wrap>
            {tags.map((tag) => (
              <Tag key={tag} color={primary}>
                {tag}
              </Tag>
            ))}
          </Space>
        )}
      </Space>
    </Card>
  );
};

export const Component = () => {
  const settings = useSelector(settingSlice.selectors.getSettings);
  const primary = settings.color.primary;

  const features: FeatureCardProps[] = [
    {
      icon: <AppstoreOutlined />,
      title: "UI组件",
      description: "丰富的UI组件示例，包括贝塞尔曲线Tabs、自适应高度弹窗、Tree编辑器、Cron计时器等",
      path: "/ui",
      tags: ["组件", "UI", "交互"],
    },
    {
      icon: <InteractionOutlined />,
      title: "交互功能",
      description: "拖拽上传、拖拽排序、拖拽列表、滚动高亮、关键字高亮等交互功能实现",
      path: "/interaction",
      tags: ["拖拽", "滚动", "交互"],
    },
    {
      icon: <FileTextOutlined />,
      title: "图像处理",
      description: "Canvas像素化、图像颜色分析、图片水印、懒加载、渐进式加载等图像处理技术",
      path: "/image",
      tags: ["Canvas", "图像", "性能"],
    },
    {
      icon: <CodeOutlined />,
      title: "数据处理",
      description: "XML解析、字符串差异对比、HTML导出等数据处理功能",
      path: "/data",
      tags: ["解析", "对比", "导出"],
    },
    {
      icon: <EditOutlined />,
      title: "编辑器",
      description: "富文本编辑器实现，支持代码高亮、文本编辑等功能",
      path: "/editor",
      tags: ["富文本", "编辑"],
    },
    {
      icon: <FileTextOutlined />,
      title: "文档预览",
      description: "Word文档预览、PDF文档预览，支持文件上传和在线预览",
      path: "/doc",
      tags: ["Word", "PDF", "预览"],
    },
    {
      icon: <ApiOutlined />,
      title: "可视化",
      description: "React Flow流程图、Three.js 3D展示、Leaflet地图等可视化技术",
      path: "/visualization",
      tags: ["流程图", "3D", "地图"],
    },
    {
      icon: <ToolOutlined />,
      title: "工具库",
      description: "Floating UI浮动定位、WebSocket实时通信、状态管理等实用工具",
      path: "/tools",
      tags: ["工具", "通信", "状态"],
    },
    {
      icon: <ExperimentOutlined />,
      title: "React特性",
      description: "Error Boundary、Suspense、Strict Mode、useSyncExternalStore等React特性示例",
      path: "/react",
      tags: ["React", "特性", "实践"],
    },
    {
      icon: <BulbOutlined />,
      title: "样式技巧",
      description: "CSS Filter滤镜、甲骨文字体、SVG图标等CSS样式技巧",
      path: "/styles",
      tags: ["CSS", "SVG", "样式"],
    },
    {
      icon: <RocketOutlined />,
      title: "开发工具",
      description: "Vite HMR、微前端MicroApp等开发工具和技术实践",
      path: "/dev-tools",
      tags: ["Vite", "微前端", "工具"],
    },
  ];

  const techStack = [
    "Go + Gin",
    "GORM (MySQL/SQLite)",
    "React 18",
    "TypeScript",
    "Ant Design",
    "Vite",
    "React Router",
    "Redux Toolkit",
    "Three.js",
    "PDF.js",
    "React Flow",
    "Leaflet",
    "Canvas API",
  ];

  return (
    <div className={styles.homePage}>
      <div className={styles.header}>
        <Space direction="vertical" size="large" style={{ width: "100%", textAlign: "center" }}>
          <Title level={1} style={{ margin: 0, fontSize: "3rem" }}>
            JY-Admin 全栈管理系统
          </Title>
          <Paragraph style={{ fontSize: "1.2rem", color: "#666", margin: 0 }}>
            基于 Go(Gin) + React(Vite) 的后台管理系统，集成权限管理、文件存储、AI 对话与丰富的前端示例
          </Paragraph>
          <Space wrap size="middle">
            {techStack.slice(0, 6).map((tech) => (
              <Tag key={tech} color={primary} style={{ fontSize: "14px", padding: "4px 12px" }}>
                {tech}
              </Tag>
            ))}
          </Space>
        </Space>
      </div>

      <Divider />

      <div className={styles.content}>
        <Title level={2} style={{ textAlign: "center", marginBottom: "32px" }}>
          核心功能模块
        </Title>

        <Row gutter={[24, 24]}>
          {features.map((feature, index) => (
            <Col xs={24} sm={12} md={8} lg={8} xl={6} key={index}>
              <FeatureCard {...feature} />
            </Col>
          ))}
        </Row>

        <Divider />

        <Card className={styles.introCard}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Title level={3}>项目介绍</Title>
            <Paragraph>
              JY-Admin 是一个前后端一体的管理系统示例项目，后端基于
              <Text strong> Go + Gin + GORM </Text>
              实现认证、权限、文件存储等能力，前端基于
              <Text strong> React </Text>、
              <Text strong> TypeScript </Text>、
              <Text strong> Ant Design </Text>
              构建通用后台界面与丰富的前端能力演示。
            </Paragraph>
            <Paragraph>
              系统包含用户 / 角色 / 菜单权限管理、文件上传与腾讯云 COS 对接、客户管理、AI 对话等后台功能，同时内置大量前端示例模块：从基础的 UI 组件到复杂的交互功能，从图像处理到数据可视化，从编辑器实现到文档预览等多个实用模块，既可以作为
              <Text strong> 实战脚手架 </Text>
              ，也可以作为
              <Text strong> 学习与复用代码片段 </Text>
              的仓库。
            </Paragraph>

            <Title level={4}>技术特点</Title>
            <ul>
              <li>
                <Text strong>组件化开发：</Text>使用 React 18 + TypeScript 构建可复用的组件
              </li>
              <li>
                <Text strong>现代化工具链：</Text>采用 Vite 作为构建工具，提供极速的开发体验
              </li>
              <li>
                <Text strong>状态管理：</Text>以 Redux Toolkit 为主，结合局部状态方案管理布局、权限与业务数据
              </li>
              <li>
                <Text strong>UI 框架：</Text>基于 Ant Design 构建美观一致的用户界面
              </li>
              <li>
                <Text strong>后端能力：</Text>Gin + GORM + JWT + Zap，支持 MySQL/SQLite、Token 黑名单与 Swagger 文档
              </li>
              <li>
                <Text strong>工程与部署：</Text>pnpm workspace 管理多包，提供 Docker Compose 一键启动与 GitHub Actions 部署脚本
              </li>
            </ul>

            <Title level={4}>适用场景</Title>
            <Paragraph>
              本项目适合作为前端学习参考、技术选型验证、代码片段复用等场景。无论你是初学者想要了解现代前端开发，还是经验丰富的开发者寻找特定功能的实现方案，都能在这里找到有价值的内容。
            </Paragraph>
          </Space>
        </Card>
      </div>
    </div>
  );
};

