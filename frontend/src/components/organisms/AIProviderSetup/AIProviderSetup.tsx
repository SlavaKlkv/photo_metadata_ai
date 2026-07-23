// AIProviderSetup organism component
// Список AI-провайдеров со статусами и вводом API-ключей.
// Используется и в онбординге, и в модалке AI Setup после него.
import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from 'store/useAppStore';
import { ProviderStatusItem } from '../../molecules/ProviderStatusItem/ProviderStatusItem';
import styles from './AIProviderSetup.module.scss';
import type { AIProvider } from 'types';

type ApiKeyValidationStatus = 'idle' | 'validating' | 'valid' | 'invalid';
type DebounceTimer = ReturnType<typeof setTimeout>;

export interface AIProviderSetupProps {
  // Фаза сканирования (только онбординг): все провайдеры в статусе scanning
  isScanning?: boolean;
  // Симулированный прогресс поиска QWEN (только онбординг)
  scanProgress?: number;
  suppressErrorIcon?: boolean;
  // Тумблеры включения провайдеров: нужны в AI Setup, но не в онбординге,
  // где пользователь ещё ничего не настроил.
  allowToggleProviders?: boolean;
}

export const AIProviderSetup: React.FC<AIProviderSetupProps> = ({
  isScanning = false,
  scanProgress,
  suppressErrorIcon = false,
  allowToggleProviders = false,
}) => {
  const providerDiscoveryItems = useAppStore(
    (state) => state.providerDiscoveryItems,
  );
  const updateProviderApiKey = useAppStore(
    (state) => state.updateProviderApiKey,
  );
  const saveProviderApiKey = useAppStore((state) => state.saveProviderApiKey);
  const setProviderEnabled = useAppStore((state) => state.setProviderEnabled);
  const pendingProviderToggle = useAppStore(
    (state) => state.pendingProviderToggle,
  );

  const [apiKeyValidationStatuses, setApiKeyValidationStatuses] = useState<
    Partial<Record<AIProvider, ApiKeyValidationStatus>>
  >({});
  const [apiKeyValidationErrors, setApiKeyValidationErrors] = useState<
    Partial<Record<AIProvider, string>>
  >({});
  const apiKeyValidationTimers = useRef<
    Partial<Record<AIProvider, DebounceTimer>>
  >({});
  const apiKeyValidationSequences = useRef<Partial<Record<AIProvider, number>>>(
    {},
  );

  useEffect(() => {
    return () => {
      Object.values(apiKeyValidationTimers.current).forEach((timer) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  const handleApiKeyChange = (provider: AIProvider, key: string) => {
    updateProviderApiKey(provider, key);
    const normalizedKey = key.trim();
    const currentTimer = apiKeyValidationTimers.current[provider];
    const sequence = (apiKeyValidationSequences.current[provider] ?? 0) + 1;

    apiKeyValidationSequences.current[provider] = sequence;

    if (currentTimer !== undefined) {
      clearTimeout(currentTimer);
    }

    setApiKeyValidationStatuses((state) => ({
      ...state,
      [provider]: 'idle',
    }));
    setApiKeyValidationErrors((state) => ({
      ...state,
      [provider]: undefined,
    }));

    if (!normalizedKey) {
      return;
    }

    apiKeyValidationTimers.current[provider] = setTimeout(async () => {
      setApiKeyValidationStatuses((state) => ({
        ...state,
        [provider]: 'validating',
      }));
      setApiKeyValidationErrors((state) => ({
        ...state,
        [provider]: undefined,
      }));

      const result = await saveProviderApiKey(provider, normalizedKey);

      if (apiKeyValidationSequences.current[provider] !== sequence) {
        return;
      }

      setApiKeyValidationStatuses((state) => ({
        ...state,
        [provider]: result.success ? 'valid' : 'invalid',
      }));
      setApiKeyValidationErrors((state) => ({
        ...state,
        [provider]: result.error,
      }));
    }, 700);
  };

  const buildToggleHandler = (provider: AIProvider) =>
    allowToggleProviders && !isScanning
      ? (enabled: boolean) => {
          void setProviderEnabled(provider, enabled);
        }
      : undefined;

  const getProviderStatus = (item: (typeof providerDiscoveryItems)[number]) => {
    if (isScanning) {
      return 'scanning';
    }

    if (item.ready) {
      return 'found';
    }

    if (item.reason_code?.endsWith('_api_key_invalid')) {
      return 'invalid';
    }

    return 'not_found';
  };

  const cloudItems = providerDiscoveryItems.filter(
    (item) => item.provider !== 'ollama',
  );

  return (
    <div className={styles.providers}>
      {providerDiscoveryItems
        .filter((item) => item.provider === "ollama")
        .map((item) => (
          <div key={item.provider} className={styles.providerCard}>
            <ProviderStatusItem
              provider={item.provider}
              displayName={item.displayName}
              status={getProviderStatus(item)}
              progress={isScanning ? scanProgress : undefined}
              onApiKeyChange={(key) => handleApiKeyChange(item.provider, key)}
              apiKeySaveStatus={apiKeyValidationStatuses[item.provider] ?? 'idle'}
              apiKeyError={apiKeyValidationErrors[item.provider]}
              setupLink={item.setup_links?.[0]}
              suppressErrorIcon={suppressErrorIcon}
              enabled={item.enabled}
              onToggleEnabled={buildToggleHandler(item.provider)}
              isTogglePending={pendingProviderToggle === item.provider}
            />
          </div>
        ))}

      <div className={styles.providerCard}>
        {cloudItems.map((item) => (
          <ProviderStatusItem
            key={item.provider}
            provider={item.provider}
            displayName={item.displayName}
            status={getProviderStatus(item)}
            onApiKeyChange={(key) => handleApiKeyChange(item.provider, key)}
            apiKeySaveStatus={apiKeyValidationStatuses[item.provider] ?? 'idle'}
            apiKeyError={apiKeyValidationErrors[item.provider]}
            setupLink={item.api_key_links?.[0]}
            suppressErrorIcon={suppressErrorIcon}
            enabled={item.enabled}
            onToggleEnabled={buildToggleHandler(item.provider)}
            isTogglePending={pendingProviderToggle === item.provider}
          />
        ))}
      </div>
    </div>
  );
};
