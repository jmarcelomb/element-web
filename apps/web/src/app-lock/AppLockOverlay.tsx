/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppLockView, I18nContext } from "@element-hq/web-shared-components";
import { ModuleApi } from "../modules/Api.ts";
import SdkConfig from "../SdkConfig";
import AppLock, { AppLockState } from "./AppLock";
import { AppLockViewModel } from "../viewmodels/app-lock/AppLockViewModel";

/**
 * Renders the lock screen in its own React root appended to document.body.
 *
 * A standalone root is used (rather than a view inside MatrixChat) so the lock screen sits above
 * everything, including modal dialogs, which live in their own body-level containers. While
 * locked, the app's own root is marked inert so nothing behind the lock screen can be focused.
 */
class AppLockOverlay {
    private container: HTMLDivElement | null = null;
    private root: Root | null = null;
    private viewModel: AppLockViewModel | null = null;
    private unsubscribe: (() => void) | null = null;

    public start(): void {
        this.unsubscribe = AppLock.subscribe(this.onStateChanged);
        this.onStateChanged();
    }

    public stop(): void {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.unmount();
    }

    private onStateChanged = (): void => {
        if (AppLock.getState() === AppLockState.Locked) {
            this.mount();
        } else {
            this.unmount();
        }
    };

    private mount(): void {
        if (this.root) return;

        const container = document.createElement("div");
        container.setAttribute("data-testid", "app-lock-overlay");
        document.body.appendChild(container);
        this.container = container;

        this.viewModel = new AppLockViewModel({ appLock: AppLock, brand: SdkConfig.get().brand });
        this.root = createRoot(container);
        this.root.render(
            <I18nContext.Provider value={ModuleApi.instance.i18n}>
                <AppLockView vm={this.viewModel} />
            </I18nContext.Provider>,
        );

        // Block interaction with (and keyboard focus into) everything behind the lock screen:
        // the app root plus the body-level containers modal dialogs, static dialogs, persisted
        // elements and context menus live in.
        for (const id of BLOCKED_CONTAINER_IDS) {
            document.getElementById(id)?.setAttribute("inert", "");
        }
    }

    private unmount(): void {
        for (const id of BLOCKED_CONTAINER_IDS) {
            document.getElementById(id)?.removeAttribute("inert");
        }

        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.viewModel?.dispose();
        this.viewModel = null;
        this.container?.remove();
        this.container = null;
    }
}

export default new AppLockOverlay();

/** Body-level containers that must be unreachable while the lock screen is showing. */
const BLOCKED_CONTAINER_IDS = [
    "matrixchat",
    "mx_Dialog_Container",
    "mx_Dialog_StaticContainer",
    "mx_ContextualMenu_Container",
    "mx_PersistedElement_container",
];
