import type { Activity, ConsoleLine, Player, Stats, World } from './types'

export const stats: Stats = {
  online: 4,
  max: 20,
  tps: 20,
  uptime: '3d 7h',
  worlds: 3,
  version: 'Paper 26.3'
}

export const players: Player[] = [
  { name: 'Molly', pronouns: 'She/her', ping: 12, gamemode: 'survival', world: 'Survival', x: 128, y: 64, z: -412, health: 17 },
  { name: 'Aspen', pronouns: 'They/them', ping: 31, gamemode: 'creative', world: 'Free Build', x: -2048, y: 4, z: 512, health: 20 },
  { name: 'Juniper', pronouns: 'She/they', ping: 22, gamemode: 'survival', world: 'Survival', x: -96, y: 71, z: 233, health: 14 },
  { name: 'Rook', pronouns: 'He/him', ping: 48, gamemode: 'creative', world: 'Redstone Testing', x: 40, y: 4, z: -88, health: 20 }
]

export const worlds: World[] = [
  {
    id: 'world',
    name: 'Survival',
    kind: 'Vanilla terrain',
    difficulty: 'easy',
    border: 10000,
    players: 2,
    icon: 'pixelarticons:tree-pine'
  },
  {
    id: 'freebuild',
    name: 'Free Build',
    kind: 'Superflat · forced creative',
    difficulty: 'peaceful',
    border: 5000,
    players: 1,
    icon: 'pixelarticons:brush'
  },
  {
    id: 'redstone',
    name: 'Redstone Testing',
    kind: 'Superflat · forced creative',
    difficulty: 'peaceful',
    border: 500,
    players: 1,
    icon: 'pixelarticons:circuit-board'
  }
]

export const activity: Activity[] = [
  { time: '19:05', text: 'Rook joined the game' },
  { time: '19:04', text: 'Aspen switched to Free Build (creative)' },
  { time: '19:01', text: 'Juniper joined the game' },
  { time: '18:58', text: 'Molly set time to day in Survival' },
  { time: '18:52', text: 'Backup completed (worlds · 412 MB)' }
]

export const consoleLines: ConsoleLine[] = [
  { time: '19:02:11', level: 'info', text: 'Starting minecraft server version 26.3' },
  { time: '19:02:29', level: 'info', text: 'Preparing level "world"' },
  { time: '19:02:31', level: 'info', text: 'Done (20.114s)! For help, type "help"' },
  { time: '19:04:02', level: 'join', text: 'Molly joined the game' },
  { time: '19:04:19', level: 'warn', text: "Can't keep up! Running 2143ms behind" },
  { time: '19:05:44', level: 'join', text: 'Rook joined the game' }
]
