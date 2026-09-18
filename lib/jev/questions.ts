/**
 * The semantic questions JevScope asks about every agent step.
 *
 * Design rules, from the TypeSafe question guidance:
 *  - Each question is one narrow, coherent judgment. Nothing is a compound
 *    "is this good?" question, and no output is combined into a single score.
 *  - Question keys are for our code and are NOT sent to the model, so every
 *    `instructions` string carries its full meaning on its own.
 *  - `criteria` describe what yes and no actually mean, which is what keeps
 *    these calibrated rather than vibes-based.
 *  - Nested state is referenced with backticked paths so the model knows
 *    exactly which field the judgment is about.
 *
 * All of these are independent over the same state, so they go out in ONE
 * System One request and are evaluated in parallel.
 *
 * Edit this file to change what JevScope measures. Nothing else hard-codes the
 * question wording; `NOUL_DIMENSIONS` in `types.ts` defines the key set.
 */
import { choice, noul } from "@typesafe-ai/sdk";
import type { ChoiceQuestion, NoulQuestion } from "@typesafe-ai/sdk";

import { PHASES, type NoulDimension, type Phase } from "./types";

export const PHASE_CRITERIA: Record<Phase, string> = {
  exploring:
    "The agent is gathering information or building an understanding of the problem: reading files, inspecting code, searching, or asking questions. It is not yet changing anything.",
  implementing:
    "The agent is making changes intended to accomplish the stated task: writing or editing files, adding code, or applying a fix.",
  verifying:
    "The agent is testing or checking whether the work is correct: running tests, re-reading its own changes, or comparing output against what the task requires.",
  recovering:
    "The agent is responding to an error, a failed attempt, or an unexpected result: reverting, retrying, diagnosing a failure, or changing approach after something did not work.",
  finished:
    "The evidence in `currentStep` and `recentHistory` indicates the requested task has been completed AND checked, not merely asserted to be complete.",
  unclear:
    "The current behavior does not clearly fit any of the other phases, or there is not enough evidence in the supplied state to tell.",
};

export const NOUL_QUESTIONS: Record<NoulDimension, NoulQuestion> = {
  taskAlignment: noul(
    "An AI agent is working on the task in `task`. Considering the action in `currentStep`, does that action directly contribute to accomplishing the stated task?",
    {
      true: "The action is a plausible and relevant part of doing the stated task, including necessary setup, inspection, or verification work that the task requires.",
      false:
        "The action is unrelated to the stated task, addresses a different problem, or is busywork that does not move the stated task forward.",
    },
  ),

  progress: noul(
    "An AI agent is working on the task in `task`. Does the action in `currentStep` represent meaningful progress toward completing that task, compared with the situation shown in `recentHistory`?",
    {
      true: "The step advances the work: it produces new information the agent did not have, changes the system toward the goal, or confirms something that was previously unknown.",
      false:
        "The step leaves the agent in substantially the same position as before: it produces nothing new, or it undoes progress without replacing it.",
    },
  ),

  repetition: noul(
    "Compare the action in `currentStep` against the actions in `recentHistory`. Is the agent substantially repeating work it has already performed, without evidence in the state that the repetition is necessary?",
    {
      true: "The same or an essentially equivalent action has already been performed in `recentHistory`, and nothing in the state explains why doing it again is warranted.",
      false:
        "The action is new, or it repeats earlier work for a reason the state supports, such as re-running a test after a change that could plausibly affect the result.",
    },
  ),

  stuck: noul(
    "Look at the sequence of actions in `recentHistory` together with `currentStep`. Does this sequence indicate that the agent is stuck, that is, cycling or repeatedly failing without making meaningful progress toward `task`?",
    {
      true: "The recent sequence shows repeated attempts, reverts, or failures that keep returning to the same unresolved problem, with no sign of the agent's understanding or the system state improving.",
      false:
        "The recent sequence shows the agent moving forward: resolving problems, learning from results, or working through distinct parts of the task, even if individual steps failed.",
    },
  ),

  // Asks whether an unverified change is outstanding RIGHT NOW, not whether the
  // task as a whole still needs checking. The earlier phrasing asked the
  // latter, which is trivially true at every mid-task step and so returned
  // 0.9+ everywhere, carrying no information.
  needsVerification: noul(
    "Looking at `currentStep` and `recentHistory`, is there a change the agent has made whose effect has not yet been observed? That is, is work sitting unverified at this moment?",
    {
      true: "The most recent substantive change has not been followed by any observation of its effect: no test was run, no output was inspected, and no result was read back since it was made.",
      false:
        "No unverified change is outstanding. Either the most recent change was followed by an observed result, such as a test run or an inspected output, or the agent has not changed anything.",
    },
  ),

  // Asks whether the agent IS claiming completion unsupported, not whether a
  // hypothetical claim would be premature. The hypothetical is true at almost
  // every step of an unfinished task, which made the earlier version saturate.
  prematureCompletion: noul(
    "In `currentStep`, is the agent asserting or signalling that `task` is finished, when the evidence in the supplied state does not establish that it is?",
    {
      true: "The current step claims, states, or clearly implies that the work is done, and the supplied state does not support that: checks last seen were failing, required work is untouched, or no result confirms the outcome.",
      false:
        "The current step makes no claim that the work is finished, or it does claim so and the supplied evidence does support it.",
    },
  ),

  unexpectedDirection: noul(
    "An AI agent was given the task in `task`. Has it moved onto work that is not required for that task?",
    {
      true: "The agent is doing work outside the scope of the stated task: refactoring unrelated code, fixing unrelated problems, or pursuing a goal the task did not ask for.",
      false:
        "The agent's work is within the scope of the stated task, including necessary supporting work the task implies.",
    },
  ),
};

export const PHASE_QUESTION: ChoiceQuestion<Record<Phase, string>> = choice(
  "An AI agent is working on the task in `task`. Considering `currentStep` in light of `recentHistory`, which phase best describes the agent's current behavior?",
  PHASE_CRITERIA,
);

/** Key under which the phase Choice answer is returned. */
export const PHASE_KEY = "phase" as const;

/**
 * Every question, in one object, for one System One request.
 * They are independent and cannot see each other's answers, which is exactly
 * what we want: seven separate judgments about the same moment.
 */
export function buildQuestions() {
  return { ...NOUL_QUESTIONS, [PHASE_KEY]: PHASE_QUESTION };
}

export type JevScopeQuestions = ReturnType<typeof buildQuestions>;

/** The phase labels, re-exported so UI code has one source of truth. */
export { PHASES };
