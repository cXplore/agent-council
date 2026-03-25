import MeetingDemo from './components/MeetingDemo';

export default function Home() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-10">
        <h1 className="text-4xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Agent Council
        </h1>
        <p className="text-lg mt-3 max-w-xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Run structured meetings between your Claude Code agents. Watch them deliberate in real time.
        </p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
          Standups, design reviews, strategy sessions — with a live viewer in your browser.
        </p>

        <div className="flex gap-3 mt-8">
          <a
            href="/meetings"
            className="px-6 py-3 rounded-lg text-sm font-medium inline-block"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Open Meeting Viewer
          </a>
          <a
            href="/setup"
            className="px-6 py-3 rounded-lg text-sm font-medium inline-block"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Connect Project
          </a>
          <a
            href="/guide"
            className="px-6 py-3 rounded-lg text-sm font-medium inline-block"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Getting Started
          </a>
        </div>
      </div>

      {/* Live demo animation */}
      <MeetingDemo />

      {/* How it works */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold mb-6" style={{ color: 'var(--text-primary)' }}>
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              title: 'Connect',
              desc: 'Point it at your project. If you already have agents, you\'re ready. If not, it scans your codebase and generates a team for you.',
            },
            {
              title: 'Meet',
              desc: 'Ask Claude Code for a meeting in plain language. Agents deliberate in structured rounds — independent thinking first, then engaging with each other.',
            },
            {
              title: 'Watch',
              desc: 'See every agent\'s response appear live in your browser. Type into the meeting to add your own voice. Review past meetings anytime.',
            },
          ].map(card => (
            <div
              key={card.title}
              className="rounded-lg p-5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* The Meeting System */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          The meeting system
        </h2>
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p>
              Every decision-producing meeting includes three mandatory roles: <strong style={{ color: 'var(--text-primary)' }}>project-manager</strong> (what&apos;s real), <strong style={{ color: 'var(--text-primary)' }}>critic</strong> (what&apos;s wrong), and <strong style={{ color: 'var(--text-primary)' }}>north-star</strong> (what&apos;s possible). Plus domain agents relevant to the topic.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Round 1</strong> &mdash; all agents respond independently, in parallel. No anchoring, no groupthink.
            </p>
            <p>
              <strong style={{ color: 'var(--text-primary)' }}>Round 2+</strong> &mdash; agents read the full conversation and respond sequentially. They engage with each other&apos;s positions, challenge assumptions, build on ideas. The facilitator controls speaking order and stops when the conversation converges.
            </p>
            <p>
              The meeting file is the hub. Everyone reads from it, everyone writes to it. You watch it build up live in your browser.
            </p>
          </div>
        </div>
      </div>

      {/* Meeting formats */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          7 meeting formats
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { name: 'Standup', desc: 'Daily brief' },
            { name: 'Design Review', desc: 'Evaluate components' },
            { name: 'Strategy Session', desc: 'Direction & priorities' },
            { name: 'Retrospective', desc: 'What went well/messy' },
            { name: 'Architecture Review', desc: 'System design' },
            { name: 'Sprint Planning', desc: 'What to tackle next' },
            { name: 'Incident Review', desc: 'What went wrong' },
          ].map(f => (
            <div
              key={f.name}
              className="rounded-lg px-3 py-2.5"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.name}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick start */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Quick start
        </h2>
        <pre
          className="rounded-lg p-5 text-sm leading-relaxed overflow-auto"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
{`git clone https://github.com/cXplore/agent-council
cd agent-council
npm install
npm run dev

# Open localhost:3001/setup to set up your team
# Then in Claude Code, just ask for a meeting — no special commands needed`}
        </pre>
      </div>

      {/* How to run a meeting */}
      <div className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          How to run a meeting
        </h2>
        <div
          className="rounded-lg p-6"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <ol className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li><strong style={{ color: 'var(--text-primary)' }}>1.</strong> Start Agent Council: <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>npm run dev</code></li>
            <li><strong style={{ color: 'var(--text-primary)' }}>2.</strong> Open your project in Claude Code</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>3.</strong> Ask for a meeting in plain language — <em style={{ color: 'var(--text-muted)' }}>&quot;what should we work on today?&quot;</em>, <em style={{ color: 'var(--text-muted)' }}>&quot;I want a design review on the dashboard&quot;</em>, <em style={{ color: 'var(--text-muted)' }}>&quot;let&apos;s do a retro on last week&quot;</em></li>
            <li><strong style={{ color: 'var(--text-primary)' }}>4.</strong> Claude spawns the facilitator, which creates a meeting file and orchestrates the conversation</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>5.</strong> Watch it unfold live at <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>localhost:3001/meetings</code></li>
            <li><strong style={{ color: 'var(--text-primary)' }}>6.</strong> Type into the meeting from the viewer to add your own voice</li>
          </ol>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-3xl mx-auto px-6 pb-12">
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Works with Claude Code</span>
          <span>&middot;</span>
          <span>No database, no auth — pure file I/O</span>
          <span>&middot;</span>
          <span>MIT License</span>
        </div>
      </div>
    </div>
  );
}
