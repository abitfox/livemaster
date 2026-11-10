/** (live) 分组：直播中页 —— 全屏沉浸，仅保留页面自身的 48px 状态条，不放站点导航 */
export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return <div className="live-shell">{children}</div>;
}
