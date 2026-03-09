import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { ConfigurationPage } from './page-models/configuration-page';
import { Navigation } from './page-models/navigation';
import type { SchedulesPage } from './page-models/schedules-page';

test.describe('Schedules', () => {
  let page: Page;
  let navigation: Navigation;
  let schedulesPage: SchedulesPage;
  let configurationPage: ConfigurationPage;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    navigation = new Navigation(page);
    configurationPage = new ConfigurationPage(page);

    await page.goto('/');
    await configurationPage.createTestFile();

    schedulesPage = await navigation.goToSchedulesPage();
  });

  test.afterEach(async () => {
    await page?.close();
  });

  test('checks the page visuals', async () => {
    await expect(page).toMatchThemeScreenshots();
  });

  test('creates a new schedule, posts the transaction and later completes it', async () => {
    test.setTimeout(40000);

    const scheduleEditModal = await schedulesPage.addNewSchedule();
    await scheduleEditModal.fill({
      payee: 'Home Depot',
      account: 'HSBC',
      amount: 25,
    });
    await scheduleEditModal.add();

    const schedule = schedulesPage.getNthSchedule(2);
    await expect(schedule.payee).toHaveText('Home Depot');
    await expect(schedule.account).toHaveText('HSBC');
    await expect(schedule.amount).toHaveText('~25.00');
    await expect(schedule.status).toHaveText('Due');
    await expect(page).toMatchThemeScreenshots();

    await schedulesPage.postNthSchedule(2);
    await expect(schedulesPage.getNthSchedule(2).status).toHaveText('Paid');
    await expect(page).toMatchThemeScreenshots();

    // Go to transactions page
    const accountPage = await navigation.goToAccountPage('HSBC');
    const transaction = accountPage.getNthTransaction(0);
    await expect(transaction.payee).toHaveText('Home Depot');
    await expect(transaction.category).toHaveText('Categorize');
    await expect(transaction.debit).toHaveText('25.00');
    await expect(transaction.credit).toHaveText('');

    const icon = transaction.payee.getByTestId('schedule-icon');
    await icon.hover();
    await expect(page).toMatchThemeScreenshots();

    // go to rules page
    const rulesPage = await navigation.goToRulesPage();
    await rulesPage.searchFor('Home Depot');
    const rule = rulesPage.getNthRule(0);
    await expect(rule.actions).toHaveText([
      'link schedule Home Depot (2017-01-01)',
    ]);
    await expect(rule.conditions).toHaveText([
      'payee is Home Depot',
      'and account is HSBC',
      'and date is approx Every month on the 1st',
      'and amount is approx -25.00',
    ]);

    // Go back to schedules page
    await navigation.goToSchedulesPage();
    await schedulesPage.completeNthSchedule(2);
    await expect(schedulesPage.getNthScheduleRow(4)).toHaveText(
      'Show completed schedules',
    );
    await expect(page).toMatchThemeScreenshots();
  });

  test('creates two new schedules, posts both transactions and later completes one', async () => {
    test.setTimeout(40000);

    // Adding two schedules with the same payee and account and amount, mimicking two different subscriptions
    let scheduleEditModal = await schedulesPage.addNewSchedule();
    await scheduleEditModal.fill({
      payee: 'Apple',
      account: 'HSBC',
      amount: 5,
    });
    await scheduleEditModal.add();

    scheduleEditModal = await schedulesPage.addNewSchedule();
    await scheduleEditModal.fill({
      payee: 'Apple',
      account: 'HSBC',
      amount: 5,
    });
    await scheduleEditModal.add();

    const schedule = schedulesPage.getNthSchedule(2);
    await expect(schedule.payee).toHaveText('Apple');
    await expect(schedule.account).toHaveText('HSBC');
    await expect(schedule.amount).toHaveText('~5.00');
    await expect(schedule.status).toHaveText('Due');
    await expect(page).toMatchThemeScreenshots();

    const schedule2 = schedulesPage.getNthSchedule(3);
    await expect(schedule2.payee).toHaveText('Apple');
    await expect(schedule2.account).toHaveText('HSBC');
    await expect(schedule2.amount).toHaveText('~5.00');
    await expect(schedule2.status).toHaveText('Due');
    await expect(page).toMatchThemeScreenshots();

    await schedulesPage.postNthSchedule(2);
    await expect(schedulesPage.getNthSchedule(2).status).toHaveText('Paid');
    await expect(schedulesPage.getNthSchedule(3).status).toHaveText('Due');
    await expect(page).toMatchThemeScreenshots();

    await schedulesPage.postNthSchedule(3);
    await expect(schedulesPage.getNthSchedule(2).status).toHaveText('Paid');
    await expect(schedulesPage.getNthSchedule(3).status).toHaveText('Paid');
    await expect(page).toMatchThemeScreenshots();

    // Go to transactions page
    const accountPage = await navigation.goToAccountPage('HSBC');
    const transaction = accountPage.getNthTransaction(0);
    await expect(transaction.payee).toHaveText('Apple');
    await expect(transaction.category).toHaveText('Categorize');
    await expect(transaction.debit).toHaveText('5.00');
    await expect(transaction.credit).toHaveText('');

    // Go to transactions page
    const transaction2 = accountPage.getNthTransaction(1);
    await expect(transaction2.payee).toHaveText('Apple');
    await expect(transaction2.category).toHaveText('Categorize');
    await expect(transaction2.debit).toHaveText('5.00');
    await expect(transaction2.credit).toHaveText('');

    const icon = transaction.payee.getByTestId('schedule-icon');
    await icon.hover();
    await expect(page).toMatchThemeScreenshots();

    const icon2 = transaction2.payee.getByTestId('schedule-icon');
    await icon2.hover();
    await expect(page).toMatchThemeScreenshots();
  });

  test('creates a "full" list of schedules', async () => {
    // Schedules search shouldn't shrink with many schedules
    for (let i = 0; i < 10; i++) {
      const scheduleEditModal = await schedulesPage.addNewSchedule();
      await scheduleEditModal.fill({
        payee: 'Home Depot',
        account: 'HSBC',
        amount: 0,
      });
      await scheduleEditModal.add();
    }
    await expect(page).toMatchThemeScreenshots();
  });

  test('creates a schedule on the 31st and shows fallback dates for February and April', async () => {
    // Test that schedules for day 31 properly show February's last day as fallback
    // Since the test starts on Jan 1, 2017, a schedule for the 29th should show:
    // - Jan 31, 2017
    // - Feb 28, 2017 (fallback to last day since Feb doesn't have 31st)
    // - Mar 31, 2017
    // - Apr 30, 2017 (fallback to last day)
    await page.getByRole('button', { name: 'Change upcoming length' }).click();
    await page.getByRole('button', { name: 'week' }).click();
    await page.getByRole('button', { name: 'Custom length' }).click();
    await page.getByRole('button', { name: 'Days' }).click();
    await page.getByRole('button', { name: 'Years' }).click();

    await expect(page).toMatchThemeScreenshots();
    await page.getByRole('button', { name: 'Save' }).click();

    const scheduleEditModal = await schedulesPage.addNewSchedule();
    await scheduleEditModal.fill({
      scheduleName: 'Months without days',
      payee: 'Monthly Bill',
      account: 'HSBC',
      amount: 100,
      dayOfMonth: 31,
    });
    await expect(page).toMatchThemeScreenshots();

    // Verify the preview dates show February 28th as fallback (since 2017 is not a leap year)
    await scheduleEditModal.expectSchedulePreviewDatesToBe([
      '1/31/2017',
      '2/28/2017', // Fallback to last day of Feb
      '3/31/2017',
      '4/30/2017', // Fallback to last day of Apr
    ]);

    // Apply the recurring schedule and add
    await scheduleEditModal.applyRecurringSchedule();
    await expect(page).toMatchThemeScreenshots();
    await scheduleEditModal.add();

    const schedule = schedulesPage.getNthSchedule(4);
    await expect(schedule.payee).toHaveText('Monthly Bill');
    await expect(schedule.account).toHaveText('HSBC');
    await expect(schedule.date).toHaveText('01/31/2017');
    await expect(schedule.amount).toHaveText('~100.00');
    await expect(page).toMatchThemeScreenshots();
  });
});
