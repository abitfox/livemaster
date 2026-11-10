import TopNav from "@/components/top-nav";

export default function Page() {
  return (
    <>
      <TopNav />
      <main className="page-body">
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "48px 0 12px" }}>定价</h1>
        <p style={{ color: "var(--text-secondary)" }}>本页面在 V0.2 版本上线，敬请期待。</p>
      </main>
    </>
  );
}
