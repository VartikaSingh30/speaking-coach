const FILLERS = ["um","uh","uhh","uhhh","erm","er","like","you know","sort of","kind of","actually"];
export function detectFillers(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLERS.filter(f => {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${esc}\\b`).test(lower);
  });
}
