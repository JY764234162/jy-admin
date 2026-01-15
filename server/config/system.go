package config

type System struct {
	DBType             string `mapstructure:"db-type	"`
	OSSType            string `mapstructure:"oss-type"`
	RouterPrefix       string `mapstructure:"router-prefix"`
	Port               string `mapstructure:"port"`
	IPLimitCount       int    `mapstructure:"iplimit-count"`
	IPLimitTime        int    `mapstructure:"iplimit-time"`
	UseMultipoint      bool   `mapstructure:"use-multipoint"`
	UseRedis           bool   `mapstructure:"use-redis"`
	UseMongo           bool   `mapstructure:"use-mongo"`
	UseStrictAuth      bool   `mapstructure:"use-strict-auth"`
	DisableAutoMigrate bool   `mapstructure:"disable-auto-migrate"`
	ReadTimeout        int    `mapstructure:"read-timeout"`
	WriteTimeout       int    `mapstructure:"write-timeout"`
}
