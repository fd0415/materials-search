import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "嘴替梗图助手",
  description: "说说你的处境，帮你从《生活大爆炸》里挑梗、配文，生成可直接发的表情包。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
