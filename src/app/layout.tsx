import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "LiveMaster 直播大师 - 开播前，先来练播间",
  description:
    "AI 虚拟观众陪你排练每一场直播：弹幕、提问、冷场、礼物、流量推送，全部真实上演。播后热度复盘，告诉你在哪一秒丢了观众。",
};

export const viewport: Viewport = {
  themeColor: "#0B0E14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
