import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Big Bang Theory Search",
  description: "Search bilingual subtitle clips for The Big Bang Theory."
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
