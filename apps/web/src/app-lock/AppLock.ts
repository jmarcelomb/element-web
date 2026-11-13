/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { logger } from "matrix-js-sdk/src/logger";

import { Action } from "../dispatcher/actions.ts";
import dis from "../dispatcher/dispatcher";
import { type ActionPayload } from "../dispatcher/payloads";
import Modal from "../Modal";
import { SettingLevel } from "../settings/SettingLevel.ts";
import SettingsStore from "../settings/SettingsStore.ts";
import Timer from "../utils/Timer";
import { clearAppLockCode, hasAppLockCode, setAppLockCode, verifyAppLockCode } from "./verifier.ts";

export enum AppLockState {
    /** App lock is off (not enabled, or enabled without a code). */
    Disabled = "disabled",
    /** App lock is on and the app is currently usable. */
    Unlocked = "unlocked",
    /** App lock is on and the lock screen is showing. */
    Locked = "locked",
}

/** Auto-lock timeout options, in ms. Keys match the `appLockTimeout` setting values. */
const TIMEOUTS_MS: Record<"1m" | "15m" | "1h" | "8h", number> = {
    "1m": 60_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "8h": 28_800_000,
};

class AppLock {
    private state: AppLockState = AppLockState.Disabled;
    private timer?: Timer;
    private dispatcherRef?: string;
    private watchers: string[] = [];
    private listeners = new Set<() => void>();

    /**
     * Starts the app lock controller: locks the app straight away if enabled (WhatsApp starts
     * locked too), then re-locks after the configured inactivity timeout.
     */
    public start(): void {
        this.dispatcherRef = dis.register(this.onAction);
        this.watchers.push(SettingsStore.watchSetting("appLockEnabled", null, this.onSettingChanged));
        this.watchers.push(SettingsStore.watchSetting("appLockTimeout", null, this.onSettingChanged));

        if (this.enabledSetting() && hasAppLockCode()) {
            this.lock();
        } else if (this.enabledSetting() && !hasAppLockCode()) {
            // Inconsistent state (code was cleared underneath us): self-heal to disabled.
            // The resulting setting change re-enters via syncState.
            logger.warn("App lock is enabled but no code is stored; disabling app lock");
            void SettingsStore.setValue("appLockEnabled", null, SettingLevel.DEVICE, false);
        }
    }

    public stop(): void {
        if (this.dispatcherRef !== undefined) {
            dis.unregister(this.dispatcherRef);
            this.dispatcherRef = undefined;
        }
        for (const watcher of this.watchers) {
            SettingsStore.unwatchSetting(watcher);
        }
        this.watchers = [];
        this.timer?.abort();
        this.timer = undefined;
        this.state = AppLockState.Disabled;
        this.emit();
    }

    public getState = (): AppLockState => {
        return this.state;
    };

    /** Subscribes to state changes, for useSyncExternalStore. Returns an unsubscribe function. */
    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /** Locks the app immediately. Open dialogs are closed so nothing stays reachable. */
    public lock = (): void => {
        if (this.state === AppLockState.Locked) return;
        this.timer?.abort();
        this.timer = undefined;
        this.state = AppLockState.Locked;
        Modal.forceCloseAllModals();
        this.emit();
    };

    /**
     * Verifies a code against the stored verifier, regardless of the current lock state. This is
     * the primitive for authorising settings changes (change code, disable, re-enable);
     * {@link unlock} is the lock-screen path and short-circuits when not locked.
     */
    public verifyCode = async (code: string): Promise<boolean> => {
        return verifyAppLockCode(code);
    };

    /** Checks the code and unlocks the app. Returns false (and stays locked) on a wrong code. */
    public unlock = async (code: string): Promise<boolean> => {
        if (this.state !== AppLockState.Locked) return true;
        const ok = await verifyAppLockCode(code);
        if (!ok) return false;
        this.state = AppLockState.Unlocked;
        this.restartTimer();
        this.emit();
        return true;
    };

    /**
     * Turns app lock on with the given code. The app is left unlocked; the idle timer applies
     * from now, and the app will start locked on the next launch.
     */
    public enable = async (code: string): Promise<void> => {
        await setAppLockCode(code);
        // The hash derivation takes long enough that the idle timer can lock the app mid-flight;
        // in that case the dialog was already force-closed and this submission is stale.
        if (this.state === AppLockState.Locked) return;
        await SettingsStore.setValue("appLockEnabled", null, SettingLevel.DEVICE, true);
        this.state = AppLockState.Unlocked;
        this.restartTimer();
        this.emit();
    };

    /**
     * Sets a new code, keeping app lock enabled. The caller must have verified the current code
     * (or be in a setup flow where no code existed yet).
     */
    public setCode = async (code: string): Promise<void> => {
        await setAppLockCode(code);
        if (this.state === AppLockState.Disabled) {
            this.state = AppLockState.Unlocked;
            this.restartTimer();
        }
        this.emit();
    };

    /**
     * Turns app lock off after checking the current code. Returns false (and changes nothing)
     * on a wrong code.
     */
    public disable = async (currentCode: string): Promise<boolean> => {
        const ok = await verifyAppLockCode(currentCode);
        if (!ok) return false;
        // Same mid-flight race as enable(): the idle timer locked the app while the code was
        // being checked, so the dialog was force-closed and the change must not proceed.
        if (this.state === AppLockState.Locked) return false;
        clearAppLockCode();
        await SettingsStore.setValue("appLockEnabled", null, SettingLevel.DEVICE, false);
        this.timer?.abort();
        this.timer = undefined;
        this.state = AppLockState.Disabled;
        this.emit();
        return true;
    };

    /** The configured auto-lock timeout in ms. */
    public get timeoutMs(): number {
        const value = SettingsStore.getValue("appLockTimeout");
        return TIMEOUTS_MS[value] ?? TIMEOUTS_MS["1h"];
    }

    private enabledSetting(): boolean {
        return SettingsStore.getValue("appLockEnabled");
    }

    private restartTimer(): void {
        this.timer?.abort();
        this.timer = new Timer(this.timeoutMs).start();
        void this.timer.finished().then(
            () => {
                this.lock();
            },
            () => {
                /* aborted */
            },
        );
    }

    private onAction = (payload: ActionPayload): void => {
        if (payload.action === Action.UserActivity && this.state === AppLockState.Unlocked) {
            this.timer?.restart();
        }
    };

    private onSettingChanged = (): void => {
        const active = this.enabledSetting() && hasAppLockCode();
        if (!active && this.state !== AppLockState.Disabled) {
            this.timer?.abort();
            this.timer = undefined;
            this.state = AppLockState.Disabled;
            this.emit();
        } else if (active && this.state === AppLockState.Disabled) {
            this.state = AppLockState.Unlocked;
            this.restartTimer();
            this.emit();
        } else if (active && this.state === AppLockState.Unlocked) {
            // A pending timeout handle keeps its original duration; re-arm it so a shorter
            // timeout applies immediately.
            this.timer?.changeTimeout(this.timeoutMs);
        }
    };

    private emit(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

export default new AppLock();
