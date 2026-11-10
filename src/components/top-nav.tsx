"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

interface UserState {
  email: string;
  nickname: string;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Avatar({ seed, size }: { seed: string; size: 24 | 28 | 32 | 48 | 56 }) {
  const g = `g${(hashCode(seed) % 6) + 1}`;
  const ch = (seed[0] ?? "L").toUpperCase();
  return (
    <span className={`avatar avatar-${size} ${g}`}>{ch}</span>
  );
}

const SITE_MENU = [
  { href: "/features", label: "功能" },
  { href: "/scenarios/train", label: "主播排练" },
  { href: "/scenarios/feynman", label: "费曼学习" },
  { href: "/pricing", label: "定价" },
  { href: "/changelog", label: "更新日志" },
];

const APP_MENU = [
  { href: "/app", label: "工作台" },
  { href: "/app/history", label: "历史场次" },
  { href: "/app/settings", label: "账号设置" },
];

/** 全站顶部导航：未登录（登录/免费开始排练）与已登录（工作台/头像下拉）双态 */
export default function TopNav() {
  const { openAuth, logout } = useAuth();
  const [user, setUser] = useState<UserState | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return; // 未配置 Supabase：按未登录处理
    const sync = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(
        data.user?.email
          ? { email: data.user.email, nickname: data.user.email.split("@")[0] }
          : null,
      );
    };
    sync();
    const { data: sub } = supabase.auth.onAuthStateChange(sync);
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    const onClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", onClick);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    router.push("/");
  }

  const isApp = pathname.startsWith("/app");
  const menuItems = isApp ? APP_MENU : SITE_MENU;

  return (
    <header className={`topnav site-topnav ${scrolled ? "scrolled" : ""}`}>
      <Link href="/" className="logo">
        <em>Live</em>Master <span className="logo-cn">直播大师</span>
      </Link>

      <nav className="nav-menu">
        {menuItems.map((m) => (
          <Link key={m.href} href={m.href} className={`nav-link ${pathname === m.href ? "active" : ""}`}>
            {m.label}
          </Link>
        ))}
      </nav>

      <div className="nav-right">
        {!user ? (
          <>
            <button className="pill pill-ghost pill-compact" onClick={() => openAuth("login")}>登录</button>
            <button className="pill pill-primary pill-compact" onClick={() => openAuth("register")}>免费开始排练</button>
          </>
        ) : (
          <>
            <Link href="/app/new" className="pill pill-primary pill-compact">
              {isApp ? "+ 新建排练" : "进入工作台"}
            </Link>
            <div className={`nav-user ${menuOpen ? "open" : ""}`} ref={dropRef}>
              <button onClick={() => setMenuOpen((v) => !v)} aria-label="用户菜单">
                <Avatar seed={user.email} size={32} />
                <svg className="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              <div className="dropdown">
                <div className="dropdown-email">{user.email}</div>
                <Link href="/app/history" onClick={() => setMenuOpen(false)}>我的排练</Link>
                <Link href="/app/settings" onClick={() => setMenuOpen(false)}>账号设置</Link>
                <hr />
                <button className="danger-item" onClick={handleLogout}>退出登录</button>
              </div>
            </div>
          </>
        )}
        <button className="hamburger" aria-label="菜单" onClick={() => setDrawerOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>

      {drawerOpen && (
        <div className="nav-drawer" onClick={() => setDrawerOpen(false)}>
          <div className="nav-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="nav-drawer-head">
              <span className="logo"><em>Live</em>Master</span>
              <button aria-label="关闭" onClick={() => setDrawerOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {menuItems.map((m) => (
              <Link key={m.href} href={m.href} className="drawer-item" onClick={() => setDrawerOpen(false)}>
                {m.label}
              </Link>
            ))}
            <div className="drawer-actions">
              {!user ? (
                <>
                  <button className="pill pill-secondary drawer-btn" onClick={() => { setDrawerOpen(false); openAuth("login"); }}>登录</button>
                  <button className="pill pill-primary drawer-btn" onClick={() => { setDrawerOpen(false); openAuth("register"); }}>免费开始排练</button>
                </>
              ) : (
                <>
                  <Link href="/app/new" className="pill pill-primary drawer-btn" onClick={() => setDrawerOpen(false)}>新建排练</Link>
                  <button className="pill pill-ghost drawer-btn" onClick={handleLogout}>退出登录</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
