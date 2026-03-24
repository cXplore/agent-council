import type { Metadata } from 'next';
import MeetingViewer from './MeetingViewer';

export const metadata: Metadata = {
  title: 'Meetings — Agent Council',
  robots: 'noindex',
};

export default function MeetingsPage() {
  return <MeetingViewer />;
}
