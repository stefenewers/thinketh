// While a challenge runs, ask the server for its next step, one at a time. The server claims each step
// durably, so two devices (or a retry) never run it twice; a step someone else holds just waits.
import { useEffect, useRef, useState } from "react";
import type { PlaygroundRoom } from "@thinketh/contracts";
import { challengeApi } from "@/api/challenge";

export function useChallengeDriver(room: PlaygroundRoom | null, me: string | undefined, onRoom: (r: PlaygroundRoom) => void) {
  const advancing = useRef(false);
  const [tick, setTick] = useState(0);
  const roomId = room?.id;
  const running = room?.challenge?.status === "running";
  const step = room?.challenge?.step;
  useEffect(() => {
    if (!roomId || !running || step === undefined || advancing.current) return;
    advancing.current = true;
    challengeApi
      .advance(roomId, step, me)
      .then(
        (r) => {
          onRoom(r);
          // Nothing moved (another device holds this step): look again shortly.
          if (r.challenge?.step === step && r.challenge.status === "running") return new Promise((res) => setTimeout(res, 1500));
        },
        () => new Promise((res) => setTimeout(res, 2500)),
      )
      .finally(() => {
        advancing.current = false;
        setTick((t) => t + 1);
      });
  }, [roomId, running, step, me, tick, onRoom]);
}
