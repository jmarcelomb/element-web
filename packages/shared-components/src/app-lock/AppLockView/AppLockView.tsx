/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE in the repository root for full details.
 */

import React, { type FormEvent, type JSX } from "react";
import { Button, Heading, InlineSpinner, Text } from "@vector-im/compound-web";
import LockIcon from "@vector-im/compound-design-tokens/assets/web/icons/lock-solid";

import styles from "./AppLockView.module.css";
import { type ViewModel, useViewModel } from "../../core/viewmodel";
import { Flex } from "../../core/utils/Flex";
import { useI18n } from "../../core/i18n/i18nContext";

/** Snapshot data for the app lock screen. */
export interface AppLockViewSnapshot {
    /** The application brand name, for example "Element". */
    brand: string;
    /** Error message to show after a failed unlock attempt, or null when there is none. */
    error: string | null;
    /** Whether an unlock attempt is in flight; disables the form while the code is checked. */
    busy: boolean;
}

/** User actions emitted by the app lock screen. */
export interface AppLockViewActions {
    /** Invoked with the entered code when the user submits the unlock form. */
    submitCode: (code: string) => void;
}

/** View model contract for the app lock screen. */
export type AppLockViewModel = ViewModel<AppLockViewSnapshot, AppLockViewActions>;

interface AppLockViewProps {
    /**
     * The view model for the app lock screen.
     */
    vm: AppLockViewModel;
}

/**
 * A full-screen lock screen shown when the app is locked.
 *
 * It covers the whole window and only offers a code entry form, so nothing in the app can be
 * reached until the code is accepted.
 *
 * @example
 * ```tsx
 * <AppLockView vm={appLockViewModel} />
 * ```
 */
export function AppLockView({ vm }: Readonly<AppLockViewProps>): JSX.Element {
    const { translate: _t } = useI18n();
    const { brand, error, busy } = useViewModel(vm);

    const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        // Clear the field straight away: on a failed attempt the user should type a fresh code.
        event.currentTarget.reset();
        vm.submitCode((data.get("code") as string) ?? "");
    };

    return (
        <div className={styles.container} data-testid="app-lock-view">
            <Flex direction="column" align="center" gap="var(--cpd-space-4x)" className={styles.card}>
                <div className={styles.iconWrap}>
                    <LockIcon width="32px" height="32px" />
                </div>
                <Heading as="h1" weight="semibold" size="md">
                    {_t("app_lock|locked_title", { brand })}
                </Heading>
                <Text size="md">{_t("app_lock|enter_code_to_unlock")}</Text>
                <form className={styles.form} onSubmit={onSubmit}>
                    <input
                        className={styles.input}
                        type="password"
                        name="code"
                        autoComplete="new-password"
                        autoFocus
                        disabled={busy}
                        aria-label={_t("app_lock|code_label")}
                        aria-invalid={error !== null}
                        data-testid="app-lock-input"
                    />
                    {error && (
                        <Text as="p" size="sm" className={styles.error} role="alert">
                            {error}
                        </Text>
                    )}
                    {busy ? (
                        <InlineSpinner />
                    ) : (
                        <Button type="submit" className={styles.button}>
                            {_t("app_lock|unlock")}
                        </Button>
                    )}
                </form>
            </Flex>
        </div>
    );
}
