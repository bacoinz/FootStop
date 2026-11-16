// Dev aid: "?raf=timeout" drives animation frames with timers, so previews in a hidden window
// (where the browser stops painting) still finish their animations. Removed from production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).get("raf") === "timeout") {
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => window.clearTimeout(id);
}
