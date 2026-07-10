/**
 * CollectionCase fixtures for action-intent wire-existing-control tests.
 */

export const COLLECTION_DOMAIN = `
entity CollectionCase {
  property required id: string
  property status: string = "open"
  property title: string = ""

  command escalateToLegal() {
    mutate status = "legal"
  }

  command create(title: string) {
    mutate title = title
  }

  store CollectionCase in memory
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

/** Exact live failure: create-dialog button on a CollectionCase page. */
export const NEW_CASE_BUTTON_PAGE = `
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function CollectionCasesPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const cases = [{ id: "case-1", title: "Overdue" }];
  return (
    <div>
      <h1>CollectionCase board</h1>
      <p>Escalate to legal when a case is ready for counsel.</p>
      <Button onClick={() => setCreateDialogOpen(true)} size="sm">
        <Plus className="mr-2 h-4 w-4" />
        New case
      </Button>
      <ul>
        {cases.map((c) => (
          <li key={c.id}>{c.title}</li>
        ))}
      </ul>
    </div>
  );
}
`;
