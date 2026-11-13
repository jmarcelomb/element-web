/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { rejectToast, closeReleaseAnnouncementIfExists } from "@element-hq/element-web-playwright-common";

import { type Page, expect } from "@playwright/test";

import { test } from "../../element-web-test";

test.describe("App lock", () => {
    test.use({ displayName: "Hanako" });

    test.beforeEach(async ({ page, app, user }) => {
        // Dismiss toasts so they don't block the user menu or settings dialog
        await rejectToast(page, "Verify this device");
        await rejectToast(page, "Notifications");
    });

    /** The top-most app lock dialog (a form asking for a code). */
    const codeDialog = (page: Page) =>
        page
            .locator(".mx_Dialog")
            .filter({ has: page.getByLabel("Code") })
            .last();

    const setCode = async (page: Page, code: string): Promise<void> => {
        const dialog = codeDialog(page);
        await dialog.getByLabel("Code").first().fill(code);
        await dialog.getByLabel("Confirm code").fill(code);
        await dialog.getByRole("button", { name: "OK" }).click();
    };

    test("should show the app lock section in security settings", async ({ app, page }) => {
        await app.settings.openUserSettings("Security");
        const tab = page.locator(".mx_UserSettingsDialog");
        await expect(tab.getByRole("heading", { name: "App lock" })).toBeVisible();
        await expect(tab.getByRole("button", { name: "Enable app lock" })).toBeVisible();
    });

    test("should lock the app and unlock with the code", async ({ app, page }) => {
        await app.settings.openUserSettings("Security");
        const tab = page.locator(".mx_UserSettingsDialog");

        await tab.getByRole("button", { name: "Enable app lock" }).click();
        await setCode(page, "1234");

        await tab.getByRole("button", { name: "Lock now" }).click();

        const lockScreen = page.getByTestId("app-lock-view");
        await expect(lockScreen).toBeVisible();

        // Wrong code shows an error and stays locked
        await lockScreen.getByLabel("Code").fill("0000");
        await lockScreen.getByRole("button", { name: "Unlock" }).click();
        await expect(lockScreen.getByRole("alert")).toContainText("Wrong code");

        // Correct code unlocks
        await lockScreen.getByLabel("Code").fill("1234");
        await lockScreen.getByRole("button", { name: "Unlock" }).click();
        await expect(lockScreen).not.toBeVisible();
    });

    test("should lock via the room header button", async ({ app, page }) => {
        // The lock button lives in the room header, so a room must be open
        await app.client.createRoom({ name: "App lock room" });
        await closeReleaseAnnouncementIfExists(page, "Introducing Sections");
        await app.viewRoomByName("App lock room");

        await app.settings.openUserSettings("Security");
        const tab = page.locator(".mx_UserSettingsDialog");

        await tab.getByRole("button", { name: "Enable app lock" }).click();
        await setCode(page, "1234");

        // Close settings so the room header is reachable and the header button is the only
        // "Lock now" button on screen
        await tab.getByRole("button", { name: "Close dialog", exact: true }).click();
        await expect(tab).not.toBeVisible();

        await page.getByRole("button", { name: "Lock now" }).click();

        const lockScreen = page.getByTestId("app-lock-view");
        await expect(lockScreen).toBeVisible();

        await lockScreen.getByLabel("Code").fill("1234");
        await lockScreen.getByRole("button", { name: "Unlock" }).click();
        await expect(lockScreen).not.toBeVisible();
    });

    test("should lock the app on startup when enabled", async ({ app, page }) => {
        await app.settings.openUserSettings("Security");
        const tab = page.locator(".mx_UserSettingsDialog");

        await tab.getByRole("button", { name: "Enable app lock" }).click();
        await setCode(page, "1234");

        // Wait for enable() to complete (the verifier write involves 600k PBKDF2 iterations)
        // before reloading, or the startup lock may not find its state persisted yet.
        await expect(tab.getByRole("button", { name: "Lock now" })).toBeVisible();

        // Reload: the app must come back locked.
        await page.reload();
        const lockScreen = page.getByTestId("app-lock-view");
        await expect(lockScreen).toBeVisible();

        await lockScreen.getByLabel("Code").fill("1234");
        await lockScreen.getByRole("button", { name: "Unlock" }).click();
        await expect(lockScreen).not.toBeVisible();
    });
});
