import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HandoffBase Memory Vault",
  description: "Governance dashboard for HandoffBase memories"
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
