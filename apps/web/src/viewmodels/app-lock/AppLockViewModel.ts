/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import { BaseViewModel, type AppLockViewSnapshot } from "@element-hq/web-shared-components";

import type AppLock from "../../app-lock/AppLock";
import { _t } from "../../languageHandler";

interface AppLockViewModelProps {
    /** The app lock controller. Injected for testability. */
    appLock: Pick<typeof AppLock, "unlock">;
    /** The application brand name. */
    brand: string;
}

/**
 * ViewModel for the full-screen lock screen. Feeds unlock attempts to the app lock controller
 * and exposes the error message from the last failed attempt.
 */
export class AppLockViewModel extends BaseViewModel<AppLockViewSnapshot, AppLockViewModelProps> {
    public constructor(props: AppLockViewModelProps) {
        super(props, {
            brand: props.brand,
            error: null,
            busy: false,
        });
    }

    public submitCode = async (code: string): Promise<void> => {
        if (this.snapshot.current.busy) return;
        this.snapshot.merge({ busy: true, error: null });
        const ok = await this.props.appLock.unlock(code);
        if (this.isDisposed) return;
        if (ok) {
            // The overlay unmounts when the controller state changes; nothing to do here.
            this.snapshot.merge({ busy: false });
        } else {
            this.snapshot.merge({ busy: false, error: _t("app_lock|wrong_code") });
        }
    };
}
