// =============================================================================
// DEPRECATED — All risk logic has been consolidated into riskEngine.js
// This file re-exports everything from riskEngine.js for backwards compatibility.
// New code should import directly from './riskEngine'.
// =============================================================================

export {
  calculateAcademicRisk,
  computeTentativeGrade,
  computeUnifiedRisk,
  isStudentAtRisk,
  isStudentModerateRisk,
  calculateInterventionOutcome,
  RISK_WEIGHTS,
  RISK_TIERS
} from './riskEngine';
