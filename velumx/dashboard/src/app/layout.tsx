import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VelumX Developer Console",
  description: "Manage your modular Stacks Gas Abstraction integrations",
  other: {
    "talentapp:project_verification": "d21212d94aeabdeb188f36ea3cd442602a50aa581677ad2a0e505636006fb9d5f14151bf86e1d4febbcfa688e806453ceee2b7d12855a36d97cbd1339fd054d2"
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
