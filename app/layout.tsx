import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from 'next-themes';
import "./globals.css";
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { StreamerModeProvider } from '@/contexts/StreamerModeContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "123impact",
  description: "Volunteer management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <StreamerModeProvider>
            <OrganizationProvider>
              {children}
            </OrganizationProvider>
          </StreamerModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

