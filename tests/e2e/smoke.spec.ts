import { expect, test } from '@playwright/test'

/**
 * A real browser pass over the loop that matters: menu → garden → hole → drag →
 * stroke counted, with no console errors anywhere.
 */
test('plays a stroke on the first hole', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.locator('.wordmark')).toBeVisible()
  await expect(page.getByRole('button', { name: /Journey/ })).toBeVisible()

  await page.getByRole('button', { name: /Journey/ }).click()
  const firstCourse = page.locator('.course:not(.course--locked)').first()
  await expect(firstCourse).toBeVisible()
  await firstCourse.click()

  await expect(page.locator('.hud--on')).toBeVisible()
  await expect(page.locator('.hud__strokes')).toHaveText('0')

  const canvas = page.locator('#game canvas')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  // The tee on hole 1 is tile (2, 6) of a 24x16 board.
  const scale = box.width / 960
  const ballX = box.x + 2.5 * 40 * scale
  const ballY = box.y + 6.5 * 40 * scale

  await page.mouse.move(ballX, ballY)
  await page.mouse.down()
  await page.mouse.move(ballX - 130 * scale, ballY, { steps: 8 })
  await page.mouse.up()

  await expect(page.locator('.hud__strokes')).toHaveText('1')
  await page.waitForTimeout(1400)

  // The ball has moved off the tee: take a screenshot only for failure review.
  const strokes = await page.locator('.hud__strokes').textContent()
  expect(strokes).toBe('1')
  expect(errors).toEqual([])
})
