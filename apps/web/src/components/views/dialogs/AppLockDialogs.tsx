/*
 * Copyright 2026 Marcelo Borges
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React, { type FormEvent, type JSX, useState } from "react";
import { Button } from "@vector-im/compound-web";

import Modal from "../../../Modal";
import BaseDialog from "./BaseDialog";
import Field from "../elements/Field";
import { logger } from "matrix-js-sdk/src/logger";
import { _t } from "../../../languageHandler";
import { isValidCodeLength, MIN_CODE_LENGTH } from "../../../app-lock/verifier";

interface AppLockCodeDialogProps {
    /** Dialog title. */
    title: string;
    /** Description shown above the form. */
    description: string;
    /**
     * Applies the entered code. Must throw (or reject) to signal that the code was rejected,
     * which keeps the dialog open with the error shown.
     */
    onSetCode: (code: string) => Promise<void>;
    /** Called when the dialog should close; the argument reports success. */
    onFinished: (success: boolean) => void;
}

/**
 * Dialog that collects a new app lock code (with confirmation) and hands it to `onSetCode`.
 * Used both for the initial setup and for changing an existing code.
 */
export function AppLockCodeDialog({ title, description, onSetCode, onFinished }: AppLockCodeDialogProps): JSX.Element {
    const [code, setCode] = useState("");
    const [confirmCode, setConfirmCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (busy) return;
        if (!isValidCodeLength(code)) {
            setError(_t("app_lock|code_too_short", { min: MIN_CODE_LENGTH }));
            return;
        }
        if (code !== confirmCode) {
            setError(_t("app_lock|code_mismatch"));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await onSetCode(code);
            onFinished(true);
        } catch (e) {
            logger.warn("Failed to set the app lock code", e);
            setError(_t("app_lock|wrong_code"));
            setBusy(false);
        }
    };

    return (
        <BaseDialog onFinished={() => onFinished(false)} title={title} fixedWidth={false}>
            <form onSubmit={submit}>
                <p>{description}</p>
                <Field
                    type="password"
                    label={_t("app_lock|enter_code")}
                    value={code}
                    autoComplete="new-password"
                    disabled={busy}
                    autoFocus
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
                />
                <Field
                    type="password"
                    label={_t("app_lock|confirm_code")}
                    value={confirmCode}
                    autoComplete="new-password"
                    disabled={busy}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmCode(e.target.value)}
                />
                {error && (
                    <p role="alert" className="mx_AppLockDialog_error">
                        {error}
                    </p>
                )}
                <div className="mx_Dialog_buttons">
                    <Button type="submit" disabled={busy}>
                        {_t("action|ok")}
                    </Button>
                </div>
            </form>
        </BaseDialog>
    );
}

interface AppLockVerifyDialogProps {
    /** Dialog title. */
    title: string;
    /** Description shown above the form. */
    description: string;
    /**
     * Checks the entered current code. Return false to show the wrong-code error and keep the
     * dialog open; return true to close it as successful.
     */
    onVerify: (code: string) => Promise<boolean>;
    onFinished: (success: boolean) => void;
}

/**
 * Dialog that collects the current app lock code to authorise a change (disable or change code).
 */
export function AppLockVerifyDialog({
    title,
    description,
    onVerify,
    onFinished,
}: AppLockVerifyDialogProps): JSX.Element {
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (event: FormEvent): Promise<void> => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const ok = await onVerify(code);
        if (ok) {
            onFinished(true);
        } else {
            setError(_t("app_lock|wrong_code"));
            setBusy(false);
        }
    };

    return (
        <BaseDialog onFinished={() => onFinished(false)} title={title} fixedWidth={false}>
            <form onSubmit={submit}>
                <p>{description}</p>
                <Field
                    type="password"
                    label={_t("app_lock|enter_code")}
                    value={code}
                    autoComplete="off"
                    disabled={busy}
                    autoFocus
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
                />
                {error && (
                    <p role="alert" className="mx_AppLockDialog_error">
                        {error}
                    </p>
                )}
                <div className="mx_Dialog_buttons">
                    <Button type="submit" disabled={busy}>
                        {_t("action|ok")}
                    </Button>
                </div>
            </form>
        </BaseDialog>
    );
}

interface AppLockDialogHandle {
    close: (success: boolean) => void;
    finished: Promise<[boolean] | []>;
}

/**
 * Open the set/change code dialog.
 *
 * @param onSetCode receives the entered code; throw to keep the dialog open with an error.
 */
export function openAppLockCodeDialog(
    title: string,
    description: string,
    onSetCode: (code: string) => Promise<void>,
): AppLockDialogHandle {
    return Modal.createDialog(AppLockCodeDialog, { title, description, onSetCode });
}

/**
 * Open the "enter your current code" dialog.
 *
 * @param onVerify checks the entered code; return false to show the wrong-code error.
 */
export function openAppLockVerifyDialog(
    title: string,
    description: string,
    onVerify: (code: string) => Promise<boolean>,
): AppLockDialogHandle {
    return Modal.createDialog(AppLockVerifyDialog, { title, description, onVerify });
}
