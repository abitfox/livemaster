import TopNav from "@/components/top-nav";

/** (shell) 分组：工作台/历史/新建/设置/复盘 —— 顶部导航 + 居中内容容器 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <TopNav />
      <main className="page-body">{children}</main>
    </div>
  );
}
