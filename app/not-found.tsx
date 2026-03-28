import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="text-center max-w-md px-6">
        <div
          className="text-6xl font-bold mb-4"
          style={{ color: 'var(--accent)', opacity: 0.3 }}
        >
          404
        </div>
        <h1
          className="text-xl font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Page not found
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/meetings"
            className="px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Go to Meetings
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Dashboard
          </Link>
        </div>
        <p
          className="text-xs mt-8"
          style={{ color: 'var(--text-muted)', opacity: 0.5 }}
        >
          Press <kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>Ctrl+K</kbd> to search
        </p>
      </div>
    </div>
  );
}
