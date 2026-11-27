import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Sidebar, SidebarNav } from "@/components/Sidebar";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Plax", template: "%s · Plax" },
  description: "Select what you like on any website, understand how it's built, and reuse it.",
};

// Applies the theme chosen in Settings before the page paints, so it never flashes the wrong colours.
const THEME = `try{var t=localStorage.getItem("plax-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="min-h-dvh font-sans md:flex">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Suspense fallback={<SidebarNav path="" />}>
          <Sidebar />
        </Suspense>
        <main id="main" className="min-w-0 flex-1 px-4 py-8 md:px-12 md:py-12">
          {children}
        </main>
      </body>
    </html>
  );
}
