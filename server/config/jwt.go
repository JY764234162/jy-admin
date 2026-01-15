package config

type JWT struct {
	SigningKey  string `mapstructure:"signing-key"`
	ExpiresTime string `mapstructure:"expires-time"`
	BufferTime  string `mapstructure:"buffer-time"`
	Issuer      string `mapstructure:"issuer"`
}
