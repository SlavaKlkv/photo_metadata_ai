// frontend/src/hooks/usePolling.ts
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUIStore } from '../store/useUIStore';
import { jobsApi } from '../services/api/api';

const POLLING_INTERVAL = 2000;

export const usePolling = (jobId: string | null) => {
  const updateJobStatus = useAppStore((state) => state.updateJobStatus);
  const updateMetadata = useAppStore((state) => state.updateMetadata);

  const closeProgressModal = useUIStore((state) => state.closeProgressModal);
  const setIsExportReady = useUIStore((state) => state.setIsExportReady);
  const setIsPollingActive = useUIStore((state) => state.setIsPollingActive);
  const setIsProcessing = useUIStore((state) => state.setIsProcessing);

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

        if (statusData.files) {
          statusData.files.forEach((file: any) => {
            const status = file.status === 'completed' ? 'done' : file.status;
            updateJobStatus(file.file_id, status, file.error_message);
          });
        }

        const isDone =
          statusData.status === 'completed' ||
          statusData.status === 'error' ||
          statusData.status === 'cancelled' ||
          statusData.status === 'failed';

        if (isDone) {
          stopPolling();
          setIsPollingActive(false);
          setIsProcessing(false);

          if (
            statusData.status === 'failed' ||
            statusData.status === 'error' ||
            statusData.status === 'cancelled'
          ) {
            closeProgressModal();
            return;
          }

          try {
            const resultsResponse = await jobsApi.getResults(jobId);
            const results = resultsResponse.data;

            if (results.results) {
              results.results.forEach((file: any) => {
                updateMetadata(file.file_id, {
                  title: file.title ?? '',
                  description: file.description ?? '',
                  keywords: file.keywords ?? [],
                });
              });
            }
          } catch (error) {
            console.error('[Results fetch error]:', error);
          }

          closeProgressModal();
          setIsExportReady(true);
        }
      } catch (error) {
        console.error('[Polling error]:', error);
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
    closeProgressModal,
    setIsExportReady,
    setIsPollingActive,
    setIsProcessing,
  ]);
};