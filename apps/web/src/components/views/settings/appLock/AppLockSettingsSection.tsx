/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type JSX, useState } from "react";

import { _t } from "../../../../languageHandler";
import AppLock from "../../../../app-lock/AppLock";
import { hasAppLockCode } from "../../../../app-lock/verifier";
import { SettingLevel } from "../../../../settings/SettingLevel";
import SettingsStore from "../../../../settings/SettingsStore";
import { useSettingValue } from "../../../../hooks/useSettings.ts";
import AccessibleButton from "../../elements/AccessibleButton";
import SettingsDropdown from "../../elements/SettingsDropdown.tsx";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsSubsection, SettingsSubsectionText } from "../shared/SettingsSubsection";
import { openAppLockCodeDialog, openAppLockVerifyDialog } from "../../dialogs/AppLockDialogs";

/**
 * "App lock" section in the security settings: enable/disable the lock, pick the auto-lock
 * timeout, change the code, and lock the app immediately.
 */
export function AppLockSettingsSection(): JSX.Element {
    const enabled = useSettingValue("appLockEnabled");
    const [hasCode, setHasCode] = useState(hasAppLockCode());

    const enable = (): void => {
        if (hasCode) {
            // A code already exists (app lock was previously configured): ask for it before
            // switching the lock back on.
            void openAppLockVerifyDialog(_t("app_lock|enable"), _t("app_lock|enable_prompt_current"), async (code) => {
                const ok = await AppLock.verifyCode(code);
                if (!ok) return false;
                await SettingsStore.setValue("appLockEnabled", null, SettingLevel.DEVICE, true);
                return true;
            }).finished.then(([success]) => {
                if (success) setHasCode(hasAppLockCode());
            });
        } else {
            openAppLockCodeDialog(_t("app_lock|set_code_title"), _t("app_lock|set_code_description"), async (code) => {
                await AppLock.enable(code);
                setHasCode(hasAppLockCode());
            });
        }
    };

    const changeCode = (): void => {
        void openAppLockVerifyDialog(
            _t("app_lock|set_code_title"),
            _t("app_lock|enable_prompt_current"),
            async (code) => AppLock.verifyCode(code),
        ).finished.then(([success]) => {
            if (!success) return;
            openAppLockCodeDialog(_t("app_lock|set_code_title"), _t("app_lock|set_code_description"), async (code) => {
                await AppLock.setCode(code);
                setHasCode(hasAppLockCode());
            });
        });
    };

    const disable = (): void => {
        void openAppLockVerifyDialog(_t("app_lock|enable"), _t("app_lock|enable_prompt_current"), async (code) =>
            AppLock.disable(code),
        ).finished.then(([success]) => {
            if (success) setHasCode(hasAppLockCode());
        });
    };

    return (
        <SettingsSection heading={_t("app_lock|title")}>
            <SettingsSubsection description={_t("app_lock|enable_description")}>
                {enabled ? (
                    <>
                        <SettingsSubsectionText>{_t("app_lock|timeout")}</SettingsSubsectionText>
                        <SettingsDropdown settingKey="appLockTimeout" level={SettingLevel.DEVICE} />
                        <div className="mx_AppLockSettings_buttons">
                            <AccessibleButton kind="primary_outline" onClick={changeCode}>
                                {_t("app_lock|change_code")}
                            </AccessibleButton>
                            <AccessibleButton kind="primary_outline" onClick={AppLock.lock}>
                                {_t("app_lock|lock_now")}
                            </AccessibleButton>
                            <AccessibleButton kind="danger_outline" onClick={disable}>
                                {_t("app_lock|disable")}
                            </AccessibleButton>
                        </div>
                    </>
                ) : (
                    <AccessibleButton kind="primary" onClick={enable}>
                        {_t("app_lock|enable")}
                    </AccessibleButton>
                )}
            </SettingsSubsection>
        </SettingsSection>
    );
}
