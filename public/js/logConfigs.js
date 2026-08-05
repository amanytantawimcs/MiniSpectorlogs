// Field configs for the 5 structurally-identical logs (open modal -> fixed
// fields -> push/splice into an array -> re-render a grid). One generic
// engine (logs.js) drives all of them from these configs, replacing the old
// app's 5x copy-pasted modal-building + save + render code per log type.
//
// Field types: text | date | time | textarea | select | duration (auto-calculated,
// read-only, paired with a startDate/startTime/endDate/endTime group) | photos.

export const LOG_CONFIGS = {
  diveLogs: {
    title: 'Dive Log Entry',
    containerId: 'dive-log-container',
    emptyMessage: 'No dives recorded.',
    idField: 'num',
    idPrefix: 'DL',
    fields: [
      { key: 'num', label: 'Dive #', type: 'text', auto: true },
      { key: 'rov', label: 'ROV', type: 'text' },
      { key: 'date', label: 'Start Date', type: 'date' },
      { key: 'startTime', label: 'Start Time', type: 'time' },
      { key: 'endDate', label: 'End Date', type: 'date', fallbackFrom: 'date' },
      { key: 'endTime', label: 'End Time', type: 'time' },
      { key: 'depth', label: 'Depth', type: 'text' },
      { key: 'duration', label: 'Duration', type: 'duration', durationGroup: ['date', 'startTime', 'endDate', 'endTime'] },
      { key: 'intTemp', label: 'Int. Temp.', type: 'text' },
      { key: 'intHumidity', label: 'Int. Humidity', type: 'text' },
      { key: 'rain', label: 'Rain', type: 'text' },
      { key: 'objective', label: 'Objective', type: 'text' },
      { key: 'purpose', label: 'Purpose', type: 'text' },
      { key: 'area', label: 'Area', type: 'text' },
      { key: 'issues', label: 'Issues', type: 'textarea' },
      { key: 'client', label: 'Client Instructions', type: 'textarea' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { key: 'num', label: 'Dive #', accent: 'text-blue-400 font-bold' },
      { key: 'rov', label: 'ROV', accent: 'text-orange-400 font-medium', fallback: '—' },
      { key: 'date', label: 'Start Date' },
      { key: '_time', label: 'Time' },
      { key: '_depth', label: 'Depth' },
      { key: 'duration', label: 'Duration' },
      { key: 'objective', label: 'Objective', fallback: '-' },
      { key: 'purpose', label: 'Purpose' },
    ],
  },

  standbyLogs: {
    title: 'Standby Entry',
    containerId: 'standby-log-container',
    emptyMessage: 'No standby time recorded.',
    idField: 'id',
    idPrefix: 'SB',
    fields: [
      { key: 'id', label: 'ID', type: 'text', auto: true, disabled: true },
      { key: 'by', label: 'Logged By', type: 'text' },
      { key: 'date', label: 'Start Date', type: 'date' },
      { key: 'startTime', label: 'Start Time', type: 'time' },
      { key: 'endDate', label: 'End Date', type: 'date', fallbackFrom: 'date' },
      { key: 'endTime', label: 'End Time', type: 'time' },
      { key: 'duration', label: 'Duration', type: 'duration', durationGroup: ['date', 'startTime', 'endDate', 'endTime'] },
      { key: 'category', label: 'Category', type: 'select', options: ['Mechanical Fault', 'Vessel Operations', 'Weather', 'Crew Change', 'Maintenance', 'Client Request'] },
      { key: 'desc', label: 'Description', type: 'textarea' },
    ],
    columns: [
      { key: 'id', label: 'ID', accent: 'text-yellow-500 font-bold' },
      { key: 'date', label: 'Start Date' },
      { key: '_time', label: 'Time Range' },
      { key: 'duration', label: 'Duration' },
      { key: 'category', label: 'Category' },
    ],
  },

  maintenanceLogs: {
    title: 'Maintenance Entry',
    containerId: 'maint-log-container',
    emptyMessage: 'No maintenance recorded.',
    idField: 'id',
    idPrefix: 'MNT',
    fields: [
      { key: 'id', label: 'ID', type: 'text', auto: true, disabled: true },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'by', label: 'By', type: 'text' },
      { key: 'task', label: 'Task', type: 'text' },
      { key: 'details', label: 'Details', type: 'textarea' },
      { key: 'parts', label: 'Parts Used', type: 'text' },
      { key: 'remarks', label: 'Remarks', type: 'text' },
    ],
    columns: [
      { key: 'id', label: 'ID', accent: 'text-yellow-500 font-bold' },
      { key: 'date', label: 'Date' },
      { key: 'task', label: 'Task' },
      { key: 'by', label: 'By' },
    ],
  },

  hseReports: {
    title: 'HSE Entry',
    containerId: 'hse-log-container',
    emptyMessage: 'No HSE incidents.',
    idField: 'id',
    idPrefix: 'HSE',
    fields: [
      { key: 'id', label: 'ID', type: 'text', auto: true, disabled: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Incident', 'Near Miss', 'Hazard Observation'] },
      { key: 'desc', label: 'Description', type: 'textarea' },
      { key: 'action', label: 'Immediate Action', type: 'textarea' },
      { key: 'root', label: 'Root Cause', type: 'textarea' },
      { key: 'prev', label: 'Prevention', type: 'textarea' },
    ],
    columns: [
      { key: 'id', label: 'ID', accent: 'text-red-400 font-bold' },
      { key: 'type', label: 'Type', accent: 'font-bold' },
      { key: '_desc', label: 'Description' },
    ],
  },

  faultLogs: {
    title: 'Fault Entry',
    containerId: 'fault-log-container',
    emptyMessage: 'No active faults recorded.',
    idField: null,
    fields: [
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Closed', 'Monitoring'], optionLabels: { Open: 'Open (Active)', Closed: 'Closed (Resolved)', Monitoring: 'Monitoring' } },
      { key: 'tech', label: 'Technician', type: 'text' },
      { key: 'desc', label: 'Fault Description', type: 'textarea' },
      { key: 'action', label: 'Corrective Action', type: 'textarea' },
      { key: 'parts', label: 'Parts Used', type: 'text' },
      { key: 'remaining', label: 'Remaining Issues', type: 'text' },
      { key: 'photos', label: 'Photos', type: 'photos' },
    ],
    columns: [
      { key: '_status', label: 'Status' },
      { key: 'desc', label: 'Description', accent: 'font-bold text-white' },
      { key: 'action', label: 'Action Taken' },
      { key: 'parts', label: 'Parts', fallback: '-' },
      { key: '_photos', label: 'Photos' },
    ],
  },

  // Per-dive issue log — mirrors the "Issue Report" page of the client's
  // ROV Technical Logbook (Dive #, Cause, Lim Reading, Contacted Support
  // Personnel, Malfunctioning/Replaced Component No.), distinct from the
  // general faultLogs above which isn't tied to a specific dive.
  issueReports: {
    title: 'Issue Report Entry',
    containerId: 'issue-log-container',
    emptyMessage: 'No issues recorded.',
    idField: null,
    fields: [
      { key: 'diveNo', label: 'Dive #', type: 'select', dynamicOptionsFrom: 'diveLogs', dynamicOptionsKey: 'num' },
      { key: 'desc', label: 'Issue Description', type: 'textarea' },
      { key: 'cause', label: 'Cause', type: 'textarea' },
      { key: 'limReading', label: 'Lim Reading', type: 'text' },
      { key: 'actionTaken', label: 'Action Taken', type: 'select', options: ['Replaced', 'Repaired', 'No Action'] },
      { key: 'contactedBy', label: 'Contacted System Support Personnel', type: 'text' },
      { key: 'malfComponent', label: 'Malfunctioning Component No.', type: 'text' },
      { key: 'replacedComponent', label: 'Replaced Component No.', type: 'text' },
    ],
    columns: [
      { key: 'diveNo', label: 'Dive #', accent: 'text-blue-400 font-bold', fallback: '—' },
      { key: '_desc', label: 'Issue Description' },
      { key: 'cause', label: 'Cause', fallback: '-' },
      { key: 'actionTaken', label: 'Action Taken', fallback: '-' },
      { key: 'malfComponent', label: 'Malfunctioning Component', fallback: '-' },
    ],
  },
};
