/** @type {import('../BuffManager.ts').BuffManager['buffs']} */
export const buffs = [
  {
    type: '增伤',
    check: ({ avatar }) => avatar.element_type === 201,
    value: [0.1, 0.115, 0.13, 0.145, 0.16].map(v => v * 2),
    is: {
      team: true,
      stack: false
    }
  }
]