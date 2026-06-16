function pickFrameTimes(duration, max) {
  if (!(duration > 0)) return [];
  const n = Math.max(1, Math.min(max, Math.ceil(duration)));
  const times = [];
  for (let i = 0; i < n; i++) {
    times.push(Number(((duration * (i + 0.5)) / n).toFixed(3)));
  }
  return times;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { pickFrameTimes };
}
