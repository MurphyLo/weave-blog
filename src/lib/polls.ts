// Poll definitions, declared once here so the API route can validate votes
// in the worker (where content/ does not exist) and the <Poll> component can
// render question/options from the same source.

export interface PollDefinition {
  question: string;
  options: readonly { id: string; label: string }[];
}

export const POLLS = {
  "next-block": {
    question: "Which embedded block should this blog explore next?",
    options: [
      { id: "selection", label: "Custom text selection" },
      { id: "sandbox", label: "Live code sandboxes" },
      { id: "viz", label: "Interactive data viz" },
    ],
  },
} as const satisfies Record<string, PollDefinition>;

export type PollId = keyof typeof POLLS;

export function getPoll(pollId: string): PollDefinition | undefined {
  return (POLLS as Record<string, PollDefinition>)[pollId];
}

export function isValidVote(pollId: string, optionId: string): boolean {
  const poll = getPoll(pollId);
  return poll !== undefined && poll.options.some((o) => o.id === optionId);
}
