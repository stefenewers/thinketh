// One owner of spoken audio at a time: the personal agent (and its Catch Me Up), Playground speech
// or other media. Claiming focus asks the current owner to stop or duck; nobody talks over anybody.
// Today only the agent speaks; anything that adds audio must claim focus here first.

export type AudioOwner = "agent" | "playground" | "media";
type Holder = { owner: AudioOwner; yieldTo: (next: AudioOwner) => void };

let holder: Holder | null = null;

/** Take audio focus. The previous owner is told to stop (or duck) before this returns. */
export function claimAudio(owner: AudioOwner, yieldTo: (next: AudioOwner) => void): () => void {
  const prev = holder;
  const mine: Holder = { owner, yieldTo };
  holder = mine;
  if (prev && prev !== mine) {
    try {
      prev.yieldTo(owner);
    } catch {
      // A misbehaving owner must not block the new one.
    }
  }
  return () => {
    if (holder === mine) holder = null;
  };
}

export function audioOwner(): AudioOwner | null {
  return holder?.owner ?? null;
}
