import { useUIStore } from './useUIStore';

const initialState = useUIStore.getState();

beforeEach(() => {
  useUIStore.setState(initialState, true);
});

test('opens and closes modal state independently', () => {
  const state = useUIStore.getState();

  state.openAiSetup();
  state.openProgressModal();
  state.openExportModal();
  state.openSuccessModal();

  expect(useUIStore.getState()).toMatchObject({
    isAiSetupOpen: true,
    isProgressModalOpen: true,
    isExportModalOpen: true,
    isSuccessModalOpen: true,
  });

  useUIStore.getState().closeAiSetup();
  useUIStore.getState().closeProgressModal();
  useUIStore.getState().closeExportModal();
  useUIStore.getState().closeSuccessModal();

  expect(useUIStore.getState()).toMatchObject({
    isAiSetupOpen: false,
    isProgressModalOpen: false,
    isExportModalOpen: false,
    isSuccessModalOpen: false,
  });
});

test('updates processing, selection and export state', () => {
  const state = useUIStore.getState();

  state.toggleFileList();
  state.setIsProcessing(true);
  state.setIsUploaded(true);
  state.setIsExportReady(true);
  state.setCurrentJobId('job-1');
  state.setSelectedJobId('file-1');
  state.setIsPollingActive(true);
  state.setIsExporting(true);
  state.setCurrentProcessingProvider('gemini', 'gemini-model');
  state.setExportArtifacts([
    {
      export_format: 'csv',
      filename: 'metadata.csv',
      path: '/tmp/metadata.csv',
      size_bytes: 10,
      count: 2,
    },
  ]);

  expect(useUIStore.getState()).toMatchObject({
    isFileListOpen: false,
    isProcessing: true,
    isUploaded: true,
    isExportReady: true,
    currentJobId: 'job-1',
    selectedJobId: 'file-1',
    isPollingActive: true,
    isExporting: true,
    currentProcessingProvider: 'gemini',
    currentProcessingModel: 'gemini-model',
  });
  expect(useUIStore.getState().exportArtifacts).toHaveLength(1);

  useUIStore.getState().setCurrentProcessingProvider(null);
  expect(useUIStore.getState()).toMatchObject({
    currentProcessingProvider: null,
    currentProcessingModel: null,
  });
});
