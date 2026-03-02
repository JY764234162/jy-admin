package config

// AI 第三方大模型相关配置
type AI struct {
	// LongCat OpenAI 兼容接口的 App Key
	// 例如：通过环境变量 LONGCAT_APP_KEY 或 config.yaml 中 ai.longcat-app-key 进行配置
	LongCatAppKey string `mapstructure:"longcat-app-key" json:"longcatAppKey"`
}

