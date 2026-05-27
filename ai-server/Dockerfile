# ============================================================
# AI Server Dockerfile（FastAPI + LangChain + PGVector + UV）
# ============================================================
# 构建优化说明：
# - 使用 BuildKit cache mount 缓存 uv 和 apt 下载，避免每次全量重装
# - 依赖文件单独 COPY，代码变更不会导致依赖层失效
# - 预下载 Embedding 模型到镜像，避免启动时超时
# ============================================================

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

LABEL MAINTAINER="jy-admin"

WORKDIR /app

# 启用 uv 编译缓存
ENV UV_COMPILE_BYTECODE=1

# 使用阿里云 PyPI 镜像（清华镜像偶发 DNS 解析失败）
ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

# 构建阶段也使用 HuggingFace 镜像站
ENV HF_ENDPOINT=https://hf-mirror.com

# 安装系统依赖（apt 缓存挂载加速）
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    export HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" \
    && sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件，利用 Docker 层缓存：
# 只要 pyproject.toml / uv.lock 不变，这一层及以下都不会重建
COPY pyproject.toml uv.lock ./

# 安装 Python 依赖（uv 缓存挂载加速，下载过的包不会重复下载）
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
    uv sync --frozen --no-dev

# 复制应用代码（.dockerignore 已排除 .venv/ uploads/ 等）
COPY . .

# 预下载 Embedding 模型到本地缓存（避免启动时下载超时）
RUN uv run python -c \
    "from sentence_transformers import SentenceTransformer; \
    import os; \
    model = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-small-zh'); \
    SentenceTransformer(model)" \
    || echo "Model pre-download skipped, will download on first use"

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 8000

# 启动 AI Server（--frozen 防止运行时意外 sync）
CMD ["uv", "run", "--frozen", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
