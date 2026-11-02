import Phaser from 'phaser'
import './ui/styles.css'
import { App } from './app'
import { audio } from './game/audio'
import { bus } from './game/bus'
import { GolfScene } from './game/scene'
import { UI } from './ui/ui'

const root = document.getElementById('ui')
if (!root) throw new Error('UI root missing')

const ui = new UI(root)
const app = new App()
app.attachUI(ui)

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 640,
  backgroundColor: '#122018',
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    // The CSS layer centres the canvas in a flex parent. Letting Phaser add its
    // own margins on top of that double-centres the board in narrow windows.
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [GolfScene],
})

bus.on('scene:ready', () => {
  const scene = game.scene.getScene('golf') as GolfScene
  app.attachScene(scene)
})

// Browsers only allow audio after a gesture; unlock on the first one.
window.addEventListener('pointerdown', () => audio.unlock(), { passive: true })
window.addEventListener('keydown', () => audio.unlock())

document.addEventListener('contextmenu', (event) => {
  if ((event.target as HTMLElement | null)?.closest('#game')) event.preventDefault()
})

// Keep the canvas crisp when the window changes size or orientation. Phaser's
// own polling misses some programmatic resizes, so measure the container here
// and push the size in before refreshing.
const container = document.getElementById('game')
const resize = (): void => {
  if (!container) return
  const width = container.clientWidth
  const height = container.clientHeight
  if (width > 0 && height > 0) game.scale.setParentSize(width, height)
  game.scale.refresh()
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => window.setTimeout(resize, 250))
if (container && typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(resize).observe(container)
}
window.setTimeout(resize, 200)

document.getElementById('boot')?.remove()

declare global {
  interface Window {
    miniGolfGarden?: { app: App }
  }
}

// A small hook for debugging and for the Playwright smoke test.
window.miniGolfGarden = { app }
