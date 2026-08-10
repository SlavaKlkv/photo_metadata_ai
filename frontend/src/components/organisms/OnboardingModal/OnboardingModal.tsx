// OnboardingModal organism component
import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from 'store/useAppStore';
import { Modal } from '../../atoms/Modal/Modal';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { AIProviderSetup } from '../AIProviderSetup/AIProviderSetup';
import styles from './OnboardingModal.module.scss';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';

export const OnboardingModal: React.FC = () => {
  const providerDiscoveryStatus = useAppStore(
    (state) => state.providerDiscoveryStatus,
  );
  const availableProviders = useAppStore((state) => state.availableProviders);
  const hasAcceptedOnboarding = useAppStore(
    (state) => state.hasAcceptedOnboarding,
  );
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);

  // Simulated progress for QWEN during scanning
  const [qwenProgress, setQwenProgress] = useState(0);
  const [isScanningVisible, setIsScanningVisible] = useState(false);
  const scanDelayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanStartTime = useRef<number | null>(null);

  useEffect(() => {
    if (providerDiscoveryStatus === "loading") {
      scanStartTime.current = Date.now();
      setIsScanningVisible(true);
      setQwenProgress(0);

      const interval = setInterval(() => {
        setQwenProgress((prev) => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 30;
        });
      }, 300);

      return () => {
        clearInterval(interval);
        if (scanDelayTimer.current) {
          clearTimeout(scanDelayTimer.current);
          scanDelayTimer.current = null;
        }
      };
    }

    if (providerDiscoveryStatus === "ready") {
      setQwenProgress(100);
      const elapsed = scanStartTime.current
        ? Date.now() - scanStartTime.current
        : 0;
      const remaining = Math.max(5000 - elapsed, 0);

      if (remaining > 0) {
        scanDelayTimer.current = setTimeout(() => {
          setIsScanningVisible(false);
          scanDelayTimer.current = null;
        }, remaining);
      } else {
        setIsScanningVisible(false);
      }

      return () => {
        if (scanDelayTimer.current) {
          clearTimeout(scanDelayTimer.current);
          scanDelayTimer.current = null;
        }
      };
    }

    setIsScanningVisible(false);

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
  const isScanning = isScanningVisible;
  const isSuccess =
    providerDiscoveryStatus === "ready" && !isScanning && hasAtLeastOneProvider;
  const isError =
    providerDiscoveryStatus === "ready" && !isScanning && !hasAtLeastOneProvider;

  const handleGetStarted = () => {
    completeOnboarding();
  };

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
        <AIProviderSetup
          isScanning={isScanning}
          scanProgress={qwenProgress}
          suppressErrorIcon={isSuccess}
        />
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
            disabled={isScanning} // для принудительного включения кнопки вернуть {isScanning || isError}
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
