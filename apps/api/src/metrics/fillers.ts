const FILLERS = ["um","uh","uhh","uhhh","erm","er","like","you know","sort of","kind of","actually"];
export function detectFillers(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLERS.filter(f => new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`).test(lower));
}
