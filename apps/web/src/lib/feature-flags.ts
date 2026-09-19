// Issue #113: build-time flag (Vite inlines import.meta.env.* at build time),
// so the flag-off branches that read this are dead-code-eliminated from the
// bundle — stronger than a runtime check for "no /stages/* route or nav
// entry at all" when the feature is off.
export const isStageManagementEnabled = import.meta.env.VITE_FEATURE_STAGE_MANAGEMENT === "true";
