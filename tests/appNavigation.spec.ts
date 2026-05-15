import { test, expect } from './fixtures';
import { ROUTES } from '../src/constants';

test.describe('navigating app', () => {
  test('overview page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Overview}`);
    await expect(page.getByRole('heading', { name: 'Reliability Control Plane' }).first()).toBeVisible();
  });

  test('services page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Services}`);
    await expect(page.getByRole('heading', { name: 'Services' }).first()).toBeVisible();
  });

  test('incidents page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Incidents}`);
    await expect(page.getByRole('heading', { name: 'Incidents' }).first()).toBeVisible();
  });

  test('overview links navigate to foundation pages', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Overview}`);
    await page.getByRole('link', { name: 'View services' }).click();
    await expect(page.getByRole('heading', { name: 'Services' }).first()).toBeVisible();
  });
});
