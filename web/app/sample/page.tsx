import TeardownReport from "../../components/TeardownReport";
import type { GtmReportEnvelope } from "../../lib/engine/evidence";
import type { GtmTeardown } from "../../lib/engine/teardown";
import sample from "../../data/sample-teardown.json";

export const metadata = {
  title: "Sample teardown: cal.com | gtm-xray",
  description:
    "A real gtm-xray teardown of cal.com: positioning, pricing, distribution channels, and acquisition loops, each with sources and confidence levels.",
};

export default function SamplePage() {
  const envelope = sample as unknown as GtmReportEnvelope<GtmTeardown>;
  return (
    <main>
      <div className="wrap">
        <section className="block" style={{ paddingBottom: 0 }}>
          <h2>Sample teardown: cal.com</h2>
          <p className="lead">
            This is real output from the engine, generated at full depth. It
            found cal.com&apos;s content engine, affiliate program, integration
            marketplace, open-source loop, and its agent surface, each with the
            pages behind the claim.{" "}
            <a href="/">Run your own</a>.
          </p>
        </section>
        <TeardownReport
          teardown={envelope.findings}
          generatedAt={envelope.generated_at}
        />
      </div>
    </main>
  );
}
