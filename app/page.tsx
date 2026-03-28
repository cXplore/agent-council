import { redirect } from 'next/navigation';
import { getConfig } from '@/lib/config';

export default async function Home() {
  try {
    const config = await getConfig();
    const hasProjects = Object.keys(config.projects).length > 0;
    if (!hasProjects && config.activeProject === 'workspace') {
      redirect('/setup');
    }
  } catch {
    // Fall through to meetings
  }
  redirect('/meetings');
}
