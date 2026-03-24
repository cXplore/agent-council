import type { Metadata } from 'next';
import SetupWizard from './SetupWizard';

export const metadata: Metadata = {
  title: 'Setup — Agent Council',
};

export default function SetupPage() {
  return <SetupWizard />;
}
