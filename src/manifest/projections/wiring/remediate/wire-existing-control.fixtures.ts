/**
 * Shared fixtures for wire-existing-control semantic matching tests.
 */

export const MILESTONE_DOMAIN = `
entity ActionMilestone {
  property required id: string
  property status: string = "open"
  property title: string = ""

  command complete() {
    mutate status = "completed"
  }

  command archive() {
    mutate status = "archived"
  }

  store ActionMilestone in memory
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

export const DISMISS_BUTTON = `
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function MobileKitchenPage() {
  const [error, setError] = useState<string | null>("load failed");
  const incompleteItemsCount = 3;
  return (
    <div>
      {error && (
        <div>
          <span>{error}</span>
          <Button onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <p>All prep complete</p>
      <p>{incompleteItemsCount} items left</p>
    </div>
  );
}
`;
