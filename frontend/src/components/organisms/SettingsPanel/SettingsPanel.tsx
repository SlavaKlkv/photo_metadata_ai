import React from 'react';
import { Panel } from '../../atoms/Panel/Panel';
import { Icon } from '../../atoms/Icon/Icon';
import { Input } from '../../atoms/Input/Input';
import { Select } from '../../atoms/Select/Select';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import { Slider } from '../../atoms/Slider/Slider';
import styles from './SettingsPanel.module.scss';

const platformOptions = [
  { value: 'getty', label: 'Getty Images' },
  { value: 'shutterstock', label: 'Shutterstock' },
  { value: 'adobe', label: 'Adobe Stock' },
];

const providerOptions = [
  { value: 'claude', label: 'Claude' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
];

export const SettingsPanel: React.FC = () => {
  const [formats, setFormats] = React.useState({
    csv: true,
    iptc: true,
    json: false,
  });
  const [quality, setQuality] = React.useState(72);
  const [shootNotes, setShootNotes] = React.useState('');

  const CHAR_LIMIT = 600;
  const charCount = shootNotes.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  const handleFormatChange = (key: keyof typeof formats) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormats((prev) => ({
      ...prev,
      [key]: e.target.checked,
    }));
  };

  return (
    <Panel className={styles.settingsPanel}>
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Icon name="settings-icon" className={styles.settingsIcon} />
        </div>
        <div>
          <h2>Context & Settings</h2>
          <p>These details help AI generate accurate metadata for your photos.</p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.inputGroup}>
          <label className={styles.label}>Shoot Notes / Event Name</label>
          <Input
            value={shootNotes}
            onChange={(e) => setShootNotes(e.target.value)}
            placeholder={
              'Describe the context of the shooting, and the following questions will help you — Where? What? When? E.g., “New York, Central Park, Sunset, two people on a bench 10 May 2026”'
            }
            hasError={isOverLimit}
          />
          <div className={`${styles.charCounter} ${isOverLimit ? styles.counterError : ''}`}>
            {charCount}/{CHAR_LIMIT}
          </div>
          {isOverLimit && (
            <small className={styles.errorText}>
              Please shorten the description to under {CHAR_LIMIT} characters.
            </small>
          )}
        </div>

        <Select label="Stock Platform" options={platformOptions} />

        <div className={styles.checkboxRow}>
          <Checkbox
            id="csv"
            label="CSV"
            checked={formats.csv}
            onChange={handleFormatChange('csv')}
          />
          <Checkbox
            id="iptc"
            label="IPTC"
            checked={formats.iptc}
            onChange={handleFormatChange('iptc')}
          />
          <Checkbox
            id="json"
            label="JSON"
            checked={formats.json}
            onChange={handleFormatChange('json')}
          />
        </div>

        <Select label="AI Provider" options={providerOptions} />

        <div className={styles.sliderRow}>
          <label htmlFor="quality" className={styles.sliderLabel}>
            Export Quality
          </label>
          <Slider
            id="quality"
            min={0}
            max={100}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </div>
      </div>
    </Panel>
  );
};
