package config

type Local struct {
	Path      string `mapstructure:"path"`
	StorePath string `mapstructure:"store-path"`
}
