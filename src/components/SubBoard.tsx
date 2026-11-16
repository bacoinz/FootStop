// The fourth official's substitution board, showing the seconds left in LED dots.

const GLYPHS: Record<string, string[]> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
};

const COLS = 15; // 2 digits of 5 + 1 gap + 2 margin each side
const ROWS = 9; // 7 + 1 margin top and bottom
const BAR = 15;

function litDots(text: string): Set<string> {
  const lit = new Set<string>();
  const chars = text.split("");
  const width = chars.length * 5 + (chars.length - 1);
  const x0 = Math.floor((COLS - width) / 2);
  chars.forEach((ch, k) => {
    const g = GLYPHS[ch] ?? GLYPHS["-"];
    g.forEach((row, y) => row.split("").forEach((c, x) => c === "#" && lit.add(`${x0 + k * 6 + x},${y + 1}`)));
  });
  return lit;
}

/**
 * The board: black panel, digits in green LED dots (red in the last 5 seconds), a row of dots
 * running out underneath, and the handle the official holds.
 */
export function SubBoard({
  seconds,
  fraction,
  low,
  active,
  label,
  width,
}: {
  seconds: number | null;
  fraction: number;
  low: boolean;
  active: boolean;
  label: string;
  width: number;
}) {
  const pitch = width / (COLS + 1.2);
  const r = pitch * 0.36;
  const lit = litDots(seconds === null ? "--" : String(Math.min(99, seconds)));
  const color = low ? "#ff3b3b" : "#39ff7a";
  const barLit = Math.round(Math.max(0, Math.min(1, fraction)) * BAR);
  const w = COLS * pitch;
  const h = ROWS * pitch;
  return (
    <div className={`sub-board ${active ? "active" : ""} ${low ? "low" : ""}`} style={{ width }}>
      <div className="sb-panel">
        <div className="sb-label">{label}</div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sb-matrix" aria-label={seconds === null ? "fora" : `${seconds} segundos`}>
          {Array.from({ length: ROWS }, (_, y) =>
            Array.from({ length: COLS }, (_, x) => {
              const on = lit.has(`${x},${y}`);
              return <circle key={`${x},${y}`} cx={(x + 0.5) * pitch} cy={(y + 0.5) * pitch} r={r} fill={on ? color : "#1c1f1d"} className={on ? "sb-on" : undefined} />;
            }),
          )}
        </svg>
        <svg width={w} height={pitch * 1.2} viewBox={`0 0 ${w} ${pitch * 1.2}`} className="sb-bar" aria-hidden>
          {Array.from({ length: BAR }, (_, x) => (
            <rect
              key={x}
              x={x * pitch + pitch * 0.12}
              y={pitch * 0.3}
              width={pitch * 0.76}
              height={pitch * 0.6}
              rx={pitch * 0.15}
              fill={x < barLit ? (low ? "#ff3b3b" : "#ffb020") : "#1c1f1d"}
              className={x < barLit ? "sb-on" : undefined}
            />
          ))}
        </svg>
      </div>
      <div className="sb-handle" />
    </div>
  );
}
