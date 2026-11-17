import { useEffect, useState } from "react";

/**
 * A-ADS ad unit (https://a-ads.com). Create a unit there, pick "Adaptive", and paste its numeric ID below.
 * While the ID is empty nothing is rendered. Never shown during a round, only on the menu and the final screen.
 */
export const AADS_UNIT = "";

export function AdSlot() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Skip on local development so test sessions don't count as impressions.
    setOn(!!AADS_UNIT && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
  }, []);
  if (!on) return null;
  return (
    <div className="ad-slot" aria-label="Advertisement">
      <iframe
        title="Advertisement"
        data-aa={AADS_UNIT}
        src={`https://acceptable.a-ads.com/${AADS_UNIT}?size=Adaptive`}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ border: 0, padding: 0, width: "100%", height: "100%", overflow: "hidden", display: "block" }}
      />
    </div>
  );
}
