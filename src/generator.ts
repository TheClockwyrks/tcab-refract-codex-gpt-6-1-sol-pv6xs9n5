import { TIERS } from "./constants";
import { CASCADE_BOARDS } from "./cascade-boards";
/** Choose independent dimensions, then a certified motif and bench orientation.
 * Each reflection and channel permutation is validated separately: the canonical
 * drawing order can change its branching factor even when solutions are identical.
 */
export function generate(tier: number): readonly string[] {
  const t = TIERS.find((t) => t.tier === tier);
  if (!t) throw new RangeError("Unknown Cascade tier: " + tier);
  const integer = (min: number, max: number) =>
    min + Math.floor(Math.random() * (max - min + 1));
  const cols = integer(t.minCols, t.maxCols),
    rows = integer(t.minRows, t.maxRows);
  const pool = CASCADE_BOARDS[`${tier}-${cols}-${rows}`];
  return [...pool[integer(0, pool.length - 1)]];
}
