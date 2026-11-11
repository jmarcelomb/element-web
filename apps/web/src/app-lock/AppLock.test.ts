/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import AppLock, { AppLockState } from "./AppLock";
import * as verifier from "./verifier";
import dis from "../dispatcher/dispatcher";
import SettingsStore from "../settings/SettingsStore";
import { SettingLevel } from "../settings/SettingLevel";
import { Action } from "../dispatcher/actions";

vi.mock("../dispatcher/dispatcher", () => ({
    default: {
        dispatch: vi.fn(),
        register: vi.fn().mockReturnValue(1),
        unregister: vi.fn(),
    },
}));

vi.mock("../Modal", () => ({
    default: {
        forceCloseAllModals: vi.fn(),
    },
}));

// Real verifier, but operate directly on its storage helpers so tests don't pay the 600k
// PBKDF2 iterations for every scenario.
vi.mock("./verifier", async (importOriginal) => {
    const original = await importOriginal<typeof import("./verifier")>();
    return {
        ...original,
        setAppLockCode: vi.fn().mockResolvedValue(undefined),
        verifyAppLockCode: vi.fn().mockResolvedValue(true),
        clearAppLockCode: vi.fn(),
    };
});

type DispatcherCallback = (payload: { action: string }) => void;

let dispatcherCallback: DispatcherCallback;
let appLockEnabled = false;

const flushPromises = async (): Promise<void> => await new Promise(process.nextTick);

const emitUserActivity = (): void => {
    dispatcherCallback({ action: Action.UserActivity });
};

const advancePastTimeout = async (): Promise<void> => {
    vi.advanceTimersByTime(3_600_000 + 1);
    await flushPromises();
};

describe("AppLock", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        localStorage.clear();
        appLockEnabled = false;
        dispatcherCallback = vi.fn();

        vi.mocked(dis.register).mockImplementation((cb: DispatcherCallback) => {
            dispatcherCallback = cb;
            return "1";
        });
        vi.spyOn(SettingsStore, "getValue").mockImplementation((name) =>
            name === "appLockEnabled" ? appLockEnabled : "1h",
        );
        vi.spyOn(SettingsStore, "setValue").mockImplementation(async (_name, _room, _level, value) => {
            appLockEnabled = value === true;
        });
        // Watchers registered by AppLock.start(), by setting name, so tests can simulate changes.
        settingsWatchers = {};
        vi.spyOn(SettingsStore, "watchSetting").mockImplementation((settingName: string, _roomId, callbackFn) => {
            (settingsWatchers[settingName] ??= []).push(callbackFn as () => void);
            return "watcher";
        });
        vi.spyOn(SettingsStore, "unwatchSetting").mockReturnValue(undefined);
    });

    let settingsWatchers: Record<string, Array<() => void>>;

    const emitSettingChange = (name: string): void => {
        for (const cb of settingsWatchers[name] ?? []) cb();
    };

    afterEach(async () => {
        AppLock.stop();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const storedCodeOn = (): void => {
        // Pretend a code is set without running PBKDF2.
        localStorage.setItem(
            "mx_app_lock_verifier",
            JSON.stringify({ version: 1, salt: "c2FsdA==", iterations: 1, hash: "aGFzaA==" }),
        );
    };

    it("starts disabled when the setting is off", () => {
        AppLock.start();
        expect(AppLock.getState()).toBe(AppLockState.Disabled);
    });

    it("starts locked when enabled with a stored code", () => {
        appLockEnabled = true;
        storedCodeOn();

        AppLock.start();

        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("locks when the idle timer elapses after unlocking", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(true);

        await AppLock.unlock("1234");
        expect(AppLock.getState()).toBe(AppLockState.Unlocked);

        emitUserActivity(); // keep it unlocked
        vi.advanceTimersByTime(1000);
        emitUserActivity(); // restart
        await advancePastTimeout();

        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("does not re-lock while the user is active", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        await AppLock.unlock("1234");

        for (let i = 0; i < 5; i++) {
            emitUserActivity();
            vi.advanceTimersByTime(1_800_000); // 30 min of activity per tick
        }

        expect(AppLock.getState()).toBe(AppLockState.Unlocked);
    });

    it("rejects a wrong code and stays locked", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(false);

        expect(await AppLock.unlock("9999")).toBe(false);
        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("enabling stores the code, switches the setting on and starts unlocked", async () => {
        AppLock.start();
        vi.mocked(verifier.setAppLockCode).mockImplementation(async () => {
            localStorage.setItem(
                "mx_app_lock_verifier",
                JSON.stringify({ version: 1, salt: "c2FsdA==", iterations: 1, hash: "aGFzaA==" }),
            );
        });

        await AppLock.enable("1234");

        expect(SettingsStore.setValue).toHaveBeenCalledWith("appLockEnabled", null, SettingLevel.DEVICE, true);
        expect(AppLock.getState()).toBe(AppLockState.Unlocked);
    });

    it("disable verifies the code, clears it and switches the setting off", async () => {
        appLockEnabled = true;
        storedCodeOn();
        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(true);
        AppLock.start();
        await AppLock.unlock("1234");

        expect(await AppLock.disable("1234")).toBe(true);

        expect(verifier.clearAppLockCode).toHaveBeenCalled();
        expect(SettingsStore.setValue).toHaveBeenCalledWith("appLockEnabled", null, SettingLevel.DEVICE, false);
        expect(AppLock.getState()).toBe(AppLockState.Disabled);
    });

    it("disable keeps everything unchanged on a wrong code", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(false);

        expect(await AppLock.disable("9999")).toBe(false);
        expect(verifier.clearAppLockCode).not.toHaveBeenCalled();
        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("self-heals to disabled when enabled but no code is stored", () => {
        appLockEnabled = true;

        AppLock.start();

        expect(SettingsStore.setValue).toHaveBeenCalledWith("appLockEnabled", null, SettingLevel.DEVICE, false);
        expect(AppLock.getState()).toBe(AppLockState.Disabled);
    });

    it("locks immediately when lock() is called", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        await AppLock.unlock("1234");

        AppLock.lock();

        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("verifyCode checks the code even while unlocked (settings gate)", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        await AppLock.unlock("1234");

        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(false);
        expect(await AppLock.verifyCode("whatever")).toBe(false);

        vi.mocked(verifier.verifyAppLockCode).mockResolvedValue(true);
        expect(await AppLock.verifyCode("1234")).toBe(true);
    });

    it("re-arms the idle timer when the timeout setting shrinks while unlocked", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        await AppLock.unlock("1234");

        // Switch the timeout from 1h to 1m without user activity since the unlock.
        vi.spyOn(SettingsStore, "getValue").mockImplementation((name) =>
            name === "appLockEnabled" ? appLockEnabled : "1m",
        );
        emitSettingChange("appLockTimeout");

        // 59 minutes in, the new 1m timeout must already have fired.
        vi.advanceTimersByTime(60_000 + 1);
        await flushPromises();

        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("keeps the app locked when setCode lands after an idle lock", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        let resolveSet: () => void = () => {};
        vi.mocked(verifier.setAppLockCode).mockReturnValue(
            new Promise<void>((resolve) => {
                resolveSet = resolve;
            }),
        );
        const pending = AppLock.setCode("5678");

        // The idle timer locks the app while the code is being stored.
        await advancePastTimeout();
        expect(AppLock.getState()).toBe(AppLockState.Locked);

        resolveSet();
        await pending;

        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });

    it("keeps the app locked when disable lands after an idle lock", async () => {
        appLockEnabled = true;
        storedCodeOn();
        AppLock.start();
        await AppLock.unlock("1234");

        let resolveVerify: (ok: boolean) => void = () => {};
        vi.mocked(verifier.verifyAppLockCode).mockReturnValue(
            new Promise<boolean>((resolve) => {
                resolveVerify = resolve;
            }),
        );
        const pending = AppLock.disable("1234");

        // Idle lock fires while the code is being verified.
        vi.advanceTimersByTime(3_600_000 + 1);
        await flushPromises();
        expect(AppLock.getState()).toBe(AppLockState.Locked);

        resolveVerify(true);
        expect(await pending).toBe(false);
        expect(verifier.clearAppLockCode).not.toHaveBeenCalled();
        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });
});
