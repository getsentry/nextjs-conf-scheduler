import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const rubik = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/Rubik-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Rubik-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/Rubik-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Rubik-MediumItalic.ttf", weight: "500", style: "italic" },
  ],
});

const dammitSans = localFont({
  variable: "--font-heading",
  src: "./fonts/dammitsansv0.2-bold.otf",
  weight: "700",
});

export const metadata: Metadata = {
  title: "AI Engineer World's Fair 2026",
  description: "Build your personalized AI Engineer World's Fair schedule",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${rubik.variable} ${dammitSans.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster closeButton richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
