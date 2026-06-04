// Fixed color palette for course accents.
// Used as left-bar stripes and abbreviation pills — never as full backgrounds.
// Add new colors here only; never hardcode hex values elsewhere.
export const COURSE_COLORS = [
  { name: 'Slate',        value: '#64748b' },
  { name: 'Pastel Slate', value: '#b8c8d8' },
  { name: 'Red',          value: '#c35656' },
  { name: 'Pastel Red',   value: '#f2b4b4' },
  { name: 'Orange',       value: '#cf854d' },
  { name: 'Pastel Orange',value: '#f5caa8' },
  { name: 'Brown',        value: '#7b5c46' },
  { name: 'Pastel Brown', value: '#d4baa8' },
  { name: 'Amber',        value: '#e2a53b' },
  { name: 'Pastel Amber', value: '#f5dfa0' },
  { name: 'Lime',         value: '#90bc4e' },
  { name: 'Pastel Lime',  value: '#cce896' },
  { name: 'Green',        value: '#32b562' },
  { name: 'Pastel Green', value: '#8de0b0' },
  { name: 'Teal',         value: '#5fd3c5' },
  { name: 'Pastel Teal',  value: '#a8ece8' },
  { name: 'Sky',          value: '#59abd1' },
  { name: 'Pastel Sky',   value: '#a8d8f0' },
  { name: 'Blue',         value: '#6393e1' },
  { name: 'Pastel Blue',  value: '#a8c4f2' },
  { name: 'Indigo',       value: '#6f70d5' },
  { name: 'Pastel Indigo',value: '#b8b8ef' },
  { name: 'Violet',       value: '#846bbf' },
  { name: 'Pastel Violet',value: '#c8b8e4' },
  { name: 'Pink',         value: '#cd6c9d' },
  { name: 'Pastel Pink',  value: '#f0b4d4' },
  { name: 'Rose',         value: '#e45b72' },
  { name: 'Pastel Rose',  value: '#f2aab8' },
] as const;

export type CourseColorValue = typeof COURSE_COLORS[number]['value'];

export const DEFAULT_COURSE_COLOR: CourseColorValue = '#6393e1';
