"use client";

import { useState } from "react";
import type {
  Confidence,
  EvidenceItem,
  Finding,
  GtmReportEnvelope,
} from "../lib/engine/evidence";
import type { GtmTeardown } from "../lib/engine/teardown";
import { renderTeardownMarkdown } from "../lib/engine/report";

export function ConfBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`badge ${confidence}`}>{confidence}</span>;
}

export function EvidenceList({
  evidence,
}: {
  evidence: readonly EvidenceItem[];
}) {
  if (evidence.length === 0) {
    return <p className="evidence">No direct evidence recorded.</p>;
  }
  return (
    <ul className="evidence">
      {evidence.map((e, i) => (
        <li key={i}>
          <span className="etype">{e.type}</span>
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.url}
            </a>
          ) : (
            <span>(site copy)</span>
          )}
          {e.snippet ? (
            <span className="snippet"> &ldquo;{e.snippet}&rdquo;</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SectionHead({ title }: { title: string }) {
  return <h3>{title}</h3>;
}

function FindingHeader<T>({ finding }: { finding: Finding<T> }) {
  return (
    <p className="claim">
      {finding.claim}
      <ConfBadge confidence={finding.confidence} />
    </p>
  );
}

export default function TeardownReport({
  teardown,
  generatedAt,
}: {
  teardown: GtmTeardown;
  generatedAt: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyMarkdown = async () => {
    const envelope: GtmReportEnvelope<GtmTeardown> = {
      findings: teardown,
      limitations: teardown.limitations,
      generated_at: generatedAt,
    };
    try {
      await navigator.clipboard.writeText(renderTeardownMarkdown(envelope));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const p = teardown.positioning;
  const pr = teardown.pricing;

  return (
    <div className="report">
      <div className="report-head">
        <div>
          <h2>
            {teardown.company}{" "}
            <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 18 }}>
              {teardown.domain}
            </span>
          </h2>
          <p className="report-meta">
            Depth: {teardown.depth} · Generated{" "}
            {new Date(generatedAt).toLocaleString()}
          </p>
        </div>
        <button className="btn-ghost" onClick={copyMarkdown}>
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
      </div>

      <div className="stat-cards">
        <div className="stat">
          <div className="k">Headline</div>
          <div className="v" style={{ fontSize: 16, lineHeight: 1.4 }}>
            {p.data.headline || "Not found"}
          </div>
        </div>
        <div className="stat">
          <div className="k">Plans</div>
          <div className="v">{pr.data.plans.length}</div>
        </div>
        <div className="stat">
          <div className="k">Channels</div>
          <div className="v">{teardown.channels.length}</div>
        </div>
        <div className="stat">
          <div className="k">Loops</div>
          <div className="v">{teardown.loops.length}</div>
        </div>
      </div>

      <div className="sec">
        <SectionHead title="Positioning" />
        <FindingHeader finding={p} />
        <dl className="kv">
          <dt>Headline</dt>
          <dd>{p.data.headline || "None found"}</dd>
          <dt>Subhead</dt>
          <dd>{p.data.subhead || "None found"}</dd>
          <dt>Category claim</dt>
          <dd>{p.data.categoryClaim ?? "None detected"}</dd>
          <dt>Audience signals</dt>
          <dd>{p.data.audienceSignals.join(", ") || "None detected"}</dd>
          <dt>Social proof</dt>
          <dd>{p.data.socialProof.join(", ") || "None detected"}</dd>
        </dl>
        <EvidenceList evidence={p.evidence} />
      </div>

      <div className="sec">
        <SectionHead title="Pricing" />
        <FindingHeader finding={pr} />
        <div style={{ margin: "10px 0" }}>
          <span className={`pill ${pr.data.hasFreeTrial ? "on" : ""}`}>
            Free trial: {pr.data.hasFreeTrial ? "yes" : "not found"}
          </span>
          <span className={`pill ${pr.data.hasFreemium ? "on" : ""}`}>
            Freemium: {pr.data.hasFreemium ? "yes" : "not found"}
          </span>
          <span className="pill">Billing: {pr.data.billingModel}</span>
        </div>
        {pr.data.plans.length > 0 ? (
          <div className="plan-cards">
            {pr.data.plans.map((plan, i) => (
              <div className="plan" key={i}>
                <h4>{plan.planName}</h4>
                <div className="price">
                  {plan.monthly !== null
                    ? `${plan.currency}${plan.monthly}`
                    : "Not in copy"}
                </div>
                <div className="per">
                  {plan.monthly !== null
                    ? "/month" +
                      (plan.annualMonthly !== null
                        ? `, ${plan.currency}${plan.annualMonthly} billed annually`
                        : "")
                    : "price could not be linked to this plan"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            No plans detected on the pricing page.
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <EvidenceList evidence={pr.evidence} />
        </div>
      </div>

      <div className="sec">
        <SectionHead title="Channels" />
        {teardown.channels.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            No channel signals detected.
          </p>
        ) : (
          <table className="channels">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Signal</th>
                <th>Confidence</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {teardown.channels.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{c.data.channel}</td>
                  <td>{c.data.signal}</td>
                  <td>
                    <ConfBadge confidence={c.confidence} />
                  </td>
                  <td>
                    <EvidenceList evidence={c.evidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="sec">
        <SectionHead title="Acquisition loops" />
        {teardown.loops.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            {teardown.depth === "quick"
              ? "Loops are only checked at full depth."
              : "No acquisition loops detected."}
          </p>
        ) : (
          <div className="card-grid">
            {teardown.loops.map((l, i) => (
              <div className="card" key={i}>
                <h3>
                  {l.data.loop}
                  <ConfBadge confidence={l.confidence} />
                </h3>
                <p>{l.data.description}</p>
                <EvidenceList evidence={l.evidence} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sec">
        <SectionHead title="What we could not verify" />
        <div className="limitations">
          {teardown.limitations.length === 0 ? (
            <p style={{ margin: 0 }}>No recorded limitations.</p>
          ) : (
            <ul>
              {teardown.limitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
