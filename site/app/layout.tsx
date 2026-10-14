import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Push Deck — Your Push 2, your desk, your rules.",
  description: "Use an Ableton Push 2 on its own (no Ableton Live) as a customisable controller and ambient display for your Mac.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
