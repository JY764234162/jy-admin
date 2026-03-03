package config

// AI 第三方大模型相关配置
type AI struct {
	// LongCat OpenAI 兼容接口的 App Key
	// 例如：通过环境变量 LONGCAT_APP_KEY 或 config.yaml 中 ai.longcat-app-key 进行配置
	LongCatAppKey string `mapstructure:"longcat-app-key" json:"longcatAppKey"`

	// LongCat 模型名称（可选）
	// 可选值：
	// - LongCat-Flash-Chat
	// - LongCat-Flash-Thinking
	// - LongCat-Flash-Thinking-2601
	// - LongCat-Flash-Lite
	LongCatModel string `mapstructure:"longcat-model" json:"longcatModel"`
}

