//frontend/src/components/organisms/SettingsPanel/SettingsPanel.tsx
import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Panel } from '../../atoms/Panel/Panel';
import { Input } from '../../atoms/Input/Input';
import { Select } from '../../atoms/Select/Select';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import { Slider } from '../../atoms/Slider/Slider';
import styles from './SettingsPanel.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

const platformOptions = [
  { value: 'getty_images', label: 'Getty Images' },
  { value: 'shutterstock', label: 'Shutterstock' },
  { value: 'adobe_stock', label: 'Adobe Stock' },
];

const providerOptions = [
  { value: 'claude', label: 'Claude' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
];

export const SettingsPanel: React.FC = () => {
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const [formats, setFormats] = React.useState({
    csv: true,
    iptc: true,
    json: false,
  });
  const [quality, setQuality] = React.useState(72);

  const CHAR_LIMIT = 600;
  const charCount = settings.shootingContext.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  const handleFormatChange =
    (key: keyof typeof formats) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormats((prev) => ({
        ...prev,
        [key]: e.target.checked,
      }));
    };

  return (
    <Panel className={styles.settingsPanel}>
      {/* Заголовок */}
      <SectionHeader
        icon="settings-icon"
        title="Context & Settings"
        subtitle="These details help AI generate accurate metadata for your photos."
      />

      <div className={styles.controls}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Shoot Notes / Event Name</label>
          <Input
            value={settings.shootingContext}
            onChange={(e) => updateSettings("shootingContext", e.target.value)}
            placeholder={
              "Describe the context of the shooting, and the following questions will help you — Where? What? When? E.g., “New York, Central Park, Sunset, two people on a bench 10 May 2026”"
            }
            hasError={isOverLimit}
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
        </div>

        <Select
          label="Stock Platform"
          options={platformOptions}
          value={settings.exportFormat}
          onChange={(e) => updateSettings("exportFormat", e.target.value)}
        />

        <div className={styles.checkboxRow}>
          <Checkbox
            id="csv"
            label="CSV"
            checked={formats.csv}
            onChange={handleFormatChange("csv")}
          />
          {/*<Checkbox
            id="iptc"
            label="IPTC"
            checked={formats.iptc}
            onChange={handleFormatChange("iptc")}
          />
          <Checkbox
            id="json"
            label="JSON"
            checked={formats.json}
            onChange={handleFormatChange("json")}
          />*/}
        </div>

        <Select
          label="AI Provider"
          options={providerOptions}
          value={settings.aiProvider}
          onChange={(e) => updateSettings("aiProvider", e.target.value)}
        />

        {/*<div className={styles.sliderRow}>
          <label htmlFor="quality" className={styles.sliderLabel}>
            AI Image Quality
          </label>
          <Slider
            id="quality"
            min={0}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </div>*/}

        {/*<Button variant="primary" size="md" onClick={saveSettings}>
          Save Settings
        </Button>*/}
      </div>
    </Panel>
  );
};
