/**
 * Registry of all incident archetypes. The bulk runner picks from these.
 */

import { cascadingFailure } from "./cascadingFailure.js";
import { authBruteforce } from "./authBruteforce.js";
import { privilegeEscalation } from "./privilegeEscalation.js";
import { dataExfiltration } from "./dataExfiltration.js";
import { ddosSurge } from "./ddosSurge.js";
import type { Scenario } from "./types.js";

export const SCENARIOS: Scenario[] = [
  cascadingFailure,
  authBruteforce,
  privilegeEscalation,
  dataExfiltration,
  ddosSurge,
];

export { cascadingFailure, authBruteforce, privilegeEscalation, dataExfiltration, ddosSurge };
export type { Scenario, ScenarioContext } from "./types.js";
export { mulberry32 } from "./util.js";
