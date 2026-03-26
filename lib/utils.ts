/** Generate a deterministic HSL color from a name string. */
export function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue}, 55%, 65%)`;
}
