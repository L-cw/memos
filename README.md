# Memos

Memos 是一个使用 Go、React 和 SQLite 构建的自托管记录工具。本项目在备忘录能力之外增加了 Action 工作区，用于管理待办、项目、目标和长期习惯。

## 主要功能

- 创建和管理 Memo，支持 Markdown、标签、附件、可见性及搜索。
- 管理 Todo、Project、Goal 和 Habit，并查看不同状态与时间范围的 Action。
- Goal 支持数值进度记录，Habit 支持按周期打卡、请假、备注和历史统计。
- Memo 与 Action 可以相互关联，方便在记录和行动之间建立联系。
- 数据由本地服务保存，适合个人部署和使用。

## 开发环境

- Go 1.23+
- Node.js 20+
- pnpm

首次启动前安装前端依赖：

```bash
cd web
pnpm install
```

## 启动后端

在项目根目录执行：

```bash
mkdir -p "$PWD/.memos-dev"
go run ./bin/memos --mode dev --port 10086 --data "$PWD/.memos-dev"
```

后端服务地址为 `http://localhost:10086`，本地数据保存在项目根目录的 `.memos-dev` 目录。`--data` 需要使用绝对路径，因为 `go run` 会从临时编译目录启动程序。

## 启动前端

另开一个终端，在项目根目录执行：

```bash
cd web
pnpm dev
```

前端页面地址为 `http://localhost:3001`，开发服务器会将 API 请求代理到本地后端。

## 常用检查

```bash
cd web
pnpm type-check
pnpm lint
pnpm build
```

后端测试：

```bash
go test ./...
```
