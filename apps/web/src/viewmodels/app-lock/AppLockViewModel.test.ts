/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { describe, expect, it, vi } from "vitest";

import { AppLockViewModel } from "./AppLockViewModel";

describe("AppLockViewModel", () => {
    const makeVm = (unlock = vi.fn().mockResolvedValue(true)) =>
        new AppLockViewModel({ appLock: { unlock }, brand: "Element" });

    it("starts with no error and not busy", () => {
        const vm = makeVm();
        expect(vm.getSnapshot()).toEqual({ brand: "Element", error: null, busy: false });
        vm.dispose();
    });

    it("clears the error and sets busy while checking the code, then resets after success", async () => {
        const unlock = vi.fn().mockImplementation(
            () =>
                new Promise<boolean>((resolve) => {
                    // Snapshot while the check is in flight.
                    expect(vm.getSnapshot()).toEqual({ brand: "Element", error: null, busy: true });
                    resolve(true);
                }),
        );
        const vm = new AppLockViewModel({ appLock: { unlock }, brand: "Element" });

        await vm.submitCode("1234");

        expect(unlock).toHaveBeenCalledWith("1234");
        expect(vm.getSnapshot().busy).toBe(false);
        expect(vm.getSnapshot().error).toBe(null);
        vm.dispose();
    });

    it("shows an error when the code is wrong", async () => {
        const vm = makeVm(vi.fn().mockResolvedValue(false));

        await vm.submitCode("0000");

        expect(vm.getSnapshot().error).toBeTruthy();
        expect(vm.getSnapshot().busy).toBe(false);
        vm.dispose();
    });

    it("ignores submissions while a check is in flight", async () => {
        let resolveUnlock: (ok: boolean) => void = () => {};
        const unlock = vi.fn().mockReturnValue(
            new Promise<boolean>((resolve) => {
                resolveUnlock = resolve;
            }),
        );
        const vm = new AppLockViewModel({ appLock: { unlock }, brand: "Element" });

        const first = vm.submitCode("1111");
        await vm.submitCode("2222");
        resolveUnlock(true);
        await first;

        expect(unlock).toHaveBeenCalledExactlyOnceWith("1111");
        vm.dispose();
    });

    it("does not update the snapshot after disposal", async () => {
        let resolveUnlock: (ok: boolean) => void = () => {};
        const vm = makeVm(
            vi.fn().mockReturnValue(
                new Promise<boolean>((resolve) => {
                    resolveUnlock = resolve;
                }),
            ),
        );
        const pending = vm.submitCode("1234");
        vm.dispose();
        resolveUnlock(true);
        await pending;

        // The post-dispose merge is skipped: the snapshot keeps the in-flight state.
        expect(vm.getSnapshot().busy).toBe(true);
        expect(vm.getSnapshot().error).toBe(null);
    });
});
