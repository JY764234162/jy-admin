# ============================================================
# AI Server Dockerfile（FastAPI + LangChain + PGVector）
# ============================================================

FROM python:3.13-slim

LABEL MAINTAINER="jy-admin"

WORKDIR /app

# 临时关闭代理、更换国内 apt 源（Debian Trixie）并安装系统依赖
RUN export HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" \
    && sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 预下载 Embedding 模型到本地缓存（避免启动时下载超时）
# 默认使用 BAAI/bge-small-zh，可通过 EMBEDDING_MODEL 环境变量覆盖
RUN python -c "from sentence_transformers import SentenceTransformer; import os; model = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-small-zh'); SentenceTransformer(model)" || echo "Model pre-download skipped, will download on first use"

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 8000

# 启动 AI Server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
