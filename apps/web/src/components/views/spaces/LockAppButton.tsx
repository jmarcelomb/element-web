/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE in the repository root for full details.
 */

import React, { useSyncExternalStore } from "react";
import classNames from "classnames";
import LockSolidIcon from "@vector-im/compound-design-tokens/assets/web/icons/lock-solid";
import { IconButton, Tooltip } from "@vector-im/compound-web";

import { _t } from "../../../languageHandler";
import AppLock, { AppLockState } from "../../../app-lock/AppLock";

/**
 * Lock-now button for the space panel rail. Renders nothing unless app lock
 * is enabled; clicking locks the app immediately.
 */
const LockAppButton: React.FC<{
    isPanelCollapsed: boolean;
}> = ({ isPanelCollapsed }) => {
    const appLockState = useSyncExternalStore(AppLock.subscribe, AppLock.getState);
    if (appLockState === AppLockState.Disabled) return null;

    let button = (
        <IconButton
            aria-label={_t("app_lock|lock_now")}
            className={classNames("mx_LockAppButton", { expanded: !isPanelCollapsed })}
            onClick={() => AppLock.lock()}
        >
            <LockSolidIcon />
        </IconButton>
    );

    if (isPanelCollapsed) {
        button = (
            <Tooltip label={_t("app_lock|lock_now")} placement="right">
                {button}
            </Tooltip>
        );
    }

    return button;
};

export default LockAppButton;
