import SessionButton from './session-button';
import GuestChat from './guest-chat';
import AutoRefresh from './auto-refresh';
import {tabBootstrap} from './tab-bootstrap';
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./excursion-cancel.css";
import "./excursion-timetable.css";
import "./guest-excursion-cleanup.css";
import "./admin-responsive.css";
import "./buggy-management.css";
import "./channel-manager.css";

// Use the actual device width without disabling pinch-to-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Nirili Villa Management",
  description: "Hotel operations, guest bookings, transfers and excursions for Nirili Villa in Dhiffushi, Maldives.",
  manifest: "/manifest.webmanifest",
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
    <html lang="en-GB">
      <body className="antialiased"><script dangerouslySetInnerHTML={{__html:tabBootstrap}}/><AutoRefresh/>{children}<GuestChat/><SessionButton/></body>
    </html>
  );
}
