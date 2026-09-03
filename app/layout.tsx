import type { Metadata, Viewport } from 'next';
import './globals.css';

const publicUrl = 'https://superantichrist.github.io/roman-history-reader/';

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: '로마사 원전 읽기 — 리비우스와 폴리비오스',
  description:
    '리비우스의 라틴어, 리비우스 페리오카이, 폴리비오스의 고대 그리스어를 사료의 층위와 출전을 보존해 읽는 병렬 독서판.',
  alternates: { canonical: publicUrl },
  openGraph: {
    title: '로마사 원전 읽기',
    description: '리비우스 · 페리오카이 · 폴리비오스 원문 병렬 독서판',
    url: publicUrl,
    siteName: 'ROMA · FONTES',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: '/roman-history-reader/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '로마사 원전 읽기',
    description: '리비우스 · 페리오카이 · 폴리비오스 원문 병렬 독서판',
    images: ['/roman-history-reader/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#eee6d7',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
