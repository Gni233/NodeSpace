export interface CardForceLinkCandidate {
  lineStyle?: string;
  _structureMembership?: unknown;
  _conflict?: unknown;
  _dyingAt?: unknown;
}

/** Matches the main simulation's link eligibility while retaining structure constraints. */
export function isCardForceLink(edge: CardForceLinkCandidate): boolean {
  return ((edge.lineStyle || 'solid') === 'solid' || !!edge._structureMembership)
    && !edge._conflict
    && !edge._dyingAt;
}
