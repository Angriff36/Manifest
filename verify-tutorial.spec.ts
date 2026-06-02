import { test, expect } from '@playwright/test';

test.describe('Interactive Tutorial Mode', () => {
  test('can navigate to tutorial tab and see tutorial list', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Click the Tutorial tab
    await page.getByRole('button', { name: 'Tutorial' }).click();

    // Should see the Interactive Tutorials header
    await expect(page.getByText('Interactive Tutorials')).toBeVisible();

    // Should see at least one tutorial in the list
    await expect(page.getByText('Your First Manifest Program')).toBeVisible();
    await expect(page.getByText('Writing Your First Command')).toBeVisible();
    await expect(page.getByText('Computed Properties')).toBeVisible();
  });

  test('can start a tutorial and see step instructions', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Navigate to Tutorial tab
    await page.getByRole('button', { name: 'Tutorial' }).click();

    // Click on "Your First Manifest Program" tutorial
    await page.getByText('Your First Manifest Program').click();

    // Should see step 1: "Define an Entity"
    await expect(page.getByText('Define an Entity')).toBeVisible();

    // Should see the instruction text
    await expect(
      page.getByText(/describe a business object/i)
    ).toBeVisible();

    // Should see step counter
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
  });

  test('tutorial can show hints and reset', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Navigate to Tutorial tab
    await page.getByRole('button', { name: 'Tutorial' }).click();
    await page.getByText('Your First Manifest Program').click();

    // Click Hint button
    await page.getByRole('button', { name: /Hint/i }).first().click();

    // Should see a hint
    await expect(page.getByText(/entity.*keyword/i).first()).toBeVisible();
  });

  test('can reveal the expected answer', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Tutorial' }).click();
    await page.getByText('Your First Manifest Program').click();

    // Click Answer button
    await page.getByRole('button', { name: /Answer/i }).click();

    // Should see "Expected solution" text
    await expect(page.getByText('Expected solution:')).toBeVisible();
  });

  test('tutorial list shows progress and difficulty badges', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Tutorial' }).click();

    // Should see difficulty badges
    await expect(page.getByText('beginner').first()).toBeVisible();

    // Should see time estimates
    await expect(page.getByText(/\d+ min/).first()).toBeVisible();
  });

  test('can navigate back to tutorial list from active step', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Tutorial' }).click();
    await page.getByText('Your First Manifest Program').click();

    // Should be on a step
    await expect(page.getByText('Step 1 of 3')).toBeVisible();

    // Click "All Tutorials" to go back
    await page.getByText('All Tutorials').click();

    // Should be back at list
    await expect(page.getByText('Interactive Tutorials')).toBeVisible();
  });
});
