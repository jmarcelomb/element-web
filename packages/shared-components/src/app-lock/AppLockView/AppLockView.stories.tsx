/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppLockView, type AppLockViewActions, type AppLockViewSnapshot } from "./AppLockView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";

type WrapperProps = AppLockViewSnapshot & AppLockViewActions;

const AppLockViewWrapperImpl = ({ submitCode, ...snapshotProps }: WrapperProps): JSX.Element => {
    const vm = useMockedViewModel(snapshotProps, { submitCode });
    return <AppLockView vm={vm} />;
};
const AppLockViewWrapper = withViewDocs(AppLockViewWrapperImpl, AppLockView);

const meta = {
    title: "App Lock/AppLockView",
    component: AppLockViewWrapper,
    tags: ["autodocs"],
    args: {
        brand: "Element",
        error: null,
        busy: false,
        submitCode: fn(),
    },
} satisfies Meta<typeof AppLockViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WrongCode: Story = {
    args: {
        error: "Wrong code. Try again.",
    },
};

export const Busy: Story = {
    args: {
        busy: true,
    },
};
