# ============================================================
# AI Server Dockerfile（FastAPI + LangChain + PGVector + UV）
# ============================================================

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

LABEL MAINTAINER="jy-admin"

WORKDIR /app

# 启用 uv 的编译缓存，加速构建
ENV UV_COMPILE_BYTECODE=1

# 可选：使用国内 PyPI 镜像
# ENV UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

# 临时关闭代理、更换国内 apt 源（Debian）并安装系统依赖
RUN export HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" \
    && sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 缓存层
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# 复制应用代码
COPY . .

# 预下载 Embedding 模型到本地缓存（避免启动时下载超时）
RUN uv run python -c "from sentence_transformers import SentenceTransformer; import os; model = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-small-zh'); SentenceTransformer(model)" || echo "Model pre-download skipped, will download on first use"

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 8000

# 启动 AI Server
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
