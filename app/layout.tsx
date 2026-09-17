import SessionButton from './session-button';
import LanguageSelector from './ui-language';
import GuestChat from './guest-chat';
import AutoRefresh from './auto-refresh';
import {tabBootstrap} from './tab-bootstrap';
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nirili Villa Management",
  description: "Hotel operations, guest bookings, transfers and excursions for Nirili Villa in Dhiffushi, Maldives.",
  icons: {
    icon: "/favicon-new.svg",
    shortcut: "/favicon-new.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><script dangerouslySetInnerHTML={{__html:tabBootstrap}}/><AutoRefresh/>{children}<GuestChat/><LanguageSelector/><SessionButton/></body>
    </html>
  );
}
