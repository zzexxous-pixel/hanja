const { test, expect } = require('@playwright/test');
async function grade(page, value) {
    await page.locator('[data-action="open-grade-modal"]').click();
    await page.locator('#grade-grid-container').getByRole('button', {name: new RegExp(`^${value}\\s`)}).click();
    await expect(page.locator('#header-grade-title')).toHaveText(`바른한자 [${value}]`);
    await expect(page.locator('#grade-modal')).toBeHidden();
}
test.beforeEach(async ({ page }) => {
    // External writing/font services are not part of bookmark behavior.
    await page.route(/https:\/\//, route => route.abort());
});
test('legacy bookmark migrates without interaction and survives grade changes/reload', async ({ page }) => {
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.clear(); localStorage.setItem('hanja_grade', '4급');
            localStorage.setItem('hanja_bookmarks', '[0,0,9999]');
            sessionStorage.setItem('seeded', '1');
        }
    });
    await page.goto('./');
    await expect(page.locator('.star-wrapper-0')).toHaveClass(/\bstarred\b/);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hanja_bookmarks_v2')));
    expect(saved).toEqual({schemaVersion:2,characters:['價']});
    expect(await page.evaluate(() => localStorage.getItem('hanja_bookmarks'))).toBeNull();
    await grade(page, '8급');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hanja_bookmarks_v2')).characters)).toEqual(['價']);
    await grade(page, '4급');
    await page.reload();
    await expect(page.locator('.star-wrapper-0')).toHaveClass(/\bstarred\b/);
    await page.locator('.star-wrapper-0').click();
    await page.reload();
    await expect(page.locator('.star-wrapper-0')).toHaveClass(/\bunstarred\b/);
});
test('grade 3 page 13 is a normal page, not the favorites tab', async ({ page }) => {
    await page.goto('./'); await grade(page, '3급');
    for (let i=1; i<13; i++) await page.locator('#btn-next-page').click();
    await expect(page.locator('#page-indicator')).toHaveText('13 / 20');
    await expect(page.locator('.hanja-card-wrapper')).toHaveCount(50);
    await page.locator('#tab-7').click();
    await expect(page.locator('#page-indicator')).toHaveText('★ / 20');
    await expect(page.locator('#table-view-container')).toContainText('즐겨찾기 한자가 없습니다.');
});
