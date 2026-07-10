/**
 * Event.confirm / CRM scoring fixtures for wire-control preflight tests.
 */

export const EVENT_DOMAIN = `
entity Event {
  property required id: string
  property status: string = "draft"
  property title: string = ""

  command confirm(userId: string) {
    mutate status = "confirmed"
  }

  store Event in memory
}

entity Task {
  property required id: string
  property title: string = ""
  property tags: array<string> = []
  property priority: number = 1
  property dueDate: date = "2026-01-01"
  property summary: string = ""
  property completedBy: string = ""

  command create(
    title: string,
    summary: string,
    tags: array<string>,
    priority: number,
    dueDate: date,
    completedBy: string from context.actorId
  ) {
    mutate title = title
    mutate summary = summary
    mutate tags = tags
    mutate priority = priority
    mutate dueDate = dueDate
    mutate completedBy = completedBy
  }

  store Task in memory
}
`;

/** Exact live failure shape: window.confirm delete on CRM scoring page. */
export const SCORING_RULES_WITH_CONFIRM = `
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { crmScoringRuleSoftDelete } from "@/app/lib/manifest-client.generated";

const FIELD_OPTIONS = [
  { value: "eventType", label: "Event Type" },
  { value: "eventDate", label: "Event Date" },
];

export function ScoringRulesClient() {
  const [rules, setRules] = useState([{ id: "rule-1", rule_name: "Hot lead" }]);
  return (
    <div>
      <h1>CRM scoring rules</h1>
      <p>Fields: {FIELD_OPTIONS.map((f) => f.label).join(", ")}</p>
      <ul>
        {rules.map((rule) => (
          <li key={rule.id}>
            {rule.rule_name}
            <Button
              className="text-muted-foreground"
              onClick={async () => {
                if (
                  !confirm(
                    \`Delete rule "\${rule.rule_name}"? This cannot be undone.\`
                  )
                ) {
                  return;
                }
                await crmScoringRuleSoftDelete({ id: rule.id });
              }}
              size="sm"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      <Button onClick={() => setRules([])}>Confirm</Button>
    </div>
  );
}
`;

export const EVENT_CONFIRM_BINDING = `
export async function eventConfirm(input: { id?: string; userId?: string } = {}) {
  return undefined;
}
`;

export const EVENT_CONFIRM_VALID_CONTROL = `
export function EventDetail({ eventId, userId }: { eventId: string; userId: string }) {
  return (
    <div>
      <h1>Event {eventId}</h1>
      <button
        data-manifest-capability="Event.confirm"
        onClick={noop}
      >
        Confirm event
      </button>
    </div>
  );
}
`;
