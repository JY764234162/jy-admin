package config

import (
	"path/filepath"
)

type Sqlite struct {
	GeneralDB `mapstructure:",squash"`
}

func (s *Sqlite) Dsn() string {
	return filepath.Join(s.Path, s.Dbname+".db")
}
