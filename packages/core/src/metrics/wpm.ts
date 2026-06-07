export function rollingWpm(tokens: { t:number; text:string }[], windowMs=10_000): number {
  if (!tokens.length) return 0;
  const now = tokens[tokens.length - 1].t;
  const recent = tokens.filter(x => x.t >= now - windowMs);
  const words = recent.map(x => x.text.trim().split(/\s+/).filter(Boolean).length).reduce((a,b)=>a+b,0);
  return Math.round(words / (windowMs/60000));
}
