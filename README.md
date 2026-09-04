# PEIS 本地容器验收

当前以本地验收为目标。项目是原生 HTML/CSS/JS + Node.js，无需前端编译；Docker 构建安装锁定依赖并打包前后端，MySQL 8 使用独立持久卷。

## 本地启动

安装并启动 Docker Desktop（Linux containers），在本目录执行：

```powershell
node scripts/init-container-env.mjs
docker compose --env-file .env.container up -d --build
docker compose --env-file .env.container ps
node scripts/smoke.mjs
```

访问 http://127.0.0.1:9280/#/ 。admin/admin123 属于两个团队，limf/123456 只属于涂料事业部。

配置使用 `.env.container`，自动生成随机数据库密码及 JWT 密钥。原有 `.env` 保留，供直接运行 Node 使用，不会复制到镜像或提交 Git。MySQL 自动建立 peis 库和 peis 专用账号；应用首次启动建表并写种子数据。MySQL 不映射宿主机端口，不影响本机其他数据库。

## 运维命令

```powershell
docker compose --env-file .env.container logs --tail 100 app
docker compose --env-file .env.container restart app
docker compose --env-file .env.container down
```

`down` 保留数据库卷；不要使用 `down -v`，该参数会删除验收数据。

## 验收后发布

目标代码仓库：https://github.com/haonanhu02-jpg/PEIS-

验收通过后再提交源码、Dockerfile、Compose 和文档。密钥、数据库、node_modules、镜像 tar 不进入 Git。服务器拉取源码后可执行相同的 Compose 构建命令。

如果要求服务器运行本地构建的同一镜像，可本地 `docker save -o artifacts/peis-local.tar peis:local`，传输后 `docker load -i peis-local.tar`，再 `docker compose --env-file .env.container up -d --no-build`；也可在验收后将镜像发布到 GHCR 并改为拉取版本标签。Git 仓库本身不存储容器镜像。

服务器需要独立生成配置，并将 BIND_ADDRESS 改为服务器绑定地址或 0.0.0.0，APP_PORT 保持 9280。

OA、钉钉、致信当前是模拟实现，本地容器关闭这些集成；真实企业登录和推送需后续提供接口协议与凭据。演示账号用于本地验收，正式发布前需要替换。
