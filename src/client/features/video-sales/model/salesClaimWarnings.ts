/** Surface experiential claims missing from supplied facts; never silently rewrite narration. */
export function salesUnverifiedClaims(voiceover: string, suppliedFacts: string): string[] {
  const claims = ['不闷', '不往上滑', '不缩水', '不起球', '不勒', '透气', '显瘦', '保暖', '防水', '耐磨'];
  return claims.filter((claim) => voiceover.includes(claim) && !suppliedFacts.includes(claim));
}
