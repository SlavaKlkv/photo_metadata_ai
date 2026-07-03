// frontend/src/components/organisms/SettingsPanel/SettingsPanel.tsx
import React from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { jobsApi } from 'services/api/api';
import { Panel } from 'components/atoms/Panel/Panel';
import { Input } from 'components/atoms/Input/Input';
import { Select } from 'components/atoms/Select/Select';
import { Checkbox } from 'components/atoms/Checkbox/Checkbox';
import { Radio } from 'components/atoms/Radio/Radio';
import styles from './SettingsPanel.module.scss';
import { SectionHeader } from 'components/molecules/SectionHeader/SectionHeader';
import {
  AIProvider,
  ProviderDiscoveryItem,
  StockPlatform,
} from 'types';

const platformOptions = [
  { value: 'getty_images', label: 'Getty Images' },
  { value: 'shutterstock', label: 'Shutterstock' },
  { value: 'adobe_stock', label: 'Adobe Stock' },
];

const providerOptions: { value: AIProvider; label: string }[] = [
  { value: 'ollama', label: 'QWEN 2.5 VL' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
];

export const SettingsPanel: React.FC = () => {
  const sessionSettings = useAppStore((state) => state.sessionSettings);
  const availableProviders = useAppStore((state) => state.availableProviders);
  const providerDiscoveryItems = useAppStore(
    (state) => state.providerDiscoveryItems,
  );
  const providerDiscoveryStatus = useAppStore(
    (state) => state.providerDiscoveryStatus,
  );
  const providerDiscoveryError = useAppStore(
    (state) => state.providerDiscoveryError,
  );
  const draftBatchSettings = useAppStore((state) => state.draftBatchSettings);
  const lockedBatchSettings = useAppStore((state) => state.lockedBatchSettings);

  const updateSessionSetting = useAppStore(
    (state) => state.updateSessionSetting,
  );
  const saveSessionSettings = useAppStore((state) => state.saveSessionSettings);
  const updateDraftBatchSetting = useAppStore(
    (state) => state.updateDraftBatchSetting,
  );
  const updateExportFormat = useAppStore((state) => state.updateExportFormat);

  const switchStockPlatform = useAppStore((state) => state.switchStockPlatform);

  const currentJobId = useUIStore((state) => state.currentJobId);
  const isExportReady = useUIStore((state) => state.isExportReady);

  const selectedProvider = sessionSettings.selectedProvider;

  const handleProviderChange = (provider: AIProvider) => {
    updateSessionSetting('selectedProvider', provider);
    updateDraftBatchSetting('aiProvider', provider);
    saveSessionSettings();
    jobsApi
      .updateDesktopSettings({ selected_provider: provider })
      .catch((error) => {
        console.error('[SettingsPanel] Failed to save provider:', error);
      });
  };

  const displayedShootingContext =
    lockedBatchSettings?.shootingContext ?? draftBatchSettings.shootingContext;
  const isPromptLocked = lockedBatchSettings !== null;

  // Показываем hint о re-export когда batch зафиксирован и stock изменился
  const stockChangedAfterLock =
    isPromptLocked &&
    draftBatchSettings.stockPlatform !== lockedBatchSettings?.stockPlatform;

  const CHAR_LIMIT = 600;
  const charCount = displayedShootingContext.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  const handleFormatChange =
    (key: 'csv' | 'iptc') => (e: React.ChangeEvent<HTMLInputElement>) => {
      updateExportFormat(key, e.target.checked);
    };

  return (
    <Panel className={styles.settingsPanel}>
      <SectionHeader
        icon="settings-icon"
        title="Context & Settings"
        subtitle="These details help AI generate accurate metadata for your photos."
      />

      <div className={styles.controls}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Shoot Notes / Event Name</label>
          <Input
            value={displayedShootingContext}
            onChange={(e) =>
              updateDraftBatchSetting("shootingContext", e.target.value)
            }
            placeholder='Describe the context of the shooting, and the following questions will help you — Where? What? When? E.g., "New York, Central Park, Sunset, two people on a bench 10 May 2026"'
            hasError={isOverLimit}
            disabled={isPromptLocked}
            variant="context"
            fillHeight
            counter={`${charCount}/${CHAR_LIMIT}`}
            counterError={isOverLimit}
          />
          {isOverLimit && (
            <small className={styles.errorText}>
              Please shorten the description to under {CHAR_LIMIT} characters.
            </small>
          )}
          {isPromptLocked && (
            <small className={styles.hintText}>
              Batch prompt is locked after processing starts.
            </small>
          )}
        </div>

        <div className={styles.selectGroup}>
          <Select
            label="Stock Platform"
            options={platformOptions}
            value={draftBatchSettings.stockPlatform}
            onChange={(e) => {
              const platform = e.target.value as StockPlatform;

              if (isExportReady && currentJobId) {
                switchStockPlatform(platform, currentJobId);
              } else {
                updateDraftBatchSetting("stockPlatform", platform);
              }
            }}
          />
          {/* Re-export hint: меняем stock после processing → export без новой AI генерации */}
          {stockChangedAfterLock && (
            <small className={styles.hintText}>
              Exporting with new platform settings. No new AI generation needed.
            </small>
          )}
        </div>

        <div className={styles.rowGroup}>
          <div className={styles.rowLabel}>Export Format</div>
          <div className={styles.checkboxRow}>
            <Checkbox
              id="csv"
              label="CSV"
              checked={draftBatchSettings.exportFormats.csv}
              onChange={handleFormatChange("csv")}
            />
            <Checkbox
              id="iptc"
              label="IPTC"
              checked={draftBatchSettings.exportFormats.iptc}
              onChange={handleFormatChange("iptc")}
            />
          </div>
        </div>

        <div className={styles.rowGroup}>
          <div className={styles.rowLabel}>AI Provider</div>
          <div className={styles.providerOptions}>
            {providerOptions.map((option) => {
              const isAvailable =
                providerDiscoveryStatus !== "ready" ||
                availableProviders.includes(option.value);

              return (
                <Radio
                  key={option.value}
                  id={`ai-provider-${option.value}`}
                  label={option.label}
                  checked={selectedProvider === option.value}
                  disabled={!isAvailable}
                  onChange={() => handleProviderChange(option.value)}
                  className={`${styles.providerOption} ${
                    selectedProvider === option.value
                      ? styles.selectedOption
                      : ""
                  } ${!isAvailable ? styles.disabledOption : ""}`}
                />
              );
            })}
          </div>

          {providerDiscoveryStatus === "loading" && (
            <small className={styles.hintText}>
              Detecting available AI providers…
            </small>
          )}

          {providerDiscoveryStatus === "ready" &&
            availableProviders.length === 0 && (
              <small className={styles.errorText}>
                No AI providers were detected. Provider onboarding will be added
                later.
              </small>
            )}

          {providerDiscoveryStatus === "error" && (
            <small className={styles.errorText}>
              {providerDiscoveryError ?? "Failed to detect AI providers."}
            </small>
          )}

        </div>
      </div>
    </Panel>
  );
};
