package config

// AI 配置（全部走 ai-server 代理）
type AI struct {
	// AI-Server 服务地址（用于代理基础对话和知识库问答）
	// 例如：http://ai-server:8000 或 http://localhost:8000
	AIServerURL string `mapstructure:"ai-server-url" json:"aiServerUrl"`
}

