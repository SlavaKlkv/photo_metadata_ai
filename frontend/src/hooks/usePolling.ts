// frontend/src/hooks/usePolling.ts
import { useEffect, useRef } from 'react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import type { AIProvider, StockPlatform } from 'types';


const POLLING_INTERVAL = 2000;

export const usePolling = (jobId: string | null) => {
  const updateJobStatus = useAppStore((state) => state.updateJobStatus);
  const updateMetadata = useAppStore((state) => state.updateMetadata);

  const closeProgressModal = useUIStore((state) => state.closeProgressModal);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);
  const setIsProcessing = useUIStore((state) => state.setIsProcessing);

  const updateJobPreview = useAppStore((state) => state.updateJobPreview);
  const setStockOptions = useAppStore((state) => state.setStockOptions);
  const setSelectedProvider = useAppStore((state) => state.setSelectedProvider);
  const saveSessionSettings = useAppStore(
    (state) => state.saveSessionSettings,
  );
  const selectedProvider = useAppStore(
    (state) => state.sessionSettings.selectedProvider,
  );
  const draftBatchSettings = useAppStore((state) => state.draftBatchSettings);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const response = await jobsApi.getStatus(jobId);
        const statusData = response.data;
        const effectiveProvider = statusData.effective_ai_provider;

        if (
          isSelectableProvider(effectiveProvider) &&
          effectiveProvider !== selectedProvider
        ) {
          setSelectedProvider(effectiveProvider);
          saveSessionSettings();
        }

        if (statusData.files) {
          statusData.files.forEach((file: any) => {
            const status = file.status === "completed" ? "done" : file.status;
            updateJobStatus(file.file_id, status, file.error_message);
          });
        }

        const isDone =
          statusData.status === "completed" ||
          statusData.status === "error" ||
          statusData.status === "cancelled" ||
          statusData.status === "failed";

        if (isDone) {
          stopPolling();
          setIsPollingActive(false);
          setIsProcessing(false);

          if (
            statusData.status === "failed" ||
            statusData.status === "error" ||
            statusData.status === "cancelled"
          ) {
            closeProgressModal();
            return;
          }

          try {
            const [resultsResponse, optionsResponse] = await Promise.all([
              jobsApi.getResults(jobId),
              jobsApi.getStockOptions(
                draftBatchSettings.stockPlatform as StockPlatform,
              ),
            ]);

            const results = resultsResponse.data?.results ?? [];

            results.forEach((file: any) => {
              // обновляем статус
              updateJobStatus(file.file_id, "done", file.error_message);

              // плоские поля — legacy metadata для обратной совместимости
              updateMetadata(file.file_id, {
                title: file.title ?? "",
                description: file.description ?? "",
                keywords: file.keywords ?? [],
              });

              // новый preview — stock-specific
              if (file.preview) {
                updateJobPreview(file.file_id, file.preview);
              }
            });

            if (optionsResponse.data) {
              setStockOptions(optionsResponse.data);
            }
          } catch (error) {
            console.error("[Results fetch error]:", error);
          }

          closeProgressModal();
          setIsExportReady(true);
        }
      } catch (error) {
        console.error("[Polling error]:", error);
        stopPolling();
        setIsPollingActive(false);
        setIsProcessing(false);
        closeProgressModal();
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLLING_INTERVAL);

    return () => stopPolling();
  }, [
    jobId,
    updateJobStatus,
    updateMetadata,
    updateJobPreview,
    setStockOptions,
    setSelectedProvider,
    saveSessionSettings,
    selectedProvider,
    draftBatchSettings,
    closeProgressModal,
    setIsExportReady,
    setIsPollingActive,
    setIsProcessing,
  ]);
};

const isSelectableProvider = (provider: unknown): provider is AIProvider =>
  provider === 'ollama' ||
  provider === 'gemini' ||
  provider === 'openrouter';
