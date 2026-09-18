import { ConnectionTest } from "@/components/settings/connection-test";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { DEFAULT_HISTORY_WINDOW } from "@/lib/jev/build-state";
import { DEFAULT_MODEL, hasApiKey } from "@/lib/jev/client";
import { NOUL_QUESTIONS, PHASE_CRITERIA } from "@/lib/jev/questions";
import { Disclosure, JsonBlock } from "@/components/ui/disclosure";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Both read on the server. The key's value never crosses to the client — only
  // the boolean "is one configured".
  const configured = hasApiKey();

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Settings"
        description="Evaluator configuration and the exact questions JevScope asks."
      />

      <div className="flex-1 space-y-3 overflow-auto px-6 py-5">
        <section className="panel p-4">
          <h2 className="text-[13px] font-medium">TypeSafe status</h2>

          <dl className="mt-3 space-y-2.5">
            <div className="flex items-center gap-3">
              <dt className="num w-[168px] shrink-0 text-[12px] text-text-secondary">
                TYPESAFE_API_KEY
              </dt>
              <dd>
                {configured ? (
                  <Badge tone="good">configured</Badge>
                ) : (
                  <Badge tone="warning">missing</Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="num w-[168px] shrink-0 text-[12px] text-text-secondary">Model</dt>
              <dd className="num text-[12px]">{DEFAULT_MODEL}</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="num w-[168px] shrink-0 text-[12px] text-text-secondary">
                History window
              </dt>
              <dd className="num text-[12px]">{DEFAULT_HISTORY_WINDOW} events</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="num w-[168px] shrink-0 text-[12px] text-text-secondary">Mode</dt>
              <dd className="text-[12px]">
                {configured ? "Measured Jev judgments" : "Mock judgments (labelled throughout)"}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            The key is read server-side only and is never returned by an API route, written to a
            log, or included in an export. This page reports whether one is set, nothing else
            about it.
          </p>

          {!configured && (
            <div className="mt-3 rounded-md border border-border bg-bg p-3">
              <p className="text-[11.5px] text-text-secondary">To connect:</p>
              <pre className="num mt-1.5 text-[11.5px] whitespace-pre-wrap text-text-primary">
{`cp .env.example .env.local
# then add your key:
TYPESAFE_API_KEY=your-key-here`}
              </pre>
              <p className="mt-1.5 text-[11px] text-text-muted">
                Restart the dev server afterwards.
              </p>
            </div>
          )}

          <div className="mt-3">
            <ConnectionTest />
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-3.5 py-2.5">
            <h2 className="text-[13px] font-medium">Questions</h2>
            <p className="text-[11px] text-text-muted">
              Eight independent judgments over one state, sent in a single System One request.
              Edit them in <code className="num">lib/jev/questions.ts</code>.
            </p>
          </div>
          <Disclosure title="Noul questions" subtitle="7">
            <JsonBlock value={NOUL_QUESTIONS} maxHeight={420} />
          </Disclosure>
          <Disclosure title="Phase choice criteria" subtitle="6 options">
            <JsonBlock value={PHASE_CRITERIA} maxHeight={420} />
          </Disclosure>
        </section>
      </div>
    </div>
  );
}
