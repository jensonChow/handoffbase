import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memory Vault Dashboard",
  description: "Governance dashboard for handoffbase memories"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
