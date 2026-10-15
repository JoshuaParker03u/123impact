// Shown whenever converting a typed time from the admin's personal timezone
// into the org's timezone pushes it onto a different calendar date -- never
// silent. Mirrors the existing amber "Ends next day (+1)" overnight warning
// style already used in ShiftModal.jsx/PanelModal.jsx.
export default function TimezoneShiftNotice({ originalDate, shiftedDate, timezoneLabel }) {
  if (!shiftedDate || shiftedDate === originalDate) return null;
  return (
    <p className="text-amber-600 dark:text-amber-400 text-xs mt-1 flex items-center gap-1">
      <span>⚠</span> Shifted to {shiftedDate} in the org&apos;s timezone ({timezoneLabel}).
    </p>
  );
}
