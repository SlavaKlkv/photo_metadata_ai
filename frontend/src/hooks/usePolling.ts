// usePolling.ts
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
  const isProgressModalOpen = useUIStore((state) => state.isProgressModalOpen);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // ref чтобы poll() всегда видел актуальное значение, не замыкание
  const isModalOpenRef = useRef(isProgressModalOpen);
  useEffect(() => {
    isModalOpenRef.current = isProgressModalOpen;
  }, [isProgressModalOpen]);

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

            if (file.status === 'completed' && file.metadata) {
              updateMetadata(file.file_id, file.metadata);
            }
          });
        }

        const isDone = statusData.status === 'completed' || statusData.status === 'error';
        if (isDone) {
          stopPolling();
          // читаем ref — всегда актуальное значение
          if (isModalOpenRef.current) {
            closeProgressModal();
            setIsExportReady(true);
          }
        }
      } catch (error) {
        console.error('[Polling error]:', error);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLLING_INTERVAL);

    return () => stopPolling();
  }, [jobId]);
};