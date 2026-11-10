# LiveMaster 直播大师

开播前的直播排练室 + 费曼式学习工具。

输入一个直播主题，AI 生成一群有性格的虚拟观众 Bot（捧场型、抬杠型、学习型、易怒型……），然后像真实直播一样开一场**文字直播**：弹幕实时滚动、提问等你回应、冷场会被感知、礼物会飞进来、热度从 L0 爬到 L3、系统按表现推送流量。下播即生成复盘：热度曲线、事件时间轴、观众心态变化、AI 逐段点评。

所有观众均为 AI 虚构。适用于新人主播排练，也可以把知识讲给"会追问的虚拟学生"听（费曼学习法）。

## 技术栈

| 项 | 内容 |
|----|------|
| 框架 | Next.js 15（App Router）+ TypeScript |
| 数据库 / 认证 | Supabase（PostgreSQL + Email 登录） |
| AI | GLM-5.3-Flash（智谱 BigModel API） |
| 部署 | Vercel |

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 填入环境变量
npm run dev                        # http://localhost:3000
```

### 环境变量（`.env.local`）

```bash
# Supabase（Project Settings → API）
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 服务端导演引擎写入用

# 智谱 AI（https://open.bigmodel.cn）
GLM_API_KEY=xxx                    # 可选：不填时自动降级为本地模板弹幕，功能闭环完整
```

### 数据库初始化

在 Supabase SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)，包含：

- `live_sessions` / `bots` / `events` / `ai_usage` 四张表
- RLS 用户隔离策略
- 新用户自动创建 profile 的触发器

> 认证设置中请**关闭 Confirm email**（注册即用，测试效率优先）。

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
│       ├── sessions/         # 场次 CRUD / 结束 / 中断
│       └── live/             # tick（引擎步进）/ send（主播发言）
├── components/               # TopNav / AuthModal / AuthProvider
└── lib/
    ├── engine/               # 导演引擎（热度/流量池/退出判定/事件生成）
    ├── ai/glm.ts             # GLM-5.3-Flash 调用层
    ├── supabase/             # client / server / admin 三客户端
    └── types.ts              # 领域类型与契约
```

## 核心机制

- **导演引擎**：确定性逻辑（热度计算、L0~L3 流量池晋级、冷场退出判定）用代码保证可复现可复盘；AI 只负责生成弹幕/提问/情绪/礼物等内容
- **客户端 tick 驱动**：直播中页每 10 秒调用 `/api/live/tick`，无需常驻进程，适配 Vercel Serverless
- **无 Key 降级**：未配置 `GLM_API_KEY` 时自动使用本地模板生成弹幕，完整流程可跑通

## 部署（Vercel）

1. 导入本仓库
2. 在 Project Settings → Environment Variables 配置上述 4 个变量
3. Framework Preset 选 Next.js，直接 Deploy

## 版本规划

- **V0.1（当前）**：文字直播排练最小闭环——主题 → Bot 群 → 直播 → 复盘回放
- **V0.2**：快捷话术服务端化、Bot 编辑/移除、平板断点优化
- **V0.3**：完整费曼四维掌握度评分、多平台观众画像

## 合规说明

本产品所有观众均为 AI 虚构，弹幕、提问、礼物与热度数据均为模拟内容，不构成任何真实平台的数据或建议。
