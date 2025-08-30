import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { Providers } from '@/app/providers/ThemeProvider';
import ThemeSwitcher from './components/ThemeSwitcher';


const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
    title: "Uni Notes",
    description: "waraidako inc.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} antialiased`}>
        <header className="flex w-full">
            <div className="justify-end m-2">
                <Providers><ThemeSwitcher /></Providers>
            </div>
        </header>
        {children}
        <footer className={"flex w-full"}>
            <div className={"justify-start items-center m-2"}>
                <a href={"https://archive.onanists.ru"} className={"align-middle"}>Прошлый семестр - переживи травмы ещё разочек</a>
            </div>
        </footer>
      </body>
    </html>
  );
}
