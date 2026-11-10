import TopNav from "@/components/top-nav";

/** /app 工作台布局：顶部导航 + 内容容器 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <TopNav />
      <main className="page-body">{children}</main>
    </div>
  );
}
