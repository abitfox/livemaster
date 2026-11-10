import TopNav from "@/components/top-nav";

/** (live) 分组：直播中页 —— 全屏沉浸，无 page-body 内边距与 1120px 宽度限制 */
export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="live-shell">
      <TopNav />
      {children}
    </div>
  );
}
