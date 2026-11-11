/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { logger } from "matrix-js-sdk/src/logger";

/**
 * Local verification of the app lock code.
 *
 * The code itself is never stored: we keep only a PBKDF2 verifier (salt + iteration count +
 * derived hash) in localStorage. This is a convenience lock against shoulder-surfing and casual
 * access, the same threat model as WhatsApp's app lock; it is not a substitute for the
 * homeserver session's own security.
 */

const STORAGE_KEY = "mx_app_lock_verifier";

/** PBKDF2-HMAC-SHA256 iteration count. 600k is the OWASP 2023 recommendation for SHA-256. */
export const PBKDF2_ITERATIONS = 600_000;

/** Minimum accepted code length. */
export const MIN_CODE_LENGTH = 4;

interface StoredVerifier {
    /** Format version, to allow changing the derivation in the future. */
    version: 1;
    salt: string; // base64
    iterations: number;
    hash: string; // base64
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Constant-time comparison of two byte arrays of equal length. */
export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

async function deriveHash(code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(code), { name: "PBKDF2" }, false, [
        "deriveBits",
    ]);
    const bits = await window.crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
        key,
        256,
    );
    return new Uint8Array(bits);
}

function readStoredVerifier(): StoredVerifier | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as StoredVerifier;
        if (
            parsed.version !== 1 ||
            !parsed.salt ||
            !parsed.hash ||
            // Guard against absurd iteration counts in a corrupt verifier; deriveBits would
            // either throw or hang on them.
            !Number.isInteger(parsed.iterations) ||
            parsed.iterations < 1 ||
            parsed.iterations > 100_000_000
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/** Returns true if an app lock code has been set on this device. */
export function hasAppLockCode(): boolean {
    return readStoredVerifier() !== null;
}

/** Returns true if the code meets the length requirement. */
export function isValidCodeLength(code: string): boolean {
    return code.length >= MIN_CODE_LENGTH;
}

/**
 * Stores the verifier for a new code, replacing any existing one.
 * The caller is responsible for having authorised the change (e.g. by checking the current code).
 */
export async function setAppLockCode(code: string): Promise<void> {
    if (!isValidCodeLength(code)) {
        throw new Error(`App lock code must be at least ${MIN_CODE_LENGTH} characters`);
    }
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveHash(code, salt, PBKDF2_ITERATIONS);
    const stored: StoredVerifier = {
        version: 1,
        salt: toBase64(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: toBase64(hash),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/** Removes the stored verifier. The caller is responsible for having authorised the change. */
export function clearAppLockCode(): void {
    localStorage.removeItem(STORAGE_KEY);
}

/** Checks a code against the stored verifier. Resolves false when no code is set. */
export async function verifyAppLockCode(code: string): Promise<boolean> {
    const stored = readStoredVerifier();
    if (!stored) return false;
    try {
        const salt = fromBase64(stored.salt);
        const expected = fromBase64(stored.hash);
        const actual = await deriveHash(code, salt, stored.iterations);
        return constantTimeEquals(actual, expected);
    } catch (e) {
        // A corrupt verifier (bad base64, absurd iteration count) must not throw out of here:
        // the lock screen would be stuck with a busy spinner. Fail the check instead.
        logger.warn("Failed to verify app lock code against the stored verifier", e);
        return false;
    }
}
