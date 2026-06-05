// OnboardingModal organism component
import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Modal } from '../../atoms/Modal/Modal';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { ProviderStatusItem } from '../../molecules/ProviderStatusItem/ProviderStatusItem';
import styles from './OnboardingModal.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

export const OnboardingModal: React.FC = () => {
  const providerDiscoveryStatus = useAppStore(
    (state) => state.providerDiscoveryStatus,
  );
  const providerDiscoveryItems = useAppStore(
    (state) => state.providerDiscoveryItems,
  );
  const availableProviders = useAppStore((state) => state.availableProviders);
  const hasAcceptedOnboarding = useAppStore(
    (state) => state.hasAcceptedOnboarding,
  );
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const updateProviderApiKey = useAppStore(
    (state) => state.updateProviderApiKey,
  );

  // Simulated progress for QWEN during scanning
  const [qwenProgress, setQwenProgress] = useState(0);

  useEffect(() => {
    if (providerDiscoveryStatus === "loading") {
      setQwenProgress(0);
      const interval = setInterval(() => {
        setQwenProgress((prev) => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 30;
        });
      }, 300);
      return () => clearInterval(interval);
    }

    if (providerDiscoveryStatus === "ready") {
      setQwenProgress(100);
    }

    // явный return для всех остальных path
    return undefined;
  }, [providerDiscoveryStatus]);

  // Don't show if onboarding is already completed
  if (hasAcceptedOnboarding) {
    return null;
  }

  // Don't show if discovery hasn't started or errored critically
  if (
    providerDiscoveryStatus === "idle" ||
    providerDiscoveryStatus === "error"
  ) {
    return null;
  }

  const hasAtLeastOneProvider = availableProviders.length > 0;
  const isScanning = providerDiscoveryStatus === "loading";
  const isSuccess =
    providerDiscoveryStatus === "ready" && hasAtLeastOneProvider;
  const isError = providerDiscoveryStatus === "ready" && !hasAtLeastOneProvider;

  const handleGetStarted = () => {
    completeOnboarding();
  };

  const handleApiKeyChange = (provider: string, key: string) => {
    updateProviderApiKey(provider, key);
  };

  const cloudItems = providerDiscoveryItems
  .filter((item) => item.provider !== 'ollama')
  .filter((item) => isScanning || !isSuccess || item.ready);

  return (
    <Modal isOpen={true} onClose={() => {}}>
      <div className={styles.container}>
        {/* Header */}
        <SectionHeader
          icon="ai-setup-icon"
          title="Checking your AI setup"
          subtitle={
            isScanning
              ? "We're scanning your environment to find installed AI models and available processing tools."
              : isSuccess
                ? "We found compatible tools on your device. You're ready to start processing photos."
                : "We couldn't find any compatible tools. Connect a cloud service or install a local model to continue."
          }
        />
        {/* Provider Status List */}
        <div className={styles.providers}>
          {providerDiscoveryItems
            .filter((item) => item.provider === "ollama")
            .filter((item) => isScanning || !isSuccess || item.ready)
            .map((item) => (
              <div key={item.provider} className={styles.providerCard}>
                <ProviderStatusItem
                  provider={item.provider}
                  displayName={item.displayName}
                  status={
                    isScanning ? "scanning" : item.ready ? "found" : "not_found"
                  }
                  progress={isScanning ? qwenProgress : undefined}
                  onApiKeyChange={(key) =>
                    handleApiKeyChange(item.provider, key)
                  }
                  setupLink={item.setup_links?.[0]}
                />
              </div>
            ))}

          <div className={styles.providerCard}>
            {cloudItems.map((item) => (
              <ProviderStatusItem
                key={item.provider}
                provider={item.provider}
                displayName={item.displayName}
                status={
                  isScanning ? "scanning" : item.ready ? "found" : "not_found"
                }
                onApiKeyChange={(key) => handleApiKeyChange(item.provider, key)}
                setupLink={item.api_key_links?.[0]}
              />
            ))}
          </div>
        </div>
        {/* Hint (shown on success) */}
        {isSuccess && (
          <div className={styles.hint}>
            <Icon name="info-icon" className={styles.hintIcon} />
            <p>
              If one provider becomes unavailable, the app can switch to another
              automatically.
            </p>
          </div>
        )}
        {/* Action Button */}
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="md"
            onClick={handleGetStarted}
            disabled={isScanning} // TODO: для принудительного включения кнопки вернуть {isScanning || isError}
            className={styles.actionBtn}
          >
            {isScanning && "Scanning..."}
            {isSuccess && "Get Started"}
            {isError && "Connect at least one model"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
