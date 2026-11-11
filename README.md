# LiveMaster 直播大师

开播前的直播排练室 + 费曼式学习工具。

**在线演示：[https://livemaster.cardecho.cn/](https://livemaster.cardecho.cn/)**

输入一个直播主题，AI 生成一群有性格的虚拟观众 Bot（捧场型、抬杠型、学习型、易怒型……），然后像真实直播一样开一场**文字直播**：弹幕实时滚动、提问等你回应、冷场会被感知、礼物会飞进来、热度从 L0 爬到 L3、系统按表现推送流量。下播即生成复盘：热度曲线、事件时间轴、观众心态变化、AI 逐段点评。

所有观众均为 AI 虚构。适用于新人主播排练，也可以把知识讲给"会追问的虚拟学生"听（费曼学习法）。

## 技术栈

| 项 | 内容 |
|----|------|
| 框架 | Next.js 15（App Router）+ TypeScript |
| 数据库 | Neon Postgres（Serverless Postgres，Vercel 集成） |
| 认证 | 自建（users 表 + bcrypt + JWT HttpOnly Cookie，无外部认证服务） |
| AI | 供应商无关调用层（OpenAI Chat Completions 兼容），默认 DeepSeek，支持任意兼容端点切换 |
| 部署 | Vercel |

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填入环境变量
npm run dev                        # http://localhost:3000
```

### 环境变量（`.env.local`）

```bash
# Neon Postgres（Vercel 集成会自动注入；本地从 Neon Console 复制）
DATABASE_URL=postgresql://user:pwd@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://user:pwd@ep-xxx.region.aws.neon.tech/neondb?sslmode=require  # DDL/迁移用

# 会话签名密钥（生成：openssl rand -base64 32）
AUTH_SECRET=

# LLM（OpenAI Chat Completions 兼容端点；不填时自动降级为本地模板弹幕，功能闭环完整）
LLM_API_KEY=xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash        # 直播弹幕/复盘主模型
LLM_FAST_MODEL=deepseek-flash   # 观众群画像等轻量任务
LLM_TICK_MODEL=deepseek-flash   # 直播 tick 弹幕生成
```

### 数据库初始化

在 Neon Console SQL Editor（或 psql）中执行 [`db/schema.sql`](db/schema.sql)，包含：

- `users` / `profiles` / `live_sessions` / `bots` / `events` / `ai_usage` 六张表
- 认证为自建方案：bcrypt 密码哈希 + JWT 会话 Cookie，数据隔离由服务端 SQL 按 `user_id` 过滤

## 目录结构

```
src/
├── app/
│   ├── page.tsx              # 官网落地页
│   ├── app/                  # 工作台（登录后）
│   │   ├── page.tsx          #   首页：快速开始 + 最近场次
│   │   ├── new/              #   新建排练：主题/场景/Bot 群生成
│   │   ├── live/[id]/        #   直播中：三栏弹幕间 + tick 轮询
│   │   ├── replay/[id]/      #   复盘：曲线/时间轴/AI 报告
│   │   ├── history/          #   历史场次
│   │   └── settings/         #   账号设置
│   └── api/
│       ├── auth/             # 注册/登录/登出/资料/改密/删号（自建认证）
│       ├── sessions/         # 场次 CRUD / 结束 / 中断
│       └── live/             # tick（引擎步进）/ send（主播发言）
├── components/               # TopNav / AuthModal / AuthProvider
├── db/schema.sql             # Neon Postgres DDL
└── lib/
    ├── engine/               # 导演引擎（热度/流量池/退出判定/事件生成）
    ├── ai/llm.ts              # 供应商无关 LLM 调用层（LLM_* 优先，GLM_* 回退）
    ├── db.ts / auth.ts       # pg 连接池 / 自建认证（bcrypt + JWT）
    └── types.ts              # 领域类型与契约
```

## 核心机制

- **导演引擎**：确定性逻辑（热度计算、L0~L3 流量池晋级、冷场退出判定）用代码保证可复现可复盘；AI 只负责生成弹幕/提问/情绪/礼物等内容
- **低频调度 + 错峰放出**：定时 tick 每 60 秒一轮，主播发言后（冷却 20 秒）立即触发一轮贴题反应；单轮产出的弹幕在窗口内错峰陆续上屏，复盘时间轴与用户所见一致
- **无 Key 降级**：未配置 `LLM_API_KEY` 时自动使用本地模板生成弹幕，完整流程可跑通

## 部署（Vercel）

1. 导入本仓库（Vercel 集成 Neon 后 `DATABASE_URL` 等变量自动注入）
2. 手动补充 `AUTH_SECRET`（`openssl rand -base64 32` 生成）与 `LLM_*` 各项
3. Framework Preset 选 Next.js，直接 Deploy

## 版本规划

- **V0.1（当前）**：文字直播排练最小闭环——主题 → Bot 群 → 直播 → 复盘回放
- **V0.2**：快捷话术服务端化、Bot 编辑/移除、平板断点优化
- **V0.3**：完整费曼四维掌握度评分、多平台观众画像

## 合规说明

本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容，不构成任何真实平台的数据或建议。
