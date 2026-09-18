import { EvaluationsView } from "@/components/evaluations/evaluations-view";
import { PageHeader } from "@/components/ui/primitives";
import { listDatasets } from "@/lib/evaluations/datasets";

export const dynamic = "force-dynamic";

export default function EvaluationsPage() {
  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Evaluations"
        description="Labelled scenarios with real metrics. Precision, recall, and F1 appear only where a human-supplied label exists — everywhere else you get the probability and nothing more."
      />
      <EvaluationsView datasets={listDatasets()} />
    </div>
  );
}
