package config

type Mysql struct {
	GeneralDB `mapstructure:",squash"`
}
