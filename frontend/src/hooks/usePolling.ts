// frontend/src/hooks/usePolling.ts
import { useEffect, useRef } from 'react';
import { jobsApi } from 'services/api/api';
import { useAppStore } from 'store/useAppStore';
import { useUIStore } from 'store/useUIStore';
import type { AIProvider, ProcessingJob, StockPlatform } from 'types';


const POLLING_INTERVAL = 500;

export const usePolling = (jobId: string | null) => {
  const updateJobStatus = useAppStore((state) => state.updateJobStatus);
  const updateMetadata = useAppStore((state) => state.updateMetadata);

  const closeProgressModal = useUIStore((state) => state.closeProgressModal);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);
  const setIsProcessing = useUIStore((state) => state.setIsProcessing);
  const setCurrentProcessingProvider = useUIStore(
    (state) => state.setCurrentProcessingProvider,
  );

  const cancelBatchProcessing = useAppStore(
    (state) => state.cancelBatchProcessing,
  );
  const resetProcessingState = useUIStore(
    (state) => state.resetProcessingState,
  );

  const updateJobPreview = useAppStore((state) => state.updateJobPreview);
  const setStockOptions = useAppStore((state) => state.setStockOptions);
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

        if (isSelectableProvider(effectiveProvider)) {
          setCurrentProcessingProvider(
            effectiveProvider,
            statusData.effective_ai_model,
          );
        }

        if (statusData.files) {
          statusData.files.forEach((file: any) => {
            const status = normalizeFileStatus(file.status);
            updateJobStatus(file.file_id, status, file.error_message, {
              effective_ai_provider: file.effective_ai_provider,
              effective_ai_model: file.effective_ai_model,
            });
          });
        }

        const isDone =
          statusData.status === "completed" ||
          statusData.status === "error" ||
          statusData.status === "cancelled" ||
          statusData.status === "failed";

        if (isDone) {
          stopPolling();

          // Отмена могла прийти и помимо кнопки Cancel — приводим UI
          // к тому же состоянию «до старта».
          if (statusData.status === "cancelled") {
            cancelBatchProcessing();
            resetProcessingState();
            return;
          }

          setIsPollingActive(false);
          setIsProcessing(false);
          setCurrentProcessingProvider(null);

          if (statusData.status === "error") {
            closeProgressModal();
            return;
          }

          try {
            const [resultsResponse, optionsResponse] = await Promise.all([
              jobsApi.getResultsByStock(
                jobId,
                draftBatchSettings.stockPlatform as StockPlatform,
              ),
              jobsApi.getStockOptions(
                draftBatchSettings.stockPlatform as StockPlatform,
              ),
            ]);

            const results = resultsResponse.data?.results ?? [];

            results.forEach((file: any) => {
              const status = normalizeFileStatus(file.status);

              updateJobStatus(file.file_id, status, file.error_message, {
                effective_ai_provider: file.effective_ai_provider,
                effective_ai_model: file.effective_ai_model,
              });

              if (status !== "done") {
                return;
              }

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
        setCurrentProcessingProvider(null);
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
    draftBatchSettings,
    closeProgressModal,
    setIsExportReady,
    setIsPollingActive,
    setIsProcessing,
    setCurrentProcessingProvider,
    cancelBatchProcessing,
    resetProcessingState,
  ]);
};

const isSelectableProvider = (provider: unknown): provider is AIProvider =>
  provider === 'ollama' ||
  provider === 'gemini' ||
  provider === 'openrouter';

const normalizeFileStatus = (status: unknown): ProcessingJob['status'] => {
  if (status === 'completed' || status === 'done') {
    return 'done';
  }

  if (status === 'failed' || status === 'cancelled' || status === 'error') {
    return 'error';
  }

  if (status === 'processing') {
    return 'processing';
  }

  return 'queued';
};
