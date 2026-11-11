/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as stories from "./AppLockView.stories";
import { AppLockView, type AppLockViewActions, type AppLockViewSnapshot } from "./AppLockView";
import { MockViewModel } from "../../core/viewmodel/MockViewModel";

const { Default, WrongCode, Busy } = composeStories(stories);

describe("AppLockView", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("Storybook snapshots", () => {
        it("renders the default state", () => {
            const { container } = render(<Default />);
            expect(container).toMatchSnapshot();
        });

        it("renders the wrong code state", () => {
            const { container } = render(<WrongCode />);
            expect(container).toMatchSnapshot();
        });

        it("renders the busy state", () => {
            const { container } = render(<Busy />);
            expect(container).toMatchSnapshot();
        });
    });

    describe("User interactions", () => {
        class TestViewModel extends MockViewModel<AppLockViewSnapshot> implements AppLockViewActions {
            public submitCode = vi.fn();
        }

        it("should submit the entered code when the form is submitted", async () => {
            const user = userEvent.setup();
            const vm = new TestViewModel({ brand: "Element", error: null, busy: false });
            render(<AppLockView vm={vm} />);

            await user.type(screen.getByLabelText("Code"), "1234");
            await user.click(screen.getByRole("button", { name: "Unlock" }));

            expect(vm.submitCode).toHaveBeenCalledWith("1234");
        });

        it("should submit the code when pressing enter", async () => {
            const user = userEvent.setup();
            const vm = new TestViewModel({ brand: "Element", error: null, busy: false });
            render(<AppLockView vm={vm} />);

            await user.type(screen.getByLabelText("Code"), "hello{enter}");

            expect(vm.submitCode).toHaveBeenCalledWith("hello");
        });

        it("should disable the input while busy", () => {
            const vm = new TestViewModel({ brand: "Element", error: null, busy: true });
            render(<AppLockView vm={vm} />);

            expect(screen.getByLabelText("Code")).toBeDisabled();
            expect(screen.queryByRole("button", { name: "Unlock" })).not.toBeInTheDocument();
        });

        it("should show the error message", () => {
            const vm = new TestViewModel({ brand: "Element", error: "Wrong code. Try again.", busy: false });
            render(<AppLockView vm={vm} />);

            expect(screen.getByRole("alert")).toHaveTextContent("Wrong code. Try again.");
            expect(screen.getByLabelText("Code")).toBeInvalid();
        });
    });
});
