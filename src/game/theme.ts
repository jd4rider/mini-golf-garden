import type { ThemeId } from '../core/types'

export interface Theme {
  id: ThemeId
  name: string
  /** Paint palettes for the board. */
  grass: string
  grassAlt: string
  rough: string
  roughAlt: string
  stone: string
  stoneAlt: string
  sand: string
  sandAlt: string
  mud: string
  ice: string
  water: string
  waterDeep: string
  waterLight: string
  wood: string
  woodDark: string
  hedge: string
  hedgeLight: string
  hedgeDark: string
  wallStyle: 'hedge' | 'stone' | 'crystal' | 'hay' | 'topiary'
  decor: 'daisy' | 'mushroom' | 'lily' | 'windflower' | 'crystal' | 'leaf' | 'firefly' | 'rose'
  flower: string
  flowerAlt: string
  accent: string
  flag: string
  /** Night tint painted over the whole board. */
  night: number
  /** Extra decoration density 0..1. */
  lush: number
}

const BASE = {
  stone: '#cfc6b0',
  stoneAlt: '#b7ad95',
  sand: '#f0dfae',
  sandAlt: '#dfc98d',
  mud: '#7d6440',
  ice: '#d3ecf7',
  wood: '#b08152',
  woodDark: '#8a6039',
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: {
    ...BASE,
    id: 'meadow',
    name: 'Sunny Meadows',
    grass: '#84c95f',
    grassAlt: '#6fb44e',
    rough: '#5e9c43',
    roughAlt: '#4f8839',
    water: '#4aa3c7',
    waterDeep: '#2f7d9c',
    waterLight: '#8fd3e8',
    hedge: '#3f7d3f',
    hedgeLight: '#63a85a',
    hedgeDark: '#2b5c2e',
    wallStyle: 'hedge',
    decor: 'daisy',
    flower: '#fff6c9',
    flowerAlt: '#ffd166',
    accent: '#ffd166',
    flag: '#ef6f6c',
    night: 0,
    lush: 0.9,
  },
  grove: {
    ...BASE,
    id: 'grove',
    name: 'Mushroom Grove',
    grass: '#6fae6a',
    grassAlt: '#5c9a58',
    rough: '#4d8550',
    roughAlt: '#3f7145',
    water: '#4a8ea8',
    waterDeep: '#336a80',
    waterLight: '#8fc4d4',
    hedge: '#335f3c',
    hedgeLight: '#4f8a52',
    hedgeDark: '#23422c',
    wallStyle: 'hedge',
    decor: 'mushroom',
    flower: '#f6c7c0',
    flowerAlt: '#e78f87',
    accent: '#e78f87',
    flag: '#f2b04e',
    night: 0.04,
    lush: 1,
  },
  pond: {
    ...BASE,
    id: 'pond',
    name: 'Lily Pond',
    grass: '#8ac484',
    grassAlt: '#75b073',
    rough: '#5f9860',
    roughAlt: '#4f8452',
    water: '#3f95b8',
    waterDeep: '#276d8c',
    waterLight: '#9adcef',
    hedge: '#3f6f5a',
    hedgeLight: '#5b9375',
    hedgeDark: '#2c5142',
    wallStyle: 'hedge',
    decor: 'lily',
    flower: '#ffe9f3',
    flowerAlt: '#f6b8d0',
    accent: '#7fd6e8',
    flag: '#f2b04e',
    night: 0.03,
    lush: 1,
  },
  windmill: {
    ...BASE,
    id: 'windmill',
    name: 'Windmill Valley',
    grass: '#bcc96c',
    grassAlt: '#a8b75d',
    rough: '#96a34c',
    roughAlt: '#83913f',
    water: '#5893a8',
    waterDeep: '#3f7184',
    waterLight: '#9dc9d6',
    hedge: '#6f7a3a',
    hedgeLight: '#94a253',
    hedgeDark: '#525c28',
    wallStyle: 'stone',
    decor: 'windflower',
    flower: '#ffe7a8',
    flowerAlt: '#f7c25e',
    accent: '#d8c48a',
    flag: '#d96b4a',
    night: 0,
    lush: 0.6,
  },
  crystal: {
    ...BASE,
    id: 'crystal',
    name: 'Crystal Garden',
    grass: '#6f8fa8',
    grassAlt: '#5f7f99',
    rough: '#557287',
    roughAlt: '#486478',
    water: '#5f7fd8',
    waterDeep: '#3f56a8',
    waterLight: '#a9c4ff',
    hedge: '#4a3f7a',
    hedgeLight: '#6c5ca8',
    hedgeDark: '#332a58',
    wallStyle: 'crystal',
    decor: 'crystal',
    flower: '#d9c8ff',
    flowerAlt: '#a98cf0',
    accent: '#b9a2ef',
    flag: '#f2b04e',
    night: 0.12,
    lush: 0.5,
  },
  orchard: {
    ...BASE,
    id: 'orchard',
    name: 'Autumn Orchard',
    grass: '#b3b45c',
    grassAlt: '#a0a24d',
    rough: '#8d8f3f',
    roughAlt: '#7a7c34',
    water: '#6f8f8a',
    waterDeep: '#4f6b68',
    waterLight: '#b4d1c9',
    hedge: '#7a4a2a',
    hedgeLight: '#a06a3d',
    hedgeDark: '#57331c',
    wallStyle: 'hay',
    decor: 'leaf',
    flower: '#f0a35c',
    flowerAlt: '#d97a3f',
    accent: '#e0a35c',
    flag: '#c9553f',
    night: 0.05,
    lush: 0.8,
  },
  moonlight: {
    ...BASE,
    id: 'moonlight',
    name: 'Moonlight Garden',
    grass: '#4d6f74',
    grassAlt: '#426266',
    rough: '#385456',
    roughAlt: '#2e4749',
    water: '#2f5f80',
    waterDeep: '#1f4460',
    waterLight: '#7fb2d4',
    hedge: '#263c50',
    hedgeLight: '#3a5872',
    hedgeDark: '#182839',
    wallStyle: 'hedge',
    decor: 'firefly',
    flower: '#cfe0ff',
    flowerAlt: '#9fb6f0',
    accent: '#b7c8ff',
    flag: '#f2d27a',
    night: 0.42,
    lush: 0.7,
  },
  royal: {
    ...BASE,
    id: 'royal',
    name: 'Royal Garden',
    grass: '#86b168',
    grassAlt: '#74a05a',
    rough: '#5f8a4a',
    roughAlt: '#527a40',
    water: '#4f9fbc',
    waterDeep: '#357d97',
    waterLight: '#a2dcea',
    hedge: '#3f6b3f',
    hedgeLight: '#5f9155',
    hedgeDark: '#2c4f2e',
    wallStyle: 'topiary',
    decor: 'rose',
    flower: '#ffd7e3',
    flowerAlt: '#e89ab4',
    accent: '#e9d9a3',
    flag: '#c94f4f',
    night: 0.02,
    lush: 0.85,
  },
}

export function themeFor(id: ThemeId): Theme {
  return THEMES[id]
}

/** Ball / cup / aim colours shared by every garden. */
export const INK = {
  ball: '#ffffff',
  ballShade: '#d8dfe3',
  ballDimple: '#c2ccd2',
  cup: '#1d2620',
  cupRim: '#0f1511',
  aim: 'rgba(255,255,255,0.82)',
  aimSoft: 'rgba(255,255,255,0.35)',
  power: '#ffe08a',
  powerHot: '#ff8f5e',
  paper: '#fdf8ea',
  paperShade: '#e8dfc8',
  text: '#27321f',
}
