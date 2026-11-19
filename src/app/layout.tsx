import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Suspense } from "react";
import { Sidebar, SidebarNav } from "@/components/Sidebar";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Personal Design Intelligence",
  description: "Discover, collect and reuse the details that make great websites.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable} antialiased`}>
      <body className="min-h-dvh font-sans md:flex">
        <Suspense fallback={<SidebarNav path="" />}>
          <Sidebar />
        </Suspense>
        <main className="min-w-0 flex-1 px-4 py-8 md:px-12 md:py-14">{children}</main>
      </body>
    </html>
  );
}
