//frontend/src/components/organisms/SettingsPanel/SettingsPanel.tsx
import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Panel } from '../../atoms/Panel/Panel';
import { Input } from '../../atoms/Input/Input';
import { Select } from '../../atoms/Select/Select';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import styles from './SettingsPanel.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

const platformOptions = [
  { value: 'getty_images', label: 'Getty Images' },
  { value: 'shutterstock', label: 'Shutterstock' },
  { value: 'adobe_stock', label: 'Adobe Stock' },
];

const providerOptions = [
  { value: 'mock', label: 'Mock' },
  { value: 'claude', label: 'Claude' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
]; //TODO: Update with actual provider names as needed. Mock is for testing purposes and should be removed in production.

export const SettingsPanel: React.FC = () => {
  const sessionSettings = useAppStore((state) => state.sessionSettings);
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

  const displayedShootingContext =
    lockedBatchSettings?.shootingContext ?? draftBatchSettings.shootingContext;
  const isPromptLocked = lockedBatchSettings !== null;

  const CHAR_LIMIT = 600;
  const charCount = displayedShootingContext.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  const handleFormatChange =
    (key: "csv" | "iptc") => (e: React.ChangeEvent<HTMLInputElement>) => {
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
            placeholder="Describe the context of the shooting, and the following questions will help you — Where? What? When? E.g., “New York, Central Park, Sunset, two people on a bench 10 May 2026”"
            hasError={isOverLimit}
            disabled={isPromptLocked}
          />
          <div
            className={`${styles.charCounter} ${isOverLimit ? styles.counterError : ""}`}
          >
            {charCount}/{CHAR_LIMIT}
          </div>
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

        <Select
          label="Stock Platform"
          options={platformOptions}
          value={draftBatchSettings.stockPlatform}
          onChange={(e) =>
            updateDraftBatchSetting(
              "stockPlatform",
              e.target.value as typeof draftBatchSettings.stockPlatform,
            )
          }
        />

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

        <Select
          label="AI Provider"
          options={providerOptions}
          value={sessionSettings.aiProvider}
          onChange={(e) => {
            updateSessionSetting(
              "aiProvider",
              e.target.value as typeof sessionSettings.aiProvider,
            );
            saveSessionSettings();
          }}
        />
      </div>
    </Panel>
  );
};
