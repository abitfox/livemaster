"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TopNav from "@/components/top-nav";
import { useAuth } from "@/components/auth-provider";
import styles from "./page.module.css";

/* ============================================================
   官网落地页 · 9 区块（A2）
   区块文案逐字取自 design/website/index.html 原型
   ============================================================ */

/* ---------- 假弹幕数据（弹幕条目规格：头像 24px 渐变圆 + 用户名 13/600 渐变主色 + 正文 14） ---------- */
interface Danmaku {
  name: string;
  g: number;
  text: string;
  q?: boolean;
  gift?: boolean;
}

const DANMAKU: Danmaku[] = [
  { name: "摸鱼的阿强", g: 6, text: "主播这个开场有点东西，蹲住了" },
  { name: "白嫖怪小美", g: 6, text: "问一下，私域流量到底怎么入门？", q: true },
  { name: "热情老哥大壮", g: 1, text: "讲得好！刚刚那段我记笔记了" },
  { name: "戏精本精", g: 3, text: "前面的别走，主播马上上干货" },
  { name: "学习委员", g: 4, text: "第 3 点能再展开讲讲吗？", q: true },
  { name: "白嫖怪小美", g: 6, text: "送出 火箭 ×1", gift: true },
];

function DmItem({ d }: { d: Danmaku }) {
  return (
    <div className={`${styles.dmItem} ${d.gift ? styles.dmGift : ""}`}>
      <span className={`avatar g${d.g} ${styles.dmAvatar}`}>{d.name.charAt(0)}</span>
      <span>
        <span className={`${styles.dmName} ${styles[d.gift ? "cG5" : `cG${d.g}`]}`}>{d.name}</span>
        <span className={styles.dmText}>
          {d.q ? <span className={styles.qMark}>&raquo;</span> : null}
          {d.text}
        </span>
      </span>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: "AI 观众是真人吗？",
    a: "不是。所有观众、弹幕、提问、礼物全部由 AI 实时生成，每个观众有独立性格设定，但没有任何真人在屏幕后面。",
  },
  {
    q: "热度等级和真实平台一样吗？",
    a: "不一样。L0 冷启动、L1 起量、L2 加速推送、L3 爆款池是一套透明教学模型，教会你\u201c什么样的表现会换来推流\u201d，但数值不对应任何真实平台。",
  },
  {
    q: "需要会写代码或配置什么吗？",
    a: "不需要。注册后输入直播主题，AI 生成观众群，点击开播即可。",
  },
  {
    q: "收费吗？",
    a: "公测期完全免费，所有功能开放。正式版定价将在本页提前公布，公测用户获得专属优惠。",
  },
  {
    q: "费曼学习模式是什么？",
    a: "把\u201c讲给别人听\u201d变成学习工具。虚拟学生会对你的讲解追问到底——讲得含糊，他们不会放过你。适合备考、学新技能、准备分享和授课。",
  },
  {
    q: "我的排练数据安全吗？",
    a: "排练内容只用于生成你自己的复盘报告，不用于训练模型，不向第三方提供。可随时在账号设置删除所有数据或注销账号。",
  },
  {
    q: "一场排练大概多久？",
    a: "由你决定。可设 10~60 分钟，也可随时手动结束。复盘报告在下播后 1 分钟内生成。",
  },
];

const cssVar = (obj: Record<string, string>) => obj as React.CSSProperties;

function HomePage() {
  const { openAuth } = useAuth();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);

  /* 双场景 tab */
  const [scene, setScene] = useState<"a" | "b">("a");

  /* FAQ 手风琴：同时只开一项 */
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const faqAnswerRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ?auth=login：middleware 重定向落地后自动唤起登录弹窗 */
  useEffect(() => {
    if (searchParams.get("auth") === "login") openAuth("login");
  }, [searchParams, openAuth]);

  /* 滚动进场：IntersectionObserver 一次性；流程行额外点亮 */
  useEffect(() => {
    const els = Array.from(rootRef.current?.querySelectorAll("[data-reveal]") ?? []);
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          if ((entry.target as HTMLElement).dataset.lit) entry.target.classList.add("lit");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.25 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* FAQ 展开高度（max-height 过渡 240ms） */
  useEffect(() => {
    faqAnswerRefs.current.forEach((el, i) => {
      if (el) el.style.maxHeight = faqOpen === i ? `${el.scrollHeight}px` : "0px";
    });
  }, [faqOpen]);

  return (
    <div className={styles.site} ref={rootRef}>
      <TopNav />

      <main>
        {/* ======================= 区块1 · Hero ======================= */}
        <section className={styles.hero} id="hero">
          <div className={styles.heroInner}>
            <span className={styles.livePill}>
              <span className="live-dot" />
              LIVE · 正在流行
            </span>
            <h1>
              <span className="hl">练够了</span>，直播才敢开始
            </h1>
            <p className={styles.heroSub}>
              AI 虚拟观众陪你排练每一场直播——弹幕、提问、冷场、礼物、流量推送，全部真实上演。播后还有热度复盘，告诉你在哪一秒丢了观众。
            </p>
            <div className={styles.heroCtas}>
              <button className="pill pill-primary" onClick={() => openAuth("register")}>
                免费开始排练
              </button>
              <a className="pill pill-ghost" href="#how">
                看看它怎么工作
              </a>
            </div>
            <p className={styles.heroTrust}>所有观众均为 AI 虚构 · 公测期免费 · 无需信用卡</p>
            <div className={styles.lightband} aria-hidden="true" />

            {/* 直播间预览卡：弹幕纵向无缝循环 */}
            <div className={styles.previewCard} data-reveal>
              <div className={styles.previewHead}>
                <span className={styles.livePill}>
                  <span className="live-dot" />
                  LIVE
                </span>
                <span className={styles.previewTheme}>
                  排练间 · 主题：3 天涨粉 1000 的短视频方法论
                </span>
              </div>
              <div className={styles.dmViewport}>
                <div className={styles.dmList}>
                  {DANMAKU.map((d, i) => (
                    <DmItem key={`a${i}`} d={d} />
                  ))}
                  {DANMAKU.map((d, i) => (
                    <DmItem key={`b${i}`} d={d} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className={styles.container}>
          {/* ======================= 区块2 · 痛点 ======================= */}
          <section className={styles.section} id="pain">
            <div className={styles.painGrid}>
              <div className={styles.sectionHead} data-reveal>
                <span className={styles.eyebrow}>Pain Points</span>
                <h2 className={styles.h2}>
                  第一次开播的坑，
                  <br />
                  我们帮你提前踩完
                </h2>
                <p>没有人天生会直播。大多数主播的第一场翻车，都发生在没人告诉过他们的地方。</p>
              </div>
              <div className={styles.painCards}>
                <div className={styles.painCard} data-reveal style={cssVar({ "--rd": "0s" })}>
                  <div className={`${styles.painIcon} g1`}>
                    <svg className={styles.icon} viewBox="0 0 24 24">
                      <path d="M3 12h4l3-8 4 16 3-8h4" />
                    </svg>
                  </div>
                  <div>
                    <h3>无人问津的冷启动</h3>
                    <p>
                      开播 <span className="num">30</span> 分钟，在线人数停在{" "}
                      <span className="num">3</span>。没人告诉你，前 <span className="num">5</span>{" "}
                      分钟的节奏决定了推流量的天花板。
                    </p>
                  </div>
                </div>
                <div className={styles.painCard} data-reveal style={cssVar({ "--rd": ".08s" })}>
                  <div className={`${styles.painIcon} g2`}>
                    <svg className={styles.icon} viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.8-1.1 1.6" />
                      <path d="M12 16.5h.01" />
                    </svg>
                  </div>
                  <div>
                    <h3>接不住的提问</h3>
                    <p>
                      观众抛来一个专业问题，你愣了 <span className="num">8</span>{" "}
                      秒，人就走了。
                    </p>
                  </div>
                </div>
                <div className={styles.painCard} data-reveal style={cssVar({ "--rd": ".16s" })}>
                  <div className={`${styles.painIcon} g5`}>
                    <svg className={styles.icon} viewBox="0 0 24 24">
                      <path d="M4 17l6-6-6-6" />
                      <path d="M12 19h8" />
                    </svg>
                  </div>
                  <div>
                    <h3>意外的冷场</h3>
                    <p>讲完一段，弹幕安静了。你不知道是内容问题，还是节奏问题。</p>
                  </div>
                </div>
                <div className={styles.painCard} data-reveal style={cssVar({ "--rd": ".24s" })}>
                  <div className={`${styles.painIcon} g6`}>
                    <svg className={styles.icon} viewBox="0 0 24 24">
                      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
                      <path d="M13 4h7v7" />
                      <path d="M20 4L9 15" />
                    </svg>
                  </div>
                  <div>
                    <h3>播完就忘</h3>
                    <p>
                      下播之后只剩感觉：&quot;今天好像不太行&quot;。行在哪、砸在哪，全都说不清。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 区块3 · 工作原理 ======================= */}
          <section className={styles.section} id="how">
            <div className={`${styles.sectionHead} ${styles.sectionHeadCenter}`} data-reveal>
              <span className={styles.eyebrow}>How It Works</span>
              <h2 className={styles.h2}>三步，开始你的第一场排练</h2>
            </div>
            <div className={styles.steps}>
              <div className={styles.stepCard} data-reveal style={cssVar({ "--rd": "0s" })}>
                <div className={styles.stepNo}>01</div>
                <h3>说出你的主题</h3>
                <p>
                  输入&quot;3 天涨粉 1000
                  的短视频方法论&quot;，AI 为你生成一群性格迥异的虚拟观众：捧场的、抬杠的、提问的、随时准备退出的。
                </p>
              </div>
              <div className={styles.stepCard} data-reveal style={cssVar({ "--rd": ".08s" })}>
                <div className={styles.stepNo}>02</div>
                <h3>开播，像真的一样讲</h3>
                <p>
                  弹幕实时滚动，提问等你回应，冷场会被感知，礼物会飞进来。热度从 L0 爬到
                  L3，流量池随你的表现推送。
                </p>
              </div>
              <div className={styles.stepCard} data-reveal style={cssVar({ "--rd": ".16s" })}>
                <div className={styles.stepNo}>03</div>
                <h3>下播即复盘</h3>
                <p>
                  热度曲线、事件时间轴、每位观众的心态变化、AI
                  逐段点评，一场排练值回十场真实直播的教训。
                </p>
              </div>
            </div>
            <div
              className={styles.flowRow}
              data-reveal
              data-lit="1"
              style={{ "--d": "0s" } as React.CSSProperties}
            >
              <span className={styles.flowPill} style={cssVar({ "--d": "0s" })}>
                <span className={styles.flowDot} />
                主题输入
              </span>
              <svg
                className={`${styles.icon} ${styles.iconSm} ${styles.flowArrow}`}
                style={cssVar({ "--d": ".15s" })}
                viewBox="0 0 24 24"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className={styles.flowPill} style={cssVar({ "--d": ".15s" })}>
                <span className={styles.flowDot} />
                观众生成
              </span>
              <svg
                className={`${styles.icon} ${styles.iconSm} ${styles.flowArrow}`}
                style={cssVar({ "--d": ".3s" })}
                viewBox="0 0 24 24"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className={styles.flowPill} style={cssVar({ "--d": ".3s" })}>
                <span className={styles.flowDot} />
                开播排练
              </span>
              <svg
                className={`${styles.icon} ${styles.iconSm} ${styles.flowArrow}`}
                style={cssVar({ "--d": ".45s" })}
                viewBox="0 0 24 24"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span className={styles.flowPill} style={cssVar({ "--d": ".45s" })}>
                <span className={styles.flowDot} />
                复盘报告
              </span>
            </div>
          </section>

          {/* ======================= 区块4 · 卖点 2×2 ======================= */}
          <section className={`${styles.section} ${styles.features}`} id="features">
            <div className={styles.sectionHead} data-reveal>
              <span className={styles.eyebrow}>Features</span>
              <h2 className={styles.h2}>
                不只是聊天机器人，
                <br />
                是一个会惩罚你的直播间
              </h2>
            </div>
            <div className={styles.featureGrid}>
              <div
                className={styles.featureCard}
                data-reveal
                style={cssVar({ "--rd": "0s", "--band": "var(--g1)" })}
              >
                <div className={`${styles.featureIcon} g1`}>
                  <svg className={styles.icon} viewBox="0 0 24 24">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
                    <circle cx="17" cy="9" r="2.4" />
                    <path d="M17 14.5c2.5.4 4 1.9 4 4.5" />
                  </svg>
                </div>
                <div>
                  <h3>有人格的观众群</h3>
                  <p>
                    观众不是随机弹幕。每种人格（捧场型/抬杠型/学习型/路人型/土豪型/易怒型）有独立耐心值和退出条件，你讲得无聊，他们是真会走的。
                  </p>
                </div>
              </div>
              <div
                className={styles.featureCard}
                data-reveal
                style={cssVar({ "--rd": ".08s", "--band": "var(--g2)" })}
              >
                <div className={`${styles.featureIcon} g2`}>
                  <svg className={styles.icon} viewBox="0 0 24 24">
                    <path d="M3 17l4-6 4 3 4-8 6 11" />
                    <path d="M3 21h18" />
                  </svg>
                </div>
                <div>
                  <h3>热度与流量推送模拟</h3>
                  <p>
                    从 L0 冷启动到 L3
                    爆款池，每一级推送标准透明可查。冷场敏感度、观众脾气都能调，练的就是你最怕的场景。
                  </p>
                </div>
              </div>
              <div
                className={styles.featureCard}
                data-reveal
                style={cssVar({ "--rd": ".16s", "--band": "var(--g3)" })}
              >
                <div className={`${styles.featureIcon} g3`}>
                  <svg className={styles.icon} viewBox="0 0 24 24">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M8 8h8M8 12h8M8 16h5" />
                  </svg>
                </div>
                <div>
                  <h3>秒级复盘报告</h3>
                  <p>
                    热度曲线 + 事件时间轴 +
                    观众心态变化时间线，AI&nbsp;指出&quot;第 <span className="num">4</span> 分{" "}
                    <span className="num">12</span> 秒的沉默让你掉了 <span className="num">5</span>{" "}
                    个观众&quot;这种级别的细节。
                  </p>
                </div>
              </div>
              <div
                className={styles.featureCard}
                data-reveal
                style={cssVar({ "--rd": ".24s", "--band": "var(--g4)" })}
              >
                <div className={`${styles.featureIcon} g4`}>
                  <svg className={styles.icon} viewBox="0 0 24 24">
                    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
                  </svg>
                </div>
                <div>
                  <h3>双场景训练</h3>
                  <p>
                    主播排练之外还有费曼学习模式：把要学的知识讲给虚拟学生听，讲不明白的地方，学生真的会追问到你明白为止。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 区块5 · 双场景切换 ======================= */}
          <section className={styles.section} id="scenarios">
            <div className={`${styles.sectionHead} ${styles.sectionHeadCenter}`} data-reveal>
              <span className={styles.eyebrow}>Scenarios</span>
              <h2 className={styles.h2}>两种场景，一种真实感</h2>
            </div>
            <div className={styles.sceneTabs} role="tablist" aria-label="场景切换">
              <button
                className={`${styles.sceneTab} ${scene === "a" ? styles.sceneTabActive : ""}`}
                role="tab"
                aria-selected={scene === "a"}
                onClick={() => setScene("a")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    setScene("b");
                  }
                }}
              >
                主播排练
              </button>
              <button
                className={`${styles.sceneTab} ${scene === "b" ? styles.sceneTabActive : ""}`}
                role="tab"
                aria-selected={scene === "b"}
                onClick={() => setScene("b")}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    e.preventDefault();
                    setScene("a");
                  }
                }}
              >
                费曼学习
              </button>
            </div>
            <div className={styles.scenePanelWrap}>
              {/* 场景 A 主播排练 */}
              <div
                className={`${styles.scenePanel} ${scene === "a" ? styles.scenePanelActive : ""}`}
                role="tabpanel"
                aria-hidden={scene !== "a"}
              >
                <div>
                  <h3>
                    为真实开播而练<span className={`${styles.sceneTag} ${styles.sceneTagA}`}>场景 A</span>
                  </h3>
                  <p>
                    带货、知识分享、才艺、聊天直播——输入你的直播主题，AI
                    观众按目标平台观众画像生成。你会遇到刁钻提问、无聊退场、突然刷礼物，也会体验热度起飞的推流时刻。
                  </p>
                  <p className={styles.sceneFit}>
                    <strong>适合：</strong>
                    准备开播的新主播 / 想打磨话术的老主播 / 团队直播培训。
                  </p>
                </div>
                <div className={styles.sceneArt} aria-hidden="true">
                  <svg viewBox="0 0 420 260" fill="none">
                    <rect x="40" y="30" width="340" height="200" rx="16" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                    <circle cx="70" cy="60" r="4" fill="#FF4D6A" />
                    <rect x="84" y="55" width="60" height="10" rx="5" fill="rgba(255,77,106,0.25)" />
                    <path d="M70 200 C130 196 170 170 210 150 C250 130 300 100 350 80" stroke="url(#sceneGradA)" strokeWidth="2" strokeLinecap="round" />
                    <path d="M70 200 C130 196 170 170 210 150 C250 130 300 100 350 80 L350 230 L70 230 Z" fill="url(#sceneGradA)" opacity="0.08" />
                    <circle cx="210" cy="150" r="5" fill="#FF4D6A" />
                    <circle cx="210" cy="150" r="10" stroke="rgba(255,77,106,0.4)" strokeWidth="1.5" />
                    <rect x="110" y="90" width="150" height="26" rx="13" fill="rgba(255,255,255,0.06)" />
                    <circle cx="126" cy="103" r="9" fill="url(#ga)" />
                    <circle cx="146" cy="103" r="9" fill="url(#gb)" />
                    <circle cx="166" cy="103" r="9" fill="url(#gc)" />
                    <rect x="184" y="97" width="60" height="12" rx="6" fill="rgba(255,255,255,0.1)" />
                    <defs>
                      <linearGradient id="sceneGradA" x1="70" y1="200" x2="350" y2="80" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#FF4D6A" />
                        <stop offset="1" stopColor="#FF7A4D" />
                      </linearGradient>
                      <linearGradient id="ga" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#FF4D6A" />
                        <stop offset="1" stopColor="#FF8A5C" />
                      </linearGradient>
                      <linearGradient id="gb" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#4D8EFF" />
                        <stop offset="1" stopColor="#6BD0FF" />
                      </linearGradient>
                      <linearGradient id="gc" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#8A5CFF" />
                        <stop offset="1" stopColor="#C86BFF" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
              {/* 场景 B 费曼学习 */}
              <div
                className={`${styles.scenePanel} ${scene === "b" ? styles.scenePanelActive : ""}`}
                role="tabpanel"
                aria-hidden={scene !== "b"}
              >
                <div>
                  <h3>
                    把知识讲给&quot;会追问的学生&quot;听
                    <span className={`${styles.sceneTag} ${styles.sceneTagB}`}>场景 B</span>
                  </h3>
                  <p>
                    费曼技巧的核心是&quot;能讲明白才算学会&quot;。虚拟学生不懂装懂地听，一旦你的解释有漏洞，他们会连环追问。讲完还能看复盘：哪些概念你其实没讲透。
                  </p>
                  <p className={styles.sceneFit}>
                    <strong>适合：</strong>
                    备考学生 / 学习新领域的职场人 / 需要给别人讲明白内容的老师与培训师。
                  </p>
                </div>
                <div className={styles.sceneArt} aria-hidden="true">
                  <svg viewBox="0 0 420 260" fill="none">
                    <rect x="40" y="60" width="200" height="52" rx="14" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                    <rect x="180" y="148" width="200" height="52" rx="14" stroke="rgba(61,214,140,0.5)" strokeWidth="1.5" />
                    <path d="M240 112 L196 148" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" />
                    <circle cx="70" cy="86" r="12" fill="url(#gd)" />
                    <rect x="92" y="78" width="110" height="8" rx="4" fill="rgba(255,255,255,0.1)" />
                    <rect x="92" y="90" width="80" height="8" rx="4" fill="rgba(255,255,255,0.06)" />
                    <circle cx="350" cy="174" r="12" fill="url(#ge)" />
                    <rect x="196" y="162" width="130" height="8" rx="4" fill="rgba(61,214,140,0.4)" />
                    <rect x="196" y="174" width="90" height="8" rx="4" fill="rgba(255,255,255,0.06)" />
                    <path d="M336 170l-8-4v8l8-4z" fill="#3DD68C" />
                    <defs>
                      <linearGradient id="gd" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#3DD68C" />
                        <stop offset="1" stopColor="#6BFFC4" />
                      </linearGradient>
                      <linearGradient id="ge" x1="0" y1="0" x2="1" y2="1">
                        <stop stopColor="#4D8EFF" />
                        <stop offset="1" stopColor="#6BD0FF" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 区块6 · 复盘演示区 ======================= */}
          <section className={styles.section} id="replay">
            <div className={styles.replayGrid}>
              <div className={styles.replayCopy} data-reveal>
                <span className={styles.eyebrow}>Replay</span>
                <h2 className={styles.h2} style={{ marginTop: 16 }}>
                  下播那一刻，答案已经生成
                </h2>
                <p>
                  这是第 <span className="num">12</span>{" "}
                  号排练场次的真实复盘数据（演示）。
                </p>
                <div className={styles.reportCard} data-reveal style={cssVar({ "--rd": ".1s" })}>
                  <span className={styles.reportLabel}>AI 复盘报告 · 摘录</span>
                  <p>
                    开场节奏偏慢，前 <span className="num">3</span>{" "}
                    分钟没有给出钩子。第 <span className="num">7</span>{" "}
                    分钟对&quot;什么是私域流量&quot;的回应非常清晰，建议保留原话。第{" "}
                    <span className="num">22</span>{" "}
                    分钟的观点虽然拉高了热度，但换来了 <span className="num">3</span>{" "}
                    位观众退出——这是热度与留存的权衡，取决于你的直播目标。
                  </p>
                </div>
              </div>
              <div className={styles.replayMock} data-reveal>
                <div className={styles.mockTitle}>
                  <span className="live-dot" />
                  热度曲线 · 场次 <span className="num">#12</span> · 时长{" "}
                  <span className="num">24:35</span>
                </div>
                <svg
                  className={styles.heatSvg}
                  viewBox="0 0 760 300"
                  role="img"
                  aria-label="热度曲线示意图，从 L0 冷启动爬升至 L3 高热"
                >
                  <defs>
                    <linearGradient id="heatGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#5C6578" />
                      <stop offset="0.3" stopColor="#4D8EFF" />
                      <stop offset="0.62" stopColor="#8A5CFF" />
                      <stop offset="0.85" stopColor="#FF4D6A" />
                      <stop offset="1" stopColor="#FF7A4D" />
                    </linearGradient>
                    <linearGradient id="heatFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#5C6578" />
                      <stop offset="0.3" stopColor="#4D8EFF" />
                      <stop offset="0.62" stopColor="#8A5CFF" />
                      <stop offset="1" stopColor="#FF4D6A" />
                    </linearGradient>
                  </defs>
                  <g className={styles.heatGrid}>
                    <line x1="30" y1="60" x2="740" y2="60" />
                    <line x1="30" y1="115" x2="740" y2="115" />
                    <line x1="30" y1="170" x2="740" y2="170" />
                    <line x1="30" y1="225" x2="740" y2="225" />
                    <line x1="30" y1="275" x2="740" y2="275" />
                  </g>
                  <path
                    className={styles.curveArea}
                    d="M40,250 C80,244 110,238 140,242 C170,246 190,220 220,214 C250,208 265,224 290,222 C320,220 330,190 360,178 C390,166 400,148 430,152 C460,156 480,130 510,112 C540,94 560,72 590,68 C620,64 630,96 660,88 C690,80 710,52 730,38 L730,275 L40,275 Z"
                  />
                  <path
                    className={styles.curvePath}
                    d="M40,250 C80,244 110,238 140,242 C170,246 190,220 220,214 C250,208 265,224 290,222 C320,220 330,190 360,178 C390,166 400,148 430,152 C460,156 480,130 510,112 C540,94 560,72 590,68 C620,64 630,96 660,88 C690,80 710,52 730,38"
                  />
                  <g>
                    <circle className={styles.eventDot} cx="220" cy="214" r="8" fill="none" stroke="#FF4D6A" strokeOpacity="0.3" />
                    <circle className={styles.eventDot} cx="220" cy="214" r="4" fill="#FF4D6A">
                      <title>00:03:12 · 冷场 18 秒 · 在线 8→6</title>
                    </circle>
                    <circle className={styles.eventDot} cx="360" cy="178" r="8" fill="none" stroke="#8A5CFF" strokeOpacity="0.3" />
                    <circle className={styles.eventDot} cx="360" cy="178" r="4" fill="#8A5CFF">
                      <title>00:07:40 · 热度 L1→L2 · 推送开启</title>
                    </circle>
                    <circle className={styles.eventDot} cx="510" cy="112" r="8" fill="none" stroke="#FFB84D" strokeOpacity="0.3" />
                    <circle className={styles.eventDot} cx="510" cy="112" r="4" fill="#FFB84D">
                      <title>00:15:02 · 火箭礼物 · 在线 +4</title>
                    </circle>
                    <circle className={styles.eventDot} cx="660" cy="88" r="10" fill="none" stroke="#FF4D6A" strokeOpacity="0.25" />
                    <circle className={styles.eventDot} cx="660" cy="88" r="5" fill="#FF4D6A">
                      <title>00:22:31 · 热度冲至 L3</title>
                    </circle>
                  </g>
                  <g fill="#5C6578" fontSize="11">
                    <text x="40" y="292" style={{ fontVariantNumeric: "tabular-nums" }}>00:00</text>
                    <text x="215" y="292" style={{ fontVariantNumeric: "tabular-nums" }}>00:06</text>
                    <text x="390" y="292" style={{ fontVariantNumeric: "tabular-nums" }}>00:12</text>
                    <text x="565" y="292" style={{ fontVariantNumeric: "tabular-nums" }}>00:18</text>
                    <text x="705" y="292" style={{ fontVariantNumeric: "tabular-nums" }}>00:24</text>
                  </g>
                </svg>
                <div className={styles.timeline}>
                  <div className={styles.tlItem} data-reveal style={cssVar({ "--dot": "#FF4D6A", "--rd": "0s" })}>
                    <span className={`num ${styles.tlTime}`}>00:03:12</span>
                    冷场 <span className="num">18</span> 秒 · 在线 <span className="num">8→6</span> ·
                    观众&quot;摸鱼的阿强&quot;退出
                  </div>
                  <div className={styles.tlItem} data-reveal style={cssVar({ "--dot": "#8A5CFF", "--rd": ".08s" })}>
                    <span className={`num ${styles.tlTime}`}>00:07:40</span>
                    回应提问出色 · 热度 <span className="num">L1→L2</span> · 推送开启
                  </div>
                  <div className={styles.tlItem} data-reveal style={cssVar({ "--dot": "#FFB84D", "--rd": ".16s" })}>
                    <span className={`num ${styles.tlTime}`}>00:15:02</span>
                    观众&quot;白嫖怪小美&quot;送出火箭 · 在线 <span className="num">+4</span>
                  </div>
                  <div className={`${styles.tlItem} ${styles.tlKey}`} data-reveal style={cssVar({ "--dot": "#FF4D6A", "--rd": ".24s" })}>
                    <span className={`num ${styles.tlTime}`}>00:22:31</span>
                    争议观点引发刷屏 · 热度冲至 <span className="num">L3</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ======================= 区块7 · 信任与免责 ======================= */}
          <section className={styles.section} id="trust">
            <div className={styles.trustCard} data-reveal>
              <h2>你需要知道的几件事</h2>
              <ol>
                <li>
                  <svg className={`${styles.icon} ${styles.iconSm} ${styles.trustCheck}`} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
                  </svg>
                  <span>
                    <strong>所有观众均为 AI 虚构</strong>
                    ——直播间里的每一位观众、每一条弹幕、每一份礼物都由 AI 生成，不来自任何真人。
                  </span>
                </li>
                <li>
                  <svg className={`${styles.icon} ${styles.iconSm} ${styles.trustCheck}`} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
                  </svg>
                  <span>
                    <strong>热度模拟 ≠ 平台真实数据</strong>
                    ——L0~L3 是教学模型，与任何直播平台的真实算法无关。
                  </span>
                </li>
                <li>
                  <svg className={`${styles.icon} ${styles.iconSm} ${styles.trustCheck}`} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
                  </svg>
                  <span>
                    <strong>你的内容属于你</strong>
                    ——排练内容仅用于生成你自己的复盘报告，不用于训练模型，不向第三方提供。
                  </span>
                </li>
              </ol>
            </div>
          </section>

          {/* ======================= 区块8 · FAQ 手风琴 ======================= */}
          <section className={styles.section} id="faq">
            <div className={`${styles.sectionHead} ${styles.sectionHeadCenter}`} data-reveal>
              <span className={styles.eyebrow}>FAQ</span>
              <h2 className={styles.h2}>常见问题</h2>
            </div>
            <div className={styles.faqList}>
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} className={`${styles.faqItem} ${faqOpen === i ? styles.faqItemOpen : ""}`}>
                  <button
                    className={styles.faqQ}
                    aria-expanded={faqOpen === i}
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  >
                    {item.q}
                    <svg className={`${styles.icon} ${styles.iconSm} ${styles.faqIcon}`} viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                  <div
                    className={styles.faqA}
                    ref={(el) => {
                      faqAnswerRefs.current[i] = el;
                    }}
                  >
                    <p>{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ======================= 区块9 · 尾部 CTA ======================= */}
          <section className={`${styles.section} ${styles.finalCta}`} id="cta">
            <div className={styles.finalCtaInner} data-reveal>
              <h2>
                你的第一场直播，
                <br />
                值得先排练一遍
              </h2>
              <p>注册只需一个邮箱，公测期全部功能免费。</p>
              <button className={`pill pill-primary ${styles.ctaBtn}`} onClick={() => openAuth("register")}>
                免费开始排练
              </button>
            </div>
          </section>
        </div>

        {/* ======================= 页脚 ======================= */}
        <footer className={styles.footer}>
          <div className={styles.container}>
            <div className={styles.footerGrid}>
              <div className={styles.footerBrand}>
                <Link href="/" className="logo">
                  <em>Live</em>Master <span className="logo-cn">直播大师</span>
                </Link>
                <p>开播前，先来练播间。AI 虚拟观众陪你排练每一场直播。</p>
              </div>
              <div className={styles.footerCol}>
                <h4>产品</h4>
                <ul>
                  <li>
                    <Link href="/features">功能</Link>
                  </li>
                  <li>
                    <Link href="/pricing">定价</Link>
                  </li>
                  <li>
                    <Link href="/changelog">更新日志</Link>
                  </li>
                </ul>
              </div>
              <div className={styles.footerCol}>
                <h4>场景</h4>
                <ul>
                  <li>
                    <Link href="/scenarios/train">主播排练</Link>
                  </li>
                  <li>
                    <Link href="/scenarios/feynman">费曼学习</Link>
                  </li>
                </ul>
              </div>
              <div className={styles.footerCol}>
                <h4>资源</h4>
                <ul>
                  <li>
                    <Link href="/blog">博客</Link>
                  </li>
                  <li>
                    <a href="#faq">FAQ</a>
                  </li>
                </ul>
              </div>
              <div className={styles.footerCol}>
                <h4>法律</h4>
                <ul>
                  <li>
                    <a href="#">用户协议</a>
                  </li>
                  <li>
                    <a href="#">隐私政策</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className={styles.footerBottom}>
              <p className="disclaimer">
                本产品所有观众均为 AI
                虚构，弹幕、提问、礼物与热度数据均为模拟内容，不构成任何真实平台的数据或建议。
              </p>
              <p className={styles.copyright}>
                <span>© 2025 LiveMaster 直播大师</span>
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
