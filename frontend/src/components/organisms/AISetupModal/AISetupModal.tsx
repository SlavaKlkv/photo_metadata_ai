// AISetupModal organism component
// Настройка AI-провайдеров после онбординга: открывается кнопкой
// "AI Setup" в шапке, показывает текущие статусы и позволяет
// добавить/заменить API-ключи в любой момент.
import React, { useEffect } from 'react';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import { Modal } from '../../atoms/Modal/Modal';
import { Button } from '../../atoms/Button/Button';
import { AIProviderSetup } from '../AIProviderSetup/AIProviderSetup';
import { SectionHeader } from '../../molecules/SectionHeader/SectionHeader';
import styles from './AISetupModal.module.scss';

export const AISetupModal: React.FC = () => {
  const isAiSetupOpen = useUIStore((state) => state.isAiSetupOpen);
  const closeAiSetup = useUIStore((state) => state.closeAiSetup);
  const hasAcceptedOnboarding = useAppStore(
    (state) => state.hasAcceptedOnboarding,
  );
  const discoverProviders = useAppStore((state) => state.discoverProviders);

  // Молча обновляем статусы провайдеров при каждом открытии
  useEffect(() => {
    if (isAiSetupOpen && hasAcceptedOnboarding) {
      discoverProviders({ silent: true });
    }
  }, [isAiSetupOpen, hasAcceptedOnboarding, discoverProviders]);

  // До завершения онбординга настройкой занимается OnboardingModal
  if (!hasAcceptedOnboarding || !isAiSetupOpen) {
    return null;
  }

  return (
    <Modal isOpen={true} onClose={closeAiSetup}>
      <div className={styles.container}>
        <SectionHeader
          icon="ai-setup-icon"
          title="AI Setup"
          subtitle="Manage your AI providers. Add or update API keys anytime."
        />

        <AIProviderSetup />

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
      </div>
    </Modal>
  );
};
