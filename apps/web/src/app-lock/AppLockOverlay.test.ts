/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import AppLock, { AppLockState } from "./AppLock";
import AppLockOverlay from "./AppLockOverlay";

vi.mock("./dispatcher/dispatcher", () => ({
    default: {
        dispatch: vi.fn(),
        register: vi.fn().mockReturnValue("1"),
        unregister: vi.fn(),
    },
}));

vi.mock("../Modal", () => ({
    default: {
        forceCloseAllModals: vi.fn(),
    },
}));

// The lock screen view itself is covered by the shared-components tests and the view model by
// its own unit test; stub the view model so the shared-components package stays unmocked.
vi.mock("../viewmodels/app-lock/AppLockViewModel", () => ({
    AppLockViewModel: class {
        public dispose(): void {}
    },
}));

const bodyOverlays = (): Element[] => Array.from(document.body.querySelectorAll('[data-testid="app-lock-overlay"]'));

describe("AppLockOverlay", () => {
    let appLockState: AppLockState;
    let listeners: Array<() => void>;

    beforeEach(() => {
        document.body.innerHTML = "";
        appLockState = AppLockState.Disabled;
        listeners = [];

        vi.spyOn(AppLock, "getState").mockImplementation(() => appLockState);
        vi.spyOn(AppLock, "subscribe").mockImplementation((listener) => {
            listeners.push(listener);
            return () => {
                listeners = listeners.filter((l) => l !== listener);
            };
        });

        AppLockOverlay.start();
    });

    afterEach(() => {
        AppLockOverlay.stop();
        vi.restoreAllMocks();
    });

    /** Emulates the controller emitting a state change. */
    const setState = (state: AppLockState): void => {
        appLockState = state;
        for (const listener of listeners) listener();
    };

    it("mounts the lock screen when the app locks and removes it on unlock", () => {
        expect(bodyOverlays()).toHaveLength(0);

        setState(AppLockState.Locked);
        expect(bodyOverlays()).toHaveLength(1);

        setState(AppLockState.Unlocked);
        expect(bodyOverlays()).toHaveLength(0);
    });

    it("does not mount twice while locked", () => {
        setState(AppLockState.Locked);
        setState(AppLockState.Locked);

        expect(bodyOverlays()).toHaveLength(1);
    });

    it("leaves exactly one container per mount and cleans up across lock/unlock cycles", () => {
        setState(AppLockState.Locked);
        setState(AppLockState.Unlocked);
        setState(AppLockState.Locked);
        setState(AppLockState.Unlocked);

        expect(bodyOverlays()).toHaveLength(0);
    });

    it("marks the app root inert while locked", () => {
        const appRoot = document.createElement("div");
        appRoot.id = "matrixchat";
        document.body.appendChild(appRoot);

        setState(AppLockState.Locked);
        expect(appRoot.hasAttribute("inert")).toBe(true);

        setState(AppLockState.Unlocked);
        expect(appRoot.hasAttribute("inert")).toBe(false);
    });
});
