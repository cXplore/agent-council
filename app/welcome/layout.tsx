import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome — Agent Council',
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
