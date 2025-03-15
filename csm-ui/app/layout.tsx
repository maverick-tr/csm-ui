import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CSM UI - AI Text-to-Speech Interface",
  description: "A beautiful interface for the CSM AI text-to-speech model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <footer className="py-4 px-8 text-center text-sm text-white/50 mt-auto">
            <p>
              By <a href="https://github.com/maverick-tr" className="underline hover:text-white" target="_blank" rel="noopener noreferrer">maverick-tr</a> |
              Powered by <a href="https://github.com/SesameAILabs/csm" className="underline hover:text-white" target="_blank" rel="noopener noreferrer">SesameAILabs/CSM</a>              
            </p>
          </footer>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
