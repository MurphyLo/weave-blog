"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import NumberFlow from "@number-flow/react";

import { getPoll, type PollId } from "@/lib/polls";
import type { PollVotes } from "@/lib/db";

// One-vote poll backed by D1. The poll (question + options) is defined in
// src/lib/polls.ts — the same definition validates votes in the worker.
// "Already voted" is remembered in localStorage, same honor system as
// LikeButton. Embed inside <Demo> to satisfy the data-atomic contract.
export function Poll({ id }: { id: PollId }) {
  const poll = getPoll(id);
  const [votes, setVotes] = useState<PollVotes | null>(null);
  const [votedOption, setVotedOption] = useState<string | null>(null);

  useEffect(() => {
    setVotedOption(localStorage.getItem(`voted:poll:${id}`));
    let cancelled = false;
    fetch(`/api/polls/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { votes: PollVotes } | null) => {
        if (!cancelled && data) setVotes(data.votes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!poll) return null;

  const voted = votedOption !== null;
  const total = poll.options.reduce((sum, o) => sum + (votes?.[o.id] ?? 0), 0);

  const handleVote = (optionId: string) => {
    if (voted) return;
    setVotedOption(optionId);
    setVotes((v) => ({ ...v, [optionId]: (v?.[optionId] ?? 0) + 1 }));
    localStorage.setItem(`voted:poll:${id}`, optionId);
    fetch(`/api/polls/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ option: optionId }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { votes: PollVotes }) => setVotes(data.votes))
      .catch(() => {
        // Roll back on failure so the counts stay honest.
        setVotedOption(null);
        setVotes((v) => {
          if (!v) return v;
          return { ...v, [optionId]: Math.max(0, (v[optionId] ?? 0) - 1) };
        });
        localStorage.removeItem(`voted:poll:${id}`);
      });
  };

  return (
    <div className="poll">
      <p className="poll-question">{poll.question}</p>
      <div className="poll-options">
        {poll.options.map((option) => {
          const count = votes?.[option.id] ?? 0;
          const share = voted && total > 0 ? count / total : 0;
          const chosen = votedOption === option.id;
          return (
            <motion.button
              key={option.id}
              className="poll-option"
              data-chosen={String(chosen)}
              data-voted={String(voted)}
              onClick={() => handleVote(option.id)}
              whileTap={voted ? undefined : { scale: 0.98 }}
            >
              <motion.span
                className="poll-bar"
                initial={false}
                animate={{ width: `${share * 100}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 28 }}
              />
              <span className="poll-label">{option.label}</span>
              <span className="poll-count" style={{ opacity: voted ? 1 : 0 }}>
                <NumberFlow value={count} />
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="poll-total" style={{ opacity: voted ? 1 : 0 }}>
        <NumberFlow value={total} /> vote{total === 1 ? "" : "s"} · stored in D1
      </p>
    </div>
  );
}
