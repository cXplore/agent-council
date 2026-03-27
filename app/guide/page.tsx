import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Getting Started — Agent Council',
};

export default function GuidePage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Getting Started
        </h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-muted)' }}>
          From zero to your first agent meeting in 5 minutes.
        </p>

        {/* Prerequisites */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Prerequisites
          </h2>
          <div
            className="rounded-lg p-5 text-sm space-y-2"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>You need <strong style={{ color: 'var(--text-primary)' }}>Claude Code</strong> — either the Desktop app or the CLI. Both work the same way with Agent Council.</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Desktop App</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Download from <strong>claude.ai/download</strong>. Open your project folder through the app.</p>
              </div>
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>CLI</p>
                <pre className="text-xs" style={{ color: 'var(--text-muted)' }}>npm install -g @anthropic-ai/claude-code</pre>
              </div>
            </div>
            <p className="mt-2">You also need a project to work on. It can be any codebase — Agent Council will detect your stack and suggest agents.</p>
          </div>
        </section>

        {/* Step 1 */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >1</span>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Set up your agent team
            </h2>
          </div>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>Go to <a href="/setup" className="underline" style={{ color: 'var(--accent)' }}>/setup</a>. You&apos;ll see two options:</p>
            <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--text-muted)' }}>
              <li><strong style={{ color: 'var(--text-primary)' }}>Connect an existing project</strong> (recommended) — point at your project directory. If you already have agents in <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>.claude/agents/</code>, you&apos;re done.</li>
              <li><strong style={{ color: 'var(--text-primary)' }}>Scan and generate agents</strong> — Agent Council scans your codebase (languages, frameworks, structure) and suggests a team. You can customize, then click Generate.</li>
            </ul>
            <p>Either way, agent files live in your project&apos;s <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>.claude/agents/*.md</code>. Claude Code detects them automatically.</p>
          </div>
        </section>

        {/* Step 2 */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >2</span>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Open your project in Claude Code
            </h2>
          </div>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Desktop App</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Open Claude Code and select your project folder. It will detect the agents automatically.</p>
              </div>
              <div className="rounded px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>CLI</p>
                <pre className="text-xs" style={{ color: 'var(--text-muted)' }}>{`cd /path/to/your/project
claude`}</pre>
              </div>
            </div>
            <p>Either way, Claude Code automatically sees the agent files in <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>.claude/agents/</code>. No extra configuration needed.</p>
          </div>
        </section>

        {/* Step 3 */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >3</span>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Start a meeting
            </h2>
          </div>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>In Claude Code, just ask for a meeting in plain language. No special commands needed — the facilitator agent understands what you mean:</p>
            <div className="space-y-2">
              {[
                { cmd: "what should we work on today?", desc: 'Standup — daily brief, what matters today' },
                { cmd: "I want to discuss our API architecture", desc: 'Strategy session on a topic' },
                { cmd: "can we review the login flow design?", desc: 'Design review on a component' },
                { cmd: "let's do a retro on last week", desc: 'Review what went well and what didn\'t' },
              ].map(ex => (
                <div key={ex.cmd} className="flex gap-3 items-start">
                  <span
                    className="px-2 py-1 rounded text-xs flex-shrink-0 italic"
                    style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}
                  >&quot;{ex.cmd}&quot;</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{ex.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-3">Claude spawns the <strong style={{ color: 'var(--text-primary)' }}>facilitator</strong> agent, which picks the right meeting format, selects participants, runs rounds, and writes everything to a meeting file.</p>
          </div>
        </section>

        {/* Step 4 */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--accent)', color: 'white' }}
            >4</span>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Watch it live
            </h2>
          </div>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>Keep Agent Council running and open <a href="/meetings" className="underline" style={{ color: 'var(--accent)' }}>/meetings</a> in your browser. You&apos;ll see:</p>
            <ul className="list-disc list-inside space-y-1" style={{ color: 'var(--text-muted)' }}>
              <li>Agent messages appearing one by one as they&apos;re written</li>
              <li>Each agent&apos;s name in a unique color</li>
              <li>Round markers showing when the conversation shifts</li>
              <li>A chat input at the bottom — type to add your voice to the meeting</li>
            </ul>
            <p>The page polls every 2 seconds. When the meeting completes, it stops polling and shows the full transcript with summary.</p>
          </div>
        </section>

        {/* How meetings work */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            How meetings work under the hood
          </h2>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p><strong style={{ color: 'var(--text-primary)' }}>The hub model:</strong> the meeting file is the shared conversation. All agents read from it and write to it. No hidden state.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Round 1 (parallel):</strong> all agents respond independently. They don&apos;t see each other&apos;s responses. This prevents anchoring and groupthink.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Round 2+ (sequential):</strong> agents read the full conversation and respond one at a time. They can agree, challenge, build on, or redirect what others said. The facilitator controls speaking order — PM first (grounding), specialists in the middle, critic second-to-last (stress-testing), north-star last (expanding the frame).</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Mandatory triad:</strong> every decision-producing meeting includes project-manager (what&apos;s real), critic (what&apos;s wrong), and north-star (what&apos;s possible). This ensures meetings don&apos;t converge on comfortable consensus.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>When it stops:</strong> default 3 rounds. The facilitator extends to 4-5 if the conversation is genuinely producing new substance. If agents start repeating each other, it stops immediately.</p>
          </div>
        </section>

        {/* MCP Integration */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Live updates with MCP (optional)
          </h2>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p>Agent Council includes an MCP server that gives the facilitator two-way communication with the viewer. With MCP enabled, you see live progress (&quot;architect is thinking...&quot;) and can send input that agents respond to between rounds.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Setup:</strong> Add the MCP server to your Claude config. See the <a href="https://github.com/cXplore/agent-council#mcp-integration" className="underline" style={{ color: 'var(--accent)' }}>README</a> for the exact config.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>For existing facilitators:</strong> If your facilitator predates MCP support, add this section to the end of your <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>facilitator.md</code>:</p>
            <pre className="text-xs p-3 rounded overflow-auto" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>{`## Agent Council Integration (Optional)

If the agent-council MCP tools are available:
- Before starting, call council_status to check if the viewer is running
- After creating the hub file, call council_notify(meeting_starting)
- Before each round, call council_notify(round_starting)
- Before each agent, call council_notify(agent_speaking)
- Between rounds, call council_check_input for human input
- After summary, call council_notify(meeting_complete)

All council_notify calls need the meeting filename as "meeting" param.
If any call fails, continue normally — meetings work without MCP.`}</pre>
          </div>
        </section>

        {/* Tips */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Tips
          </h2>
          <div
            className="rounded-lg p-5 text-sm space-y-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <p><strong style={{ color: 'var(--text-primary)' }}>Be specific with your topic.</strong> &quot;Strategy session on authentication&quot; produces better results than &quot;let&apos;s talk about the app.&quot;</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Use the chat input.</strong> During a live meeting, type your thoughts into the viewer. Agents will see your message in the next round.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Agent Council runs separately.</strong> Keep this app running in one terminal while using Claude Code (Desktop or CLI) on your project. They communicate through the meeting file on disk.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Edit your agents.</strong> The generated templates are starting points. Edit <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>.claude/agents/*.md</code> files directly to tune personalities, add project-specific knowledge, or change behavior.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Inline tagging.</strong> Agents tag key points with <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: '#60a5fa' }}>DECISION:</code> <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: '#fbbf24' }}>OPEN:</code> <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--bg)', color: '#4ade80' }}>ACTION:</code> prefixes. The viewer renders these as colored pills so decisions and open questions are easy to scan.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
