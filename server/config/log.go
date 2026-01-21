package config

type Log struct {
	Level      string `mapstructure:"level" json:"level" yaml:"level"`                   // 日志级别: debug, info, warn, error
	Format     string `mapstructure:"format" json:"format" yaml:"format"`                // 日志格式: json, console
	Output     string `mapstructure:"output" json:"output" yaml:"output"`                // 输出位置: stdout, file, both
	Path       string `mapstructure:"path" json:"path" yaml:"path"`                      // 日志文件路径
	FileName   string `mapstructure:"file-name" json:"file-name" yaml:"file-name"`       // 日志文件名
	MaxSize    int    `mapstructure:"max-size" json:"max-size" yaml:"max-size"`          // 单个日志文件最大大小(MB)
	MaxBackups int    `mapstructure:"max-backups" json:"max-backups" yaml:"max-backups"` // 保留的旧日志文件数量
	MaxAge     int    `mapstructure:"max-age" json:"max-age" yaml:"max-age"`             // 保留日志文件的最大天数
	Compress   bool   `mapstructure:"compress" json:"compress" yaml:"compress"`          // 是否压缩旧日志文件
}
