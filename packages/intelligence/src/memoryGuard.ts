/**
 * Keeps learner memory (Backboard) from being manipulated through Ask.
 * Knowledge-state numbers belong to the deterministic engine, so memory must
 * never carry them, and text that tries to steer the system is answered but
 * never remembered.
 */

const MANIPULATION = [
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,40}\b(instructions?|rules?|prompt|system|previous|above)\b/i,
  /\bsystem\s*(prompt|override|message|instructions?)\b/i,
  /\b(set|change|update|make|raise|lower|increase|decrease)\b[^.?!]{0,40}\b(mastery|uncertainty|confidence|knowledge state|score)\b/i,
  /\b(api|secret|private|access)\s*(keys?|tokens?)\b|\bpasswords?\b/i,
  /\b(you are now|act as|pretend to be|roleplay as|jailbreak|developer mode)\b/i,
];

/** True for text that tries to steer the system rather than learn. Answer it; don't store it. */
export function isManipulation(text: string): boolean {
  return MANIPULATION.some((re) => re.test(text));
}

/** True for a memory that asserts a knowledge-state number ("mastery level is 1.0"). */
export function assertsKnowledgeNumber(content: string): boolean {
  return (
    /\b(mastery|uncertainty|confidence|knowledge (state|level)|proficiency)\b[^.]{0,40}\d/i.test(content) ||
    /\d+(\.\d+)?\s*%?\s*(mastery|uncertainty|confidence)\b/i.test(content)
  );
}
