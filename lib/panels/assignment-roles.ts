// Shared between the panel candidate pool and the assignment-creation route
// so the two can never drift: moderator isn't a signup-time attendee_type
// (nobody registers AS a moderator) — moderators are drawn from the same
// pool of event volunteers as "Assign Staff", just tagged with a different
// panel_assignments.role. Informational only for now (no platform-level
// permissions are granted); automating that is a future step.
export const PANEL_ASSIGNMENT_ROLES = ['speaker', 'volunteer', 'moderator'] as const;
export type PanelAssignmentRole = typeof PANEL_ASSIGNMENT_ROLES[number];

export const REQUIRED_ATTENDEE_TYPE: Record<PanelAssignmentRole, 'speaker' | 'volunteer'> = {
  speaker: 'speaker',
  volunteer: 'volunteer',
  moderator: 'volunteer',
};

export function isPanelAssignmentRole(value: unknown): value is PanelAssignmentRole {
  return typeof value === 'string' && (PANEL_ASSIGNMENT_ROLES as readonly string[]).includes(value);
}
