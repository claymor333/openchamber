export type SendAttemptLock = { current: boolean };

export const acquireSendAttempt = (lock: SendAttemptLock): boolean => {
    if (lock.current) return false;
    lock.current = true;
    return true;
};

export const releaseSendAttempt = (lock: SendAttemptLock): void => {
    lock.current = false;
};

type SubmittedComposerState = {
    submittedText: string;
    currentText: string;
    submittedDraftKey: string | null;
    currentDraftKey: string | null;
    allowDraftIdentityChange?: boolean;
};

export const matchesSubmittedComposer = ({
    submittedText,
    currentText,
    submittedDraftKey,
    currentDraftKey,
}: SubmittedComposerState): boolean => (
    submittedText === currentText && submittedDraftKey === currentDraftKey
);

export const canRestoreSubmittedComposer = ({
    submittedText,
    currentText,
    submittedDraftKey,
    currentDraftKey,
    allowEmpty,
    allowDraftIdentityChange,
}: SubmittedComposerState & { allowEmpty?: boolean }): boolean => (
    (submittedDraftKey === currentDraftKey || (allowDraftIdentityChange === true && currentText === ''))
    && (submittedText === currentText || (allowEmpty === true && currentText === ''))
);
