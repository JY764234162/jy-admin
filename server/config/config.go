package config

type Config struct {
	System  System  `mapstructure:"system"`
	JWT     JWT     `mapstructure:"jwt"`
	Sqlite  Sqlite  `mapstructure:"sqlite"`
	Local   Local   `mapstructure:"local"`
	Captcha Captcha `mapstructure:"captcha"`
}
