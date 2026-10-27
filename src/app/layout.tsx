// import type { Metadata } from "next";
import "./globals.css";
// export const metadata: Metadata = {
//   title: "StudyFlow — A little company. A lot of focus.",
//   description:
//     "Your quiet corner of the internet. Start a study livestream and invite your people.",
// };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
