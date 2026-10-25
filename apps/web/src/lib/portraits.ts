/** Ink-wash demo portraits for marketing + match preview cards. */

export const PORTRAITS = {
  mei: {
    src: '/brand/portraits/mei.jpg',
    name: 'Mei',
    age: 24,
    label: 'Mei, 24',
  },
  tomas: {
    src: '/brand/portraits/tomas.jpg',
    name: 'Tomás',
    age: 26,
    label: 'Tomás, 26',
  },
} as const;

export type PortraitKey = keyof typeof PORTRAITS;

/** Stable soft portrait for a partner name when no live avatar exists. */
export function portraitForName(name?: string | null): (typeof PORTRAITS)[PortraitKey] {
  const keys = Object.keys(PORTRAITS) as PortraitKey[];
  if (!name) return PORTRAITS.mei;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % 997;
  const key = keys[hash % keys.length] ?? 'mei';
  return PORTRAITS[key];
}
