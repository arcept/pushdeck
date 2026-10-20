import type { Metadata } from "next";
import "./globals.css";

const title = "Push Deck — Your Push 2, your desk, your rules.";
const description = "Use an Ableton Push 2 on its own (no Ableton Live) as a customisable controller and ambient display for your Mac.";

export const metadata: Metadata = {
  metadataBase: new URL("https://pushdeck.arcept.in"),
  title,
  description,
  openGraph: {
    type: "website", url: "/", siteName: "Push Deck", title, description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Push Deck: an Ableton Push 2 with lit pads and a live display, and the line Your Push 2, your desk, your rules." }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
