import { backOut, cubicIn } from 'svelte/easing'

export function popIn(_node: Element) {
  return {
    duration: 360,
    easing: backOut,
    css: (t: number) =>
      `opacity: ${t}; transform: translateY(${(1 - t) * 16}px) scale(${0.97 + t * 0.03})`
  }
}

export function popOut(_node: Element) {
  return {
    duration: 150,
    easing: cubicIn,
    css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 10}px) scale(${0.98 + t * 0.02})`
  }
}
