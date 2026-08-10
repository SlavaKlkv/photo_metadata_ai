// AISetupModal organism component
// Настройка AI-провайдеров после онбординга: открывается кнопкой
// "AI Setup" в шапке, показывает текущие статусы и позволяет
// добавить/заменить API-ключи в любой момент.
import React, { useEffect } from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { Modal } from '../../atoms/Modal/Modal';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { AIProviderSetup } from '../AIProviderSetup/AIProviderSetup';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';
import styles from './AISetupModal.module.scss';

export const AISetupModal: React.FC = () => {
  const isAiSetupOpen = useUIStore((state) => state.isAiSetupOpen);
  const closeAiSetup = useUIStore((state) => state.closeAiSetup);
  const isProcessing = useUIStore((state) => state.isProcessing);
  const isExportReady = useUIStore((state) => state.isExportReady);
  const isExporting = useUIStore((state) => state.isExporting);
  const hasAcceptedOnboarding = useAppStore(
    (state) => state.hasAcceptedOnboarding,
  );
  const discoverProviders = useAppStore((state) => state.discoverProviders);
  const providerDiscoveryItems = useAppStore(
    (state) => state.providerDiscoveryItems,
  );
  const providerDiscoveryError = useAppStore(
    (state) => state.providerDiscoveryError,
  );

  // Молча обновляем статусы провайдеров при каждом открытии
  useEffect(() => {
    if (isAiSetupOpen && hasAcceptedOnboarding) {
      discoverProviders({ silent: true });
    }
  }, [isAiSetupOpen, hasAcceptedOnboarding, discoverProviders]);

  // До завершения онбординга настройкой занимается OnboardingModal.
  // Смена провайдеров доступна только на шагах Upload/Context —
  // с начала обработки и до конца экспорта модалка скрыта.
  if (
    !hasAcceptedOnboarding ||
    !isAiSetupOpen ||
    isProcessing ||
    isExportReady ||
    isExporting
  ) {
    return null;
  }

  // Первичная загрузка провайдеров: список ещё пуст и ошибки нет.
  const isChecking =
    providerDiscoveryItems.length === 0 && !providerDiscoveryError;

  return (
    <Modal isOpen={true} onClose={closeAiSetup} closeOnEscape>
      <div className={styles.container}>
        <SectionHeader
          icon="ai-setup-icon"
          title="AI Setup"
          subtitle="Manage your AI providers. Add or update API keys."
        />

        {providerDiscoveryItems.length === 0 ? (
          providerDiscoveryError ? (
            <div className={styles.stateBox}>
              <p className={styles.errorText}>
                Couldn’t load AI providers. Reopen to try again.
              </p>
            </div>
          ) : (
            <div className={styles.stateBox}>
              <Icon name="load-icon" className={styles.spinner} />
              <p className={styles.loadingText}>Checking AI providers…</p>
            </div>
          )
        ) : (
          <AIProviderSetup allowToggleProviders />
        )}

        {!isChecking && (
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="md"
              onClick={closeAiSetup}
              className={styles.actionBtn}
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
