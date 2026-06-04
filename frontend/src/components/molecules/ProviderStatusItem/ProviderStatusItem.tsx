// ProviderStatusItem molecule component
import React, { useState } from "react";
import { Icon } from "../../atoms/Icon/Icon";
import { ProgressBar } from "../../atoms/ProgressBar/ProgressBar";
import { AIProvider } from "../../../types";
import styles from "./ProviderStatusItem.module.scss";

export interface ProviderStatusItemProps {
  provider: AIProvider;
  displayName: string;
  status: "scanning" | "found" | "not_found" | "invalid";
  progress?: number;
  onApiKeyChange?: (key: string) => void;
  apiKey?: string | null;
  setupLink?: { label: string; url: string };
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
  apiKey,
  setupLink,
}) => {
  const [inputValue, setInputValue] = useState(apiKey || "");
  const isOllama = provider === "ollama";
  const isCloudProvider = ["gemini", "openrouter"].includes(provider);
  const providerIcon = providerIconMap[provider] ?? "settings-icon";

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

  // Found state
  if (status === "found") {
    return (
      <div className={styles.item}>
        <div className={styles.row}>
          <span className={styles.providerIcon}>
            <Icon name={providerIcon as any} className={styles.icon} />
          </span>
          <div className={styles.rowText}>
            <p className={styles.rowTitle}>{displayName}</p>
            <p className={styles.rowSubtitle}>
              {isOllama ? "Ready for processing" : "API key found"}
            </p>
          </div>
          <div className={styles.rowRight}>
            <Icon name="checkmark-icon" className={styles.checkIcon} />
          </div>
        </div>
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
            {isOllama
              ? "Install a recommended model for local processing"
              : status === "invalid"
                ? "Invalid key"
                : "API key not found"}
          </p>
        </div>

        <div className={styles.rowRight}>
          <Icon name="error-icon" className={styles.errorIcon} />
        </div>
      </div>

      {/* Install guide для QWEN */}
      {isOllama && setupLink && (
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
      {isCloudProvider && (
        <>
          <input
            className={`${styles.apiKeyInput} ${
              status === "invalid" ? styles.apiKeyInputError : ""
            }`}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              onApiKeyChange?.(e.target.value);
            }}
            placeholder="Enter your API key..."
            type="text"
            autoComplete="off"
            spellCheck={false}
          />

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
      )}
    </div>
  );
};
