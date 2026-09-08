#!/usr/bin/env bash
set -Eeuo pipefail
# Git 检出的应用代码需要能被容器内的 node 用户读取。
# 仅生成密钥配置时使用 077，不能把它应用到整个部署过程。
umask 022

APP_DIR="${APP_DIR:-/home/wsgfai/PEIS}"
BRANCH="${BRANCH:-main}"
GITHUB_URL="https://github.com/haonanhu02-jpg/PEIS-.git"
MIRROR_URL="https://ghfast.top/https://github.com/haonanhu02-jpg/PEIS-.git"
MYSQL_IMAGE="${MYSQL_IMAGE:-mysql:8.0.46-debian}"
# 服务端需要供局域网访问；可通过环境变量指定具体网卡地址。
export BIND_ADDRESS="${BIND_ADDRESS:-0.0.0.0}"
export GIT_TERMINAL_PROMPT=0
COMPOSE_FILE="$APP_DIR/compose.yaml"
ENV_FILE="$APP_DIR/.env.container"
OVERRIDE_FILE=""
COMPOSE=()

cleanup() { [[ -z "$OVERRIDE_FILE" ]] || rm -f -- "$OVERRIDE_FILE"; }
failed() {
  local code=$?
  trap - ERR
  echo "更新失败（退出码 $code）。未删除数据库卷或重置已有密码。" >&2
  if ((${#COMPOSE[@]})); then
    "${COMPOSE[@]}" ps >&2 || true
    "${COMPOSE[@]}" logs --tail 40 mysql app >&2 || true
  fi
  exit "$code"
}
trap cleanup EXIT
trap failed ERR
trap 'exit 130' INT
trap 'exit 143' TERM

for command in git docker mktemp; do
  command -v "$command" >/dev/null || { echo "缺少命令：$command" >&2; exit 1; }
done
docker info >/dev/null
docker compose version
[[ "$MYSQL_IMAGE" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/@:-]*$ ]] || { echo 'MYSQL_IMAGE 格式无效' >&2; exit 1; }
git_cmd() { git -c safe.directory="$APP_DIR" -c http.version=HTTP/1.1 "$@"; }

echo '============ 开始更新 PEIS 平台 ============'
if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  [[ "$(git_cmd branch --show-current)" == "$BRANCH" ]] || { echo "请先切换到 $BRANCH 分支" >&2; exit 1; }
  [[ -z "$(git_cmd status --porcelain --untracked-files=no)" ]] || {
    echo '仓库有已跟踪文件的本地修改，请先保存或提交；脚本不会覆盖它们。' >&2; exit 1;
  }
  action=pull
else
  mkdir -p "$(dirname "$APP_DIR")"
  action=clone
fi

updated=false
for url in "$MIRROR_URL" "$GITHUB_URL"; do
  for attempt in 1 2 3; do
    echo "代码更新尝试 $attempt：$url"
    if [[ "$action" == pull ]]; then
      if git_cmd pull --ff-only "$url" "$BRANCH"; then updated=true; break; fi
    else
      if git_cmd clone --branch "$BRANCH" --single-branch "$url" "$APP_DIR"; then updated=true; break; fi
    fi
    if [[ "$attempt" != 3 ]]; then sleep 3; fi
  done
  if [[ "$updated" == true ]]; then break; fi
done
[[ "$updated" == true ]] || { echo '代码更新失败，请检查网络或仓库状态。' >&2; exit 1; }
cd "$APP_DIR"
echo "当前提交：$(git_cmd log -1 --oneline)"
[[ -f "$COMPOSE_FILE" ]] || { echo "缺少 $COMPOSE_FILE" >&2; exit 1; }

# 修复旧版脚本以 umask 077 检出的代码；不处理 .env 或数据库目录。
for source_dir in "$APP_DIR/src" "$APP_DIR/web"; do
  [[ ! -d "$source_dir" ]] || chmod -R u+rwX,go+rX "$source_dir"
done
chmod a+r "$APP_DIR/package.json" "$APP_DIR/package-lock.json" "$APP_DIR/Dockerfile"

if [[ ! -f "$ENV_FILE" ]]; then
  command -v openssl >/dev/null || { echo '生成随机配置需要 openssl，请安装后重试。' >&2; exit 1; }
  db_password=$(openssl rand -hex 32)
  root_password=$(openssl rand -hex 32)
  jwt_secret=$(openssl rand -hex 48)
  # 新配置使用随机值，不复制示例中的占位密码。
  (umask 077; set -o noclobber; printf 'DB_PASSWORD=%s\nMYSQL_ROOT_PASSWORD=%s\nJWT_SECRET=%s\nBIND_ADDRESS=%s\nAPP_PORT=9280\n' \
    "$db_password" "$root_password" "$jwt_secret" "$BIND_ADDRESS" > "$ENV_FILE")
  unset db_password root_password jwt_secret
  echo "已生成随机配置：$ENV_FILE"
else
  echo '保留已有 .env.container，不重新生成数据库密码。'
fi

# 临时覆盖不修改 Git 跟踪的 compose.yaml，不影响下次 git pull。
OVERRIDE_FILE=$(mktemp /tmp/peis-compose.XXXXXX.yaml)
printf 'services:\n  mysql:\n    image: "%s"\n    healthcheck:\n      start_period: 60s\n      retries: 60\n' "$MYSQL_IMAGE" > "$OVERRIDE_FILE"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE")
"${COMPOSE[@]}" config --quiet

echo "正在拉取兼容镜像：$MYSQL_IMAGE（首次下载可能较慢，请等待）"
"${COMPOSE[@]}" pull mysql
echo '验证 MySQL 镜像能否在当前 CPU 上运行（不挂载数据库、不映射端口）...'
docker run --rm --network none "$MYSQL_IMAGE" mysqld --version

echo '构建应用；构建失败时不会先停止现有服务...'
"${COMPOSE[@]}" build app
echo '更新容器并等待 MySQL 和应用健康检查通过...'
"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 360
"${COMPOSE[@]}" ps
echo '============ PEIS 平台更新完成 ============'
echo "服务器局域网绑定：$BIND_ADDRESS；默认访问 http://192.168.3.110:9280/#/（端口以实际配置为准）"
echo '以后继续使用此脚本更新，以保留兼容 MySQL 镜像覆盖。'
