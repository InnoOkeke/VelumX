import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://dashboard.velumx.xyz'),
  title: "VelumX Developer Console",
  description: "Manage your modular Stacks Gas Abstraction integrations",
  icons: {
    icon: "/velumx-logo.svg",
  },
  other: {
    "talentapp:project_verification": "2b263e85119495a047aec439e752251c6e186bb2f9d6fb57cd65c9880bcb99cc33ea0f63d85cc30d1f36bea175232d0110e575d5613a0ee4eb1d3f459aa30cab"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
