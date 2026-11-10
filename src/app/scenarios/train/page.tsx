import TopNav from "@/components/top-nav";

export default function Page() {
  return (
    <>
      <TopNav />
      <main className="page-body">
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: "48px 0 12px" }}>主播排练</h1>
        <p style={{ color: "var(--text-secondary)" }}>本页面在 V0.2 版本上线。现在即可进入工作台开一场排练。</p>
      </main>
    </>
  );
}
