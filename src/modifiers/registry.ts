import { ageModifier } from "./age";
import { carriedLoadModifier } from "./carriedLoad";
import type { ItmModifier } from "./types";

export type RegistryEntry = {
  id: string;
  name: string;
  /**
   * `core`: part of the engine, configured through `ItmConfig` (always on, parity-calibrated).
   * `builtin`: shipped as an `ItmModifier`, off unless passed in `modifiers`.
   * `proposal`: documented idea waiting for evidence and review; not usable yet.
   */
  status: "core" | "builtin" | "proposal";
  summary: string;
  /** Doc page, relative to the repository root. */
  doc: string;
  modifier?: ItmModifier;
};

/** Every variable the project knows about. Built-in modifiers are all off by default. */
export const MODIFIER_REGISTRY: readonly RegistryEntry[] = Object.freeze([
  {
    id: "altitude",
    name: "Altitude",
    status: "core",
    summary: "Runs above altitudeFrom add more; sleeping at altitude slows decay. Configured in ItmConfig.",
    doc: "docs/modifiers/altitude.md",
  },
  {
    id: ageModifier.id,
    name: ageModifier.name,
    status: "builtin",
    summary: ageModifier.description,
    doc: "docs/modifiers/age.md",
    modifier: ageModifier,
  },
  {
    id: carriedLoadModifier.id,
    name: carriedLoadModifier.name,
    status: "builtin",
    summary: carriedLoadModifier.description,
    doc: "docs/modifiers/carried-load.md",
    modifier: carriedLoadModifier,
  },
  {
    id: "heat",
    name: "Heat",
    status: "proposal",
    summary: "Hot sessions could add effort and heat acclimation could be tracked. Needs a validated mapping.",
    doc: "docs/modifiers/proposals/heat.md",
  },
  {
    id: "hrv",
    name: "Heart-rate variability",
    status: "proposal",
    summary: "Readiness to train from morning HRV trends. Needs a validated mapping to fitness decay.",
    doc: "docs/modifiers/proposals/hrv.md",
  },
] satisfies RegistryEntry[]);

/** A usable (built-in) modifier by id. */
export function getModifier(id: string): ItmModifier | undefined {
  return MODIFIER_REGISTRY.find((e) => e.id === id)?.modifier;
}
