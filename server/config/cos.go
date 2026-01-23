package config

type Cos struct {
	SecretId   string `mapstructure:"secret-id"`
	SecretKey  string `mapstructure:"secret-key"`
	Region     string `mapstructure:"region"`
	Bucket     string `mapstructure:"bucket"`
	Domain     string `mapstructure:"domain"`      // 自定义域名，可选
	PathPrefix string `mapstructure:"path-prefix"` // 路径前缀，可选
	UseHTTPS   bool   `mapstructure:"use-https"`   // 是否使用HTTPS
	UseCDN     bool   `mapstructure:"use-cdn"`     // 是否使用CDN加速域名
}
