package config

type Config struct {
	System  System  `mapstructure:"system"`
	JWT     JWT     `mapstructure:"jwt"`
	Sqlite  Sqlite  `mapstructure:"sqlite"`
	Mysql   Mysql   `mapstructure:"mysql"`
	Local   Local   `mapstructure:"local"`
	Captcha Captcha `mapstructure:"captcha"`
	Log     Log     `mapstructure:"log"`
}
