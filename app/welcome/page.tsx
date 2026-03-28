import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Welcome — Agent Council',
};

function AgentCouncilLogo({ size = 48 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" width={size} height={size}>
      <rect width="32" height="32" rx="8" fill="#1a1a1e" />
      <circle cx="16" cy="10" r="3" fill="#7c6dd8" />
      <circle cx="8" cy="20" r="3" fill="#4ade80" />
      <circle cx="24" cy="20" r="3" fill="#e8a87c" />
      <line x1="16" y1="13" x2="8" y2="17" stroke="#3a3a40" strokeWidth="1.5" />
      <line x1="16" y1="13" x2="24" y2="17" stroke="#3a3a40" strokeWidth="1.5" />
      <line x1="8" y1="23" x2="24" y2="23" stroke="#3a3a40" strokeWidth="1.5" />
    </svg>
  );
}

const steps = [
  {
    number: '1',
    title: 'Connect your project',
    description: 'Point Agent Council at your codebase. It scans your stack and generates a team of specialized agents.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Ask for a meeting',
    description: 'Tell Claude Code what you want to discuss. "Review the API design." "Plan the next sprint." Just plain language.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Watch agents deliberate',
    description: 'Agents discuss, challenge, and build on each other\'s ideas in real time. You can join the conversation between rounds.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

const valueProps = [
  {
    title: 'Multi-perspective decisions',
    description: 'Every meeting includes a mandatory critic who challenges assumptions. No comfortable consensus. No groupthink.',
    color: '#e8a87c',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    title: 'Tracked outcomes',
    description: 'Decisions, action items, and open questions are tagged inline and tracked across meetings. Nothing falls through the cracks.',
    color: '#4ade80',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    title: 'MCP integration',
    description: 'Claude picks up where meetings left off. Decisions and action items feed back into your Claude Code sessions automatically.',
    color: '#7c6dd8',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="text-center mb-20">
          <div className="flex justify-center mb-6">
            <div
              className="rounded-2xl p-4"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <AgentCouncilLogo size={56} />
            </div>
          </div>
          <h1
            className="text-3xl font-bold mb-3 tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Agent Council
          </h1>
          <p
            className="text-base leading-relaxed max-w-xl mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Run structured meetings between your Claude Code agents.
            Watch them deliberate in real time.
          </p>
        </div>

        {/* How it works */}
        <section className="mb-20">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-6 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            How it works
          </h2>
          <div className="space-y-4">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-lg p-5 flex gap-5 items-start"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div className="flex-shrink-0 flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {step.number}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {step.icon}
                  </span>
                </div>
                <div>
                  <h3
                    className="text-sm font-semibold mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What you get */}
        <section className="mb-20">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-6 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            What you get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {valueProps.map((prop) => (
              <div
                key={prop.title}
                className="rounded-lg p-5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{
                    background: `${prop.color}15`,
                    color: prop.color,
                  }}
                >
                  {prop.icon}
                </div>
                <h3
                  className="text-sm font-semibold mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {prop.title}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            Get started
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
          <p className="mt-4">
            <Link
              href="/setup"
              className="text-xs underline"
              style={{ color: 'var(--text-muted)' }}
            >
              I already have a project set up
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
