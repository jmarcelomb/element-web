/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
    clearAppLockCode,
    constantTimeEquals,
    hasAppLockCode,
    isValidCodeLength,
    PBKDF2_ITERATIONS,
    setAppLockCode,
    verifyAppLockCode,
} from "./verifier";

describe("app lock verifier", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe("constantTimeEquals", () => {
        it("matches identical arrays", () => {
            expect(constantTimeEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
        });

        it("does not match different arrays of the same length", () => {
            expect(constantTimeEquals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
        });

        it("does not match arrays of different lengths", () => {
            expect(constantTimeEquals(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
        });
    });

    describe("isValidCodeLength", () => {
        it("accepts codes of at least 4 characters", () => {
            expect(isValidCodeLength("1234")).toBe(true);
            expect(isValidCodeLength("longer code")).toBe(true);
        });

        it("rejects shorter codes", () => {
            expect(isValidCodeLength("123")).toBe(false);
            expect(isValidCodeLength("")).toBe(false);
        });
    });

    describe("setAppLockCode / hasAppLockCode / verifyAppLockCode", () => {
        it("stores a verifier and verifies the correct code", async () => {
            expect(hasAppLockCode()).toBe(false);

            await setAppLockCode("correct horse");

            expect(hasAppLockCode()).toBe(true);
            expect(await verifyAppLockCode("correct horse")).toBe(true);
        });

        it("rejects a wrong code", async () => {
            await setAppLockCode("1234");
            expect(await verifyAppLockCode("4321")).toBe(false);
        });

        it("returns false when no code is set", async () => {
            expect(await verifyAppLockCode("1234")).toBe(false);
        });

        it("stores a salted, iterated verifier rather than the code", async () => {
            await setAppLockCode("1234");
            const raw = localStorage.getItem("mx_app_lock_verifier")!;
            expect(raw).not.toContain("1234");

            const stored = JSON.parse(raw) as { salt: string; iterations: number; hash: string };
            expect(stored.iterations).toBe(PBKDF2_ITERATIONS);
            expect(stored.salt).not.toBe(stored.hash);
        });

        it("uses a fresh salt per code, so stored verifiers differ", async () => {
            await setAppLockCode("1234");
            const first = localStorage.getItem("mx_app_lock_verifier");
            await setAppLockCode("1234");
            const second = localStorage.getItem("mx_app_lock_verifier");
            expect(first).not.toBe(second);
        });

        it("rejects codes below the minimum length", async () => {
            await expect(setAppLockCode("123")).rejects.toThrow();
            expect(hasAppLockCode()).toBe(false);
        });
    });

    describe("clearAppLockCode", () => {
        it("removes the verifier", async () => {
            await setAppLockCode("1234");
            clearAppLockCode();
            expect(hasAppLockCode()).toBe(false);
            expect(await verifyAppLockCode("1234")).toBe(false);
        });
    });

    describe("corrupt stored verifier", () => {
        it("fails the check instead of throwing when the base64 is invalid", async () => {
            localStorage.setItem(
                "mx_app_lock_verifier",
                JSON.stringify({ version: 1, salt: "!!!not-base64!!!", iterations: 600_000, hash: "aGFzaA==" }),
            );
            expect(hasAppLockCode()).toBe(true);
            await expect(verifyAppLockCode("1234")).resolves.toBe(false);
        });

        it("treats an absurd iteration count as no verifier at all", () => {
            localStorage.setItem(
                "mx_app_lock_verifier",
                JSON.stringify({ version: 1, salt: "c2FsdA==", iterations: 1e12, hash: "aGFzaA==" }),
            );
            expect(hasAppLockCode()).toBe(false);
        });

        it("treats malformed JSON as no verifier at all", async () => {
            localStorage.setItem("mx_app_lock_verifier", "{not json");
            expect(hasAppLockCode()).toBe(false);
            await expect(verifyAppLockCode("1234")).resolves.toBe(false);
        });
    });
});
