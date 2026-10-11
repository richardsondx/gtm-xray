"use client";

import { useRef, useState } from "react";
import TeardownReport from "../components/TeardownReport";
import type { GtmTeardown } from "../lib/engine/teardown";
import type { TeardownDepth } from "../lib/engine/teardown";

type StageKey = "positioning" | "pricing" | "channels" | "loops";

const STAGE_LABELS: Record<StageKey, string> = {
  positioning: "Reading the homepage and positioning",
  pricing: "Reading the pricing page",
  channels: "Mapping distribution channels",
  loops: "Finding acquisition loops",
};

export default function Home() {
  const [domain, setDomain] = useState("");
  const [depth, setDepth] = useState<TeardownDepth>("quick");
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState<Record<StageKey, "idle" | "active" | "done">>({
    positioning: "idle",
    pricing: "idle",
    channels: "idle",
    loops: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ teardown: GtmTeardown; generatedAt: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const d = domain.trim();
    if (!d || running) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRunning(true);
    setError(null);
    setResult(null);
    setStages({ positioning: "idle", pricing: "idle", channels: "idle", loops: "idle" });

    try {
      const res = await fetch("/api/teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d, depth }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Request failed (${res.status}).`);
      }
      if (!res.body) throw new Error("No response stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const activeStages: StageKey[] = depth === "full"
        ? ["positioning", "pricing", "channels", "loops"]
        : ["positioning", "pricing", "channels"];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const msg = JSON.parse(line.slice(5));
          if (msg.error) throw new Error(msg.error);
          if (msg.stage) {
            const key = msg.stage as StageKey;
            setStages((s) => ({ ...s, [key]: "active" }));
            // positioning and pricing run together; mark both active at once
            if (key === "positioning" || key === "pricing") {
              setStages((s) => ({ ...s, positioning: "active", pricing: "active" }));
            }
          }
          if (msg.done) {
            setResult({ teardown: msg.teardown, generatedAt: msg.generated_at });
            setStages((s) => {
              const next = { ...s };
              for (const k of activeStages) next[k] = "done";
              return next;
            });
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setRunning(false);
    }
  };

  const visibleStages: StageKey[] =
    depth === "full"
      ? ["positioning", "pricing", "channels", "loops"]
      : ["positioning", "pricing", "channels"];

  return (
    <main>
      <div className="wrap">
        <section className="hero">
          <h1>See how any startup gets customers.</h1>
          <p className="sub">
            Type a domain. gtm-xray reads the site the way a competitor would:
            positioning, pricing, distribution channels, acquisition loops.
            Every claim ships with its sources and a confidence level.
          </p>
          <div className="runner">
            <div className="runner-row">
              <input
                type="text"
                placeholder="cal.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                disabled={running}
                aria-label="Startup domain"
              />
              <button className="btn" onClick={run} disabled={running || !domain.trim()}>
                {running ? "Running" : "Run teardown"}
              </button>
            </div>
            <div className="depth-toggle">
              {(["quick", "full"] as TeardownDepth[]).map((d) => (
                <button
                  key={d}
                  className={depth === d ? "active" : ""}
                  onClick={() => setDepth(d)}
                  disabled={running}
                >
                  {d === "quick" ? "Quick" : "Full"}
                </button>
              ))}
            </div>
            <p className="depth-note">
              {depth === "quick"
                ? "Quick reads the homepage, pricing, and channel signals. About 20 seconds."
                : "Full adds acquisition loops and deeper content mapping. About a minute."}
            </p>
            {(running || result) && (
              <ul className="stages">
                {visibleStages.map((k) => (
                  <li key={k} className={stages[k] === "active" ? "active" : stages[k] === "done" ? "done" : ""}>
                    <span className="dot">{stages[k] === "done" ? "✓" : ""}</span>
                    {STAGE_LABELS[k]}
                  </li>
                ))}
              </ul>
            )}
            {error && <div className="error">{error}</div>}
          </div>
        </section>

        {result && (
          <TeardownReport teardown={result.teardown} generatedAt={result.generatedAt} />
        )}

        <section className="block">
          <h2>How it works</h2>
          <p className="lead">
            No accounts, no scraping services, no black box. The engine fetches
            public pages and reads what is actually there.
          </p>
          <div className="steps">
            <div className="step">
              <div className="n">Step 1</div>
              <h3>Enter a domain</h3>
              <p>Pick any startup. The engine loads the homepage, the pricing page, the sitemap, and the pages that reveal distribution: docs, blog, integrations, affiliate programs.</p>
            </div>
            <div className="step">
              <div className="n">Step 2</div>
              <h3>Watch it read</h3>
              <p>Each section runs live and shows its work. Headlines, plan prices, channel signals, and growth loops are extracted from the fetched HTML, not guessed.</p>
            </div>
            <div className="step">
              <div className="n">Step 3</div>
              <h3>Steal the playbook</h3>
              <p>Copy the teardown as Markdown, feed it to the distribution planner, and rank which channels to bet on for your own startup, with the evidence attached.</p>
            </div>
          </div>
        </section>

        <section className="block">
          <h2>Evidence discipline</h2>
          <p className="lead">
            Most GTM advice is vibes. gtm-xray treats every finding like a lab
            result: a claim, a confidence level, the exact pages behind it, and
            an explicit list of what could not be verified.
          </p>
          <div className="card-grid">
            <div className="card">
              <h3>Confidence on every claim</h3>
              <p>High, medium, or low. A price read from rendered copy is high. A plan with no linked price is flagged, not invented.</p>
            </div>
            <div className="card">
              <h3>Sources attached</h3>
              <p>Every finding links the pages it came from, with the snippet that supported it. Check the work yourself.</p>
            </div>
            <div className="card">
              <h3>Honest gaps</h3>
              <p>Paid ads and review-site presence cannot be read from a sitemap. The report lists what it could not verify and how to check it manually.</p>
            </div>
          </div>
        </section>

        <section className="block">
          <h2>Use it from your terminal or agent</h2>
          <p className="lead">
            The same engine runs as a CLI and an MCP server, so your coding
            agent can tear down competitors inside its own workflow.
          </p>
          <pre className="code">
            <span className="c"># install the CLI and register it with your agent</span>{"\n"}
            npx gtm-xray setup{"\n\n"}
            <span className="c"># tear down a competitor from the terminal</span>{"\n"}
            gtmx teardown cal.com --depth full
          </pre>
          <p style={{ marginTop: 16 }}>
            <a href="/sample">Read a sample teardown</a>
            {" · "}
            <a href="https://github.com/richardsondx/gtm-xray">Source on GitHub</a>
          </p>
        </section>
      </div>
    </main>
  );
}
