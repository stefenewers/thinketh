// Did the user just ask to end the conversation, or only to stop the current reply? Runs on the
// user's final transcript for each turn. "Stop talking" (and a bare "stop") silences this reply and
// keeps the conversation; ending needs an ending ("end the call", "that's enough", "goodbye").
// Deterministic and conservative: explicit phrases anywhere ("end the call", "that's enough"),
// or a short utterance that is essentially a stop word ("finish", "okay, stop, thanks").
// Questions about endings, negations ("don't stop") and long sentences that merely contain the
// word do not end the call. Pure, so it can be tested.

const EXPLICIT = [
  /\b(end|stop|finish|close|quit|exit)\s+(the|this|our|my)?\s*(call|session|conversation|catch[\s-]?up|briefing|chat)\b/,
  /\bhang\s+up\b/,
  /\bstop\s+(here|now|there)\b/,
  /\b(end|finish)\s+(here|now|it|things)\b/,
  // Only as the close of the utterance: "that's enough (for now) (thanks)", never "that is enough evidence".
  /\bthat('?s|\s+is)\s+(enough|all|it)(\s+(for\s+(now|today)|here|then))?(\s+(thanks|thank\s+you))?\s*$/,
  /\b(i'?m|i\s+am|we'?re|we\s+are)\s+(done|finished|all\s+set|good\s+for\s+(now|today))\b/,
  /\b(let'?s|we\s+can|you\s+can|can\s+we|please)\s+(stop|end|finish|wrap(\s+it)?\s+up|call\s+it)\b/,
  /\bwrap\s+(it\s+|this\s+|things\s+)?up\b/,
  /\b(good\s*bye|bye[\s-]+bye|talk\s+(to\s+you\s+)?later|see\s+you(\s+later)?)\b/,
  /\bno\s+more\b/,
  /\benough\s+for\s+(now|today)\b/,
];

// Words that, on their own in a short utterance, mean "stop".
const STOP_WORDS = new Set(["end", "finish", "finished", "done", "enough", "bye", "goodbye", "quit", "exit", "cancel"]);
// Politeness and fillers that don't change meaning.
const FILLER = new Set(["ok", "okay", "alright", "all", "right", "yeah", "yes", "yep", "please", "thanks", "thank", "you", "so", "um", "uh", "now", "just", "and", "well", "cool", "great", "perfect", "i", "think", "we", "can", "the", "that", "it", "for", "today", "then", "actually"]);

const NEGATED = /\b(don'?t|do\s+not|not|never|no\s+need\s+to|can'?t|won'?t|shouldn'?t|before\s+we|until)\b[\w\s']{0,20}\b(stop|end|finish|done|hang|wrap|quit)/;
const QUESTION_ABOUT = /\b(what|how|why|when|where|which|who|does|do|is|are|can|could|would|will|should)\b.*\?$/;

export function isEndIntent(raw: string): boolean {
  const text = raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'?\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;
  if (NEGATED.test(text)) return false;
  // "How does memory end up stale?" is a question, not a request (explicit phrases still win below).
  const isQuestion = QUESTION_ABOUT.test(text);
  if (EXPLICIT.some((re) => re.test(text))) return !isQuestion || /\b(can|could|would|shall)\s+(we|you)\s+(stop|end|finish|hang|wrap)\b/.test(text);
  if (isQuestion) return false;
  const words = text.replace(/\?/g, "").split(" ").filter(Boolean);
  const meaningful = words.filter((w) => !FILLER.has(w.replace(/'s$/, "")));
  return meaningful.length > 0 && meaningful.length <= 2 && meaningful.every((w) => STOP_WORDS.has(w)) && words.length <= 7;
}

// "Stop talking", "be quiet", "hold on", or a bare "stop": silence the current reply only.
const SILENCE = /^(?:(?:ok(?:ay)?|alright|hey|thinketh|please|sorry)\s+)*(?:stop(?:\s+(?:talking|speaking|there|for\s+a\s+(?:second|sec|moment)))?|be\s+quiet|quiet|shush|hush|sh+|hold\s+on|wait|pause|one\s+(?:second|sec|moment))(?:\s+(?:please|thanks|thank\s+you|a\s+(?:second|sec|moment)))*$/;

export function isStopTalkingIntent(raw: string): boolean {
  const text = raw
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !!text && !isEndIntent(raw) && SILENCE.test(text);
}
