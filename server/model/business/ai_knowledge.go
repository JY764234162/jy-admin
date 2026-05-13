package business

import "gorm.io/gorm"

// AIKnowledgeFile AI 知识库文件表
type AIKnowledgeFile struct {
	gorm.Model
	DocID      string `json:"docId" gorm:"index;comment:文档ID"`
	Filename   string `json:"filename" gorm:"comment:原始文件名"`
	CosURL     string `json:"cosUrl" gorm:"comment:COS文件地址"`
	CosKey     string `json:"cosKey" gorm:"comment:COS对象键"`
	ChunkCount int    `json:"chunkCount" gorm:"default:0;comment:片段数"`
	UserID     uint   `json:"userId" gorm:"index;comment:用户ID"`
	FileType   string `json:"fileType" gorm:"comment:文件类型扩展名"`
	Status     string `json:"status" gorm:"default:'pending';comment:状态:pending/parsing/indexed/failed"`
	ErrorMsg   string `json:"errorMsg" gorm:"comment:错误信息"`
}
