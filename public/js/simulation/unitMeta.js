// Display-only fleet metadata for the MiniSpectors picker: what class each
// unit is, what sensors that class can carry, its battery level and
// availability. There's no hardware-inventory backend for this yet, so it's
// a static fixture (same role as the demo UNITS list in the design mockup)
// — purely drives the "covers scope" / battery / availability UI, it does
// not gate which sensors actually get assigned to a chosen ROV.

export const CLS = {
  insp: {
    label: 'Inspection class',
    caps: ['Navigation', 'Gyro', 'Depth', 'CP', 'UT', 'FMD', 'Manipulator', 'Altimeter', 'ACFM'],
  },
  survey: {
    label: 'Survey skid',
    caps: ['Navigation', 'Gyro', 'Depth', 'Altimeter', 'Scan (SBES/Profiler)', 'MBES'],
  },
  work: {
    label: 'Work class',
    caps: ['Navigation', 'Gyro', 'Depth', 'CP', 'Manipulator', 'UT', 'FMD', 'Cleaning Brush', 'PRC Camera 1', 'PRC Camera 2', 'PipeTracker', 'Water Jet'],
  },
  metro: {
    label: 'Metrology skid',
    caps: ['PRC External Frame', 'Navigation', 'Gyro', 'Depth', 'Altimeter', 'Scan (SBES/Profiler)'],
  },
};

export const STATE_LABEL = { free: 'Available', charging: 'Charging', busy: 'On another mission' };

export const UNIT_META = {
  1: { cls: 'insp', batt: 96, state: 'free' },
  2: { cls: 'insp', batt: 88, state: 'free' },
  3: { cls: 'work', batt: 74, state: 'free' },
  4: { cls: 'survey', batt: 91, state: 'free' },
  5: { cls: 'work', batt: 23, state: 'charging' },
  6: { cls: 'metro', batt: 67, state: 'free' },
  7: { cls: 'insp', batt: 54, state: 'free' },
  8: { cls: 'survey', batt: 80, state: 'free' },
  9: { cls: 'work', batt: 45, state: 'busy' },
  10: { cls: 'metro', batt: 99, state: 'free' },
  11: { cls: 'survey', batt: 31, state: 'free' },
  12: { cls: 'insp', batt: 12, state: 'busy' },
};

export function capsFor(num) {
  const meta = UNIT_META[num];
  return meta ? CLS[meta.cls].caps : [];
}
