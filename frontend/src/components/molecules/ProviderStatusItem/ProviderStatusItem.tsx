// ProviderStatusItem molecule component
import React, { useEffect, useState } from "react";
import { Icon } from "../../atoms/Icon/Icon";
import { ProgressBar } from "../../atoms/ProgressBar/ProgressBar";
import type { AIProvider } from "types";
import styles from "./ProviderStatusItem.module.scss";

type ApiKeySaveStatus = "idle" | "validating" | "valid" | "invalid";

export interface ProviderStatusItemProps {
  provider: AIProvider;
  displayName: string;
  status: "scanning" | "found" | "not_found" | "invalid";
  progress?: number;
  onApiKeyChange?: (key: string) => void;
  apiKeySaveStatus?: ApiKeySaveStatus;
  apiKeyError?: string | null;
  apiKey?: string | null;
  setupLink?: { label: string; url: string };
  suppressErrorIcon?: boolean;
  // Включён ли провайдер пользователем. Тумблер показывается только когда
  // передан обработчик — в онбординге его нет.
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  isTogglePending?: boolean;
}

const providerIconMap: Record<string, string> = {
  ollama: "qwen-icon",
  gemini: "gemini-icon",
  openrouter: "openrouter-icon",
};

export const ProviderStatusItem: React.FC<ProviderStatusItemProps> = ({
  provider,
  displayName,
  status,
  progress,
  onApiKeyChange,
  apiKeySaveStatus = "idle",
  apiKey,
  setupLink,
  suppressErrorIcon = false,
  enabled = true,
  onToggleEnabled,
  isTogglePending = false,
}) => {
  const [inputValue, setInputValue] = useState(apiKey || "");
  const [hasTouchedInput, setHasTouchedInput] = useState(false);
  // Режим замены уже сохранённого ключа (для found-провайдеров)
  const [isReplacingKey, setIsReplacingKey] = useState(false);
  const isOllama = provider === "ollama";
  const isCloudProvider = ["gemini", "openrouter"].includes(provider);
  const providerIcon = providerIconMap[provider] ?? "settings-icon";
  const enabledToggle = onToggleEnabled ? (
    <label
      className={`${styles.enabledToggle} ${
        isTogglePending ? styles.enabledTogglePending : ""
      }`}
    >
      <input
        type="checkbox"
        className={styles.enabledToggleInput}
        checked={enabled}
        onChange={(e) => onToggleEnabled(e.target.checked)}
        aria-label={`${enabled ? "Disable" : "Enable"} ${displayName}`}
      />
      <span className={styles.enabledToggleTrack} />
    </label>
  ) : null;

  // После успешного сохранения нового ключа сворачиваем режим замены,
  // дав пользователю увидеть подтверждение
  useEffect(() => {
    if (!isReplacingKey || apiKeySaveStatus !== "valid") {
      return undefined;
    }

    const timer = setTimeout(() => {
      setIsReplacingKey(false);
      setInputValue("");
      setHasTouchedInput(false);
      onApiKeyChange?.("");
    }, 1500);

    return () => clearTimeout(timer);
  }, [isReplacingKey, apiKeySaveStatus]);

  const handleCancelReplace = () => {
    setIsReplacingKey(false);
    setInputValue("");
    setHasTouchedInput(false);
    onApiKeyChange?.("");
  };

  const hasNonEmptyInput = inputValue.trim() !== "";
  const showStatusValidation =
    hasNonEmptyInput &&
    (apiKeySaveStatus === "invalid" ||
      (status === "invalid" && hasTouchedInput));

  const cloudSubtitle =
    apiKeySaveStatus === "validating"
      ? "Validating key..."
      : apiKeySaveStatus === "valid"
        ? "API key saved"
        : "API key not found";
  const apiKeyErrorMessage = showStatusValidation ? "invalid key" : null;

  // QWEN scanning — отдельный layout с progressBar
  if (isOllama && status === "scanning") {
    return (
      <div className={styles.item}>
        <div className={styles.scanning}>
          <span className={styles.providerIcon}>
            <Icon name={providerIcon as any} className={styles.icon} />
          </span>
          <div className={styles.scanningBody}>
            <p className={styles.scanningTitle}>Searching for QWEN 2.5 VL…</p>
            {/* используем существующий ProgressBar атом с анимацией */}
            <ProgressBar value={progress ?? 40} animated={true} />
          </div>
        </div>
      </div>
    );
  }

  // Gemini/OpenRouter scanning — row layout со spinner справа
  if (!isOllama && status === "scanning") {
    return (
      <div className={styles.item}>
        <div className={styles.row}>
          <span className={styles.providerIcon}>
            <Icon name={providerIcon as any} className={styles.icon} />
          </span>
          <div className={styles.rowText}>
            <p className={styles.rowTitle}>{displayName}</p>
            <p className={styles.rowSubtitle}>Checking saved API keys…</p>
          </div>
          <div className={styles.rowRight}>
            <Icon name="load-icon" className={styles.spinner} />
          </div>
        </div>
      </div>
    );
  }

  // Input + ссылка для cloud провайдеров (общий блок для
  // первичного ввода и замены сохранённого ключа)
  const apiKeyEditor = (
    <>
      <div className={styles.apiKeyRow}>
        <input
          className={`${styles.apiKeyInput} ${
            showStatusValidation ? styles.apiKeyInputError : ""
          }`}
          value={inputValue}
          onChange={(e) => {
            const value = e.target.value;
            setInputValue(value);
            if (!value.trim()) {
              setHasTouchedInput(false);
            }
            onApiKeyChange?.(value);
          }}
          onBlur={() => setHasTouchedInput(true)}
          placeholder={
            status === "found" ? "Enter new API key..." : "Enter your API key..."
          }
          type="text"
          autoComplete="off"
          spellCheck={false}
        />
        {apiKeySaveStatus === "validating" && (
          <Icon name="load-icon" className={styles.spinner} />
        )}
        {apiKeySaveStatus === "valid" && (
          <Icon name="checkmark-icon" className={styles.checkIcon} />
        )}
      </div>
      {apiKeyErrorMessage && (
        <p className={styles.apiKeyErrorText}>{apiKeyErrorMessage}</p>
      )}

      {setupLink && (
        <div className={styles.inputFooter}>
          <a
            href={setupLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.externalLink}
          >
            {setupLink.label}
            <Icon name="link-icon" className={styles.externalLinkIcon} />
          </a>
        </div>
      )}
    </>
  );

  // Found state
  if (status === "found") {
    const foundSubtitle = isOllama
      ? "Ready for processing"
      : isReplacingKey && apiKeySaveStatus === "validating"
        ? "Validating key..."
        : isReplacingKey && apiKeySaveStatus === "valid"
          ? "API key saved"
          : "API key found";

    return (
      <div className={styles.item}>
        <div className={styles.row}>
          <span className={styles.providerIcon}>
            <Icon name={providerIcon as any} className={styles.icon} />
          </span>
          <div className={styles.rowText}>
            <p className={styles.rowTitle}>{displayName}</p>
            <p className={styles.rowSubtitle}>
              {enabled ? foundSubtitle : "Disabled — excluded from fallback"}
            </p>
          </div>
          <div className={styles.rowRight}>
            {isCloudProvider && enabled && (
              <button
                type="button"
                className={styles.replaceKeyBtn}
                onClick={
                  isReplacingKey
                    ? handleCancelReplace
                    : () => setIsReplacingKey(true)
                }
              >
                {isReplacingKey ? "Cancel" : "Replace key"}
              </button>
            )}
            {enabledToggle}
          </div>
        </div>

        {isReplacingKey && enabled && apiKeyEditor}
      </div>
    );
  }

  // Not found / Invalid state
  return (
    <div className={styles.item}>
      <div className={styles.row}>
        <span className={styles.providerIcon}>
          <Icon name={providerIcon as any} className={styles.icon} />
        </span>

        <div className={styles.rowText}>
          <p className={styles.rowTitle}>{displayName}</p>
          <p className={styles.rowSubtitle}>
            {!enabled
              ? "Disabled — excluded from fallback"
              : isOllama
                ? "Install a recommended model for local processing"
                : cloudSubtitle}
          </p>
        </div>

        <div className={styles.rowRight}>
          {enabled && !suppressErrorIcon && (
            <Icon name="error-icon" className={styles.errorIcon} />
          )}
          {enabledToggle}
        </div>
      </div>

      {/* Install guide для QWEN */}
      {isOllama && enabled && setupLink && (
        <div className={styles.installLink}>
          <a
            href={setupLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.externalLink}
          >
            {setupLink.label}
            <Icon name="link-icon" className={styles.externalLinkIcon} />
          </a>
        </div>
      )}

      {/* Input + ссылка для cloud провайдеров */}
      {isCloudProvider && enabled && apiKeyEditor}
    </div>
  );
};
