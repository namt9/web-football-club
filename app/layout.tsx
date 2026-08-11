import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Đội bóng phủi",
  description: "Quản lý thành viên, quỹ và trận đấu của đội bóng phủi",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-4 border-b bg-white px-6 py-4 text-sm font-medium">
          <Link href="/">Trang chủ</Link>
          <Link href="/lich-thi-dau">Lịch thi đấu</Link>
          <Link href="/thanh-vien">Thành viên</Link>
          <Link href="/thong-ke">Thống kê</Link>
          <Link href="/quy">Quỹ</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
