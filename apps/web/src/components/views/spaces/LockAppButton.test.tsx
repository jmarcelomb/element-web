/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE in the repository root for full details.
 */

// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import React from "react";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";

import LockAppButton from "./LockAppButton";
import AppLock, { AppLockState } from "../../../app-lock/AppLock";
import * as verifier from "../../../app-lock/verifier";

// Real verifier, but operate directly on its storage helpers so tests don't pay the 600k
// PBKDF2 iterations for every scenario.
vi.mock("../../../app-lock/verifier", async (importOriginal) => {
    const original = await importOriginal<typeof import("../../../app-lock/verifier")>();
    return {
        ...original,
        setAppLockCode: vi.fn().mockResolvedValue(undefined),
        verifyAppLockCode: vi.fn().mockResolvedValue(true),
        clearAppLockCode: vi.fn(),
    };
});

describe("<LockAppButton />", () => {
    beforeEach(() => {
        // vi.resetAllMocks() in afterEach disarms the module-level verifier mocks; re-arm them.
        vi.mocked(verifier.setAppLockCode).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.resetAllMocks();
        AppLock.stop();
    });

    it("renders nothing when app lock is disabled", () => {
        const { container } = render(<LockAppButton isPanelCollapsed={true} />);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByLabelText("Lock now")).toBeNull();
    });

    it("renders the lock button when app lock is enabled", async () => {
        await AppLock.setCode("1234");
        render(<LockAppButton isPanelCollapsed={true} />);
        expect(screen.getByLabelText("Lock now")).toBeInTheDocument();
    });

    it("locks the app when clicked", async () => {
        const user = userEvent.setup();
        await AppLock.setCode("1234");
        render(<LockAppButton isPanelCollapsed={true} />);

        await user.click(screen.getByLabelText("Lock now"));
        expect(AppLock.getState()).toBe(AppLockState.Locked);
    });
});
