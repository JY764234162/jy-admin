# AI Server LangChain + pgvector 升级设计

## Context

当前 ai-server 使用手写实现：TF-IDF 向量化 + numpy 文件存储 + OpenAI SDK 调 LongCat。
需要升级为 LangChain 框架 + 真正向量数据库，新增多轮对话记忆和结构化输出能力。

## 技术选型

| 组件 | 选择 | 说明 |
|------|------|------|
| AI 框架 | LangChain | 统一管理 LLM、向量库、RAG 链 |
| 向量数据库 | PostgreSQL + pgvector | Docker 部署，LangChain 内置支持 |
| LLM | LongCat（OpenAI 兼容） | 通过 LangChain ChatOpenAI 适配 |
| Embedding | MiniMax 云 API | 用 mmx CLI 或直接 HTTP 调用 |
| 文档解析 | LangChain Loaders | PyMuPDFLoader + CSVLoader + TextLoader |
| 对话记忆 | LangChain ConversationBufferMemory | PG 持久化 |
| 部署 | Docker Compose | 新增 pgvector 容器 |

## 基础设施变更

### docker-compose.yml 新增服务

```yaml
postgres-vector:
  image: pgvector/pgvector:pg16
  container_name: jy-admin-pgvector
  restart: always
  environment:
    POSTGRES_DB: ai_vectors
    POSTGRES_USER: ai_admin
    POSTGRES_PASSWORD: ${PG_PASSWORD:-ai123456}
  ports:
    - "5433:5432"
  volumes:
    - pgvector_data:/var/lib/postgresql/data
  networks:
    - jy-admin-network
```

端口 5433 避免和本地 PostgreSQL 冲突。

## 文件改造清单

### 1. docker-compose.yml 
- 新增 `postgres-vector` 服务
- 新增 `pgvector_data` volume

### 2. requirements.txt
新增：
- `langchain>=0.3.0`
- `langchain-openai>=0.2.0`
- `langchain-community>=0.3.0`
- `langchain-postgres>=0.0.12`
- `psycopg[binary]>=3.2.0`
- `mmx-cli` 已全局安装，Embedding 通过 HTTP 直接调用 MiniMax API

### 3. config.py
新增配置项：
- `PG_CONNECTION_STRING`：PostgreSQL 连接串
- `MINIMAX_API_KEY`：MiniMax Embedding API Key
- `MINIMAX_BASE_URL`：MiniMax API 地址

### 4. services/embedding.py
- 替换 TF-IDF 为 MiniMax Embedding API 调用
- 使用 requests 直接调用 MiniMax 的 `/v1/embeddings` 接口
- `embed_texts(texts)` 和 `embed_query(text)` 接口不变

### 5. services/vector_store.py
- 替换 numpy 文件存储为 LangChain PGVector
- 使用 `langchain_postgres.vectorstores.PGVector`
- 自动建表、自动持久化到 PostgreSQL
- `add_documents()` / `search()` / `list_documents()` / `delete()` 接口不变

### 6. services/llm.py
- 替换 OpenAI SDK 为 LangChain `ChatOpenAI`
- `chat()` 和 `chat_stream()` 接口不变
- `base_url` 指向 LongCat

### 7. services/document.py
- 替换手写解析为 LangChain Document Loaders
- `PyMuPDFLoader` 处理 PDF
- `CSVLoader` 处理 Excel（先转 CSV）
- `TextLoader` 处理 TXT/MD
- `RecursiveCharacterTextSplitter` 拆分（不变）

### 8. services/memory.py（新增）
- 使用 LangChain `ConversationBufferMemory`
- 对话历史存储在 PostgreSQL
- 按 conversation_id 隔离不同对话

### 9. routers/knowledge.py
- 使用 LangChain `RetrievalQA` 链替换手写 RAG 流程
- 新增结构化输出：`with_structured_output()` 返回 JSON
- 保留现有接口不变

### 10. routers/chat.py（新增）
- `POST /api/chat`：多轮对话，传入 conversation_id + message
- `GET /api/chat/{id}/history`：获取对话历史
- `DELETE /api/chat/{id}`：清除对话记忆
- 使用 LangChain memory 管理上下文

### 11. main.py
- 注册 chat router
- 启动时检查 PG 连接

## API 接口

### 知识库接口（已有，改造）

```
POST /api/knowledge/upload     — 上传文档
  请求：multipart/form-data, file
  响应：{ "knowledge_id": "xxx", "chunks": 42 }

POST /api/knowledge/query      — 知识库问答（新增结构化输出）
  请求：{ "question": "...", "top_k": 3, "structured": true }
  响应（structured=true）：
    { "answer": "...", "sources": [...], "confidence": 0.85 }
  响应（structured=false, 流式 SSE）：逐字输出

GET  /api/knowledge/list       — 知识库列表
DELETE /api/knowledge/{id}     — 删除知识库
```

### 对话接口（新增）

```
POST /api/chat                 — 多轮对话
  请求：{ "message": "你好", "conversation_id": "可选，不传则新建" }
  响应（SSE 流式）：逐字输出
  Header 返回 X-Conversation-Id

GET  /api/chat/{id}/history    — 获取对话历史
  响应：{ "messages": [{"role": "user", "content": "..."}, ...] }

DELETE /api/chat/{id}          — 清除对话记忆
```

## 数据库表结构（PGVector 自动创建）

LangChain PGVector 会自动创建：
- `langchain_pg_collection`：文档集合表
- `langchain_pg_embedding`：向量 + 文本 + 元数据表

对话记忆表：
- `chat_conversations`：会话列表
- `chat_messages`：消息记录（role + content + timestamp）

## Embedding 实现细节

MiniMax Embedding API 调用方式：
```
POST https://api.minimax.chat/v1/embeddings
Header: Authorization: Bearer {MINIMAX_API_KEY}
Body: { "model": "embo-01", "texts": ["文本1", "文本2"], "type": "db" }
```

用 requests 库直接调用，不依赖 LangChain 的 Embedding 封装（因为 MiniMax 不是标准 OpenAI 兼容接口）。

## 验证方式

1. `docker compose up postgres-vector` 启动向量数据库
2. `cd ai-server && ../venv/bin/python main.py` 启动 AI 服务
3. `curl -X POST http://localhost:8000/api/knowledge/upload -F "file=@面试题.md"` 上传文档
4. `curl -X POST http://localhost:8000/api/knowledge/query -H "Content-Type: application/json" -d '{"question":"面试题有哪些？"}'` 知识库问答
5. `curl -X POST http://localhost:8000/api/chat -H "Content-Type: application/json" -d '{"message":"你好"}'` 多轮对话
6. 第二轮对话传入返回的 conversation_id，验证 AI 记住上下文
