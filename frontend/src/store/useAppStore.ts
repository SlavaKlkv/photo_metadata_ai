// frontend/src/store/useAppStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  ProcessingJob,
  SessionSettings,
  BatchSettings,
  ProviderDiscoveryItem,
  AIProvider,
  StockOptions,
  FilePreview,
  StockPlatform,
  DesktopUpdateCheckResponse,
} from "../types";
import { jobsApi } from "../services/api/api";

const defaultSessionSettings: SessionSettings = {
  selectedProvider: null,
};

const defaultBatchSettings: BatchSettings = {
  shootingContext: "",
  stockPlatform: "getty_images",
  exportFormats: {
    csv: true,
    iptc: false,
  },
};

interface ProviderDiscoveryOptions {
  silent?: boolean;
}

export interface AppState {
  jobs: ProcessingJob[];
  sessionSettings: SessionSettings;
  availableProviders: AIProvider[];
  providerDiscoveryItems: ProviderDiscoveryItem[];
  providerDiscoveryStatus: "idle" | "loading" | "ready" | "error";
  providerDiscoveryError: string | null;
  draftBatchSettings: BatchSettings;
  lockedBatchSettings: BatchSettings | null;
  isProcessing: boolean;
  diagnosticCount: number;
  hasAcceptedOnboarding: boolean;
  manualProviderApiKeys: Record<string, string>;
  stockOptions: StockOptions | null;
  updateInfo: DesktopUpdateCheckResponse | null;
  isUpdateBannerVisible: boolean;

  setStockOptions: (options: StockOptions) => void;
  checkForUpdates: () => Promise<void>;
  dismissUpdateBanner: () => void;

  // обновить preview конкретного файла после смены стока
  updateJobPreview: (fileId: string, preview: FilePreview) => void;
  applyMetadataResult: (
    fileId: string,
    result: {
      title?: string;
      description?: string;
      keywords?: string[];
      selected_for_export?: boolean;
      effective_ai_provider?: ProcessingJob["effective_ai_provider"];
      effective_ai_model?: ProcessingJob["effective_ai_model"];
      field_sources?: ProcessingJob["field_sources"];
      edited_fields?: string[];
      preview?: FilePreview;
      error_message?: string | null;
    },
  ) => void;

  // сменить сток и перезапросить results + stock-options
  switchStockPlatform: (
    stockPlatform: StockPlatform,
    jobId: string,
  ) => Promise<void>;

  addJobs: (files: ProcessingJob[]) => void;
  updateJobStatus: (
    jobId: string,
    status: ProcessingJob["status"],
    error?: string,
    updates?: Pick<
      ProcessingJob,
      "effective_ai_provider" | "effective_ai_model"
    >,
  ) => void;
  updateMetadata: (jobId: string, metadata: ProcessingJob["metadata"]) => void;
  updateJobSelection: (jobId: string, selectedForExport: boolean) => void;
  updateAllJobsSelection: (selectedForExport: boolean) => void;
  removeJob: (jobId: string) => void;

  updateSessionSetting: (
    key: keyof SessionSettings,
    value: SessionSettings[keyof SessionSettings],
  ) => void;
  setSelectedProvider: (provider: AIProvider | null) => void;
  discoverProviders: (options?: ProviderDiscoveryOptions) => Promise<void>;
  updateDraftBatchSetting: <K extends keyof BatchSettings>(
    key: K,
    value: BatchSettings[K],
  ) => void;
  updateExportFormat: (
    key: keyof BatchSettings["exportFormats"],
    value: boolean,
  ) => void;
  lockBatchSettings: () => void;
  unlockBatchSettings: () => void;
  resetBatchState: () => void;
  cancelBatchProcessing: () => void;

  setIsProcessing: (isProcessing: boolean) => void;
  inc: () => void;

  getOverallProgress: () => number;
  getFileById: (fileId: string) => ProcessingJob | undefined;
  hasErrors: () => boolean;
  clearAll: () => void;

  previews: Record<string, string>;
  addPreviews: (previews: Record<string, string>) => void;
  clearPreviews: () => void;

  loadSessionSettings: () => void;
  saveSessionSettings: () => void;

  completeOnboarding: () => void;
  updateProviderApiKey: (provider: string, key: string) => void;
  saveProviderApiKey: (
    provider: AIProvider,
    key: string,
  ) => Promise<{ success: boolean; error?: string }>;
  setProviderEnabled: (
    provider: AIProvider,
    enabled: boolean,
  ) => Promise<void>;
  // Провайдер, для которого сохранение переключателя ещё не завершилось.
  pendingProviderToggle: AIProvider | null;

  // regenerate одного файла, используя lockedBatchSettings — не дёргает весь batch
  regeneratingFileId: string | null;
  regenerateFile: (
    fileId: string,
    currentJobId: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    jobs: [],
    sessionSettings: defaultSessionSettings,
    availableProviders: [],
    providerDiscoveryStatus: "idle",
    providerDiscoveryItems: [],
    providerDiscoveryError: null,
    pendingProviderToggle: null,
    draftBatchSettings: defaultBatchSettings,
    lockedBatchSettings: null,
    isProcessing: false,
    diagnosticCount: 0,
    regeneratingFileId: null,
    hasAcceptedOnboarding: false,
    manualProviderApiKeys: {},
    stockOptions: null,
    updateInfo: null,
    isUpdateBannerVisible: false,

    checkForUpdates: async () => {
      try {
        const response = await jobsApi.checkForUpdates();
        const updateInfo = response.data;
        const dismissedVersion = localStorage.getItem(
          "update_dismissed_version",
        );
        const isUpdateBannerVisible =
          updateInfo.status === "ok" &&
          updateInfo.update_available &&
          updateInfo.latest_version !== null &&
          dismissedVersion !== updateInfo.latest_version;

        set({ updateInfo, isUpdateBannerVisible });
      } catch {
        // Проверка обновлений не должна мешать запуску приложения.
      }
    },

    dismissUpdateBanner: () => {
      const latestVersion = get().updateInfo?.latest_version;
      if (latestVersion) {
        localStorage.setItem("update_dismissed_version", latestVersion);
      }
      set({ isUpdateBannerVisible: false });
    },

    addJobs: (newJobs: ProcessingJob[]) => {
      set((state) => ({
        jobs: [...state.jobs, ...newJobs],
      }));
    },

    updateJobStatus: (
      jobId: string,
      status: ProcessingJob["status"],
      error?: string,
      updates = {},
    ) => {
      set((state) => ({
        jobs: state.jobs.map((job) => {
          if (job.id !== jobId) return job;

          const next = { ...job, status, error, ...updates };

          // Упавший файл экспортировать нечем — снимаем его с экспорта,
          // чтобы он не блокировал кнопку и не искажал счётчик выбранных.
          // Явный выбор пользователя тут не теряется: вернуть галочку
          // всё равно нельзя, бэкенд экспортирует только COMPLETED
          if (status === "error") {
            next.selected_for_export = false;
          }

          return next;
        }),
      }));
    },

    updateMetadata: (jobId: string, metadata: ProcessingJob["metadata"]) => {
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId ? { ...job, metadata } : job,
        ),
      }));
    },

    updateJobSelection: (jobId, selectedForExport) => {
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === jobId
            ? { ...job, selected_for_export: selectedForExport }
            : job,
        ),
      }));
    },

    updateAllJobsSelection: (selectedForExport) => {
      set((state) => ({
        jobs: state.jobs.map((job) => ({
          ...job,
          selected_for_export: selectedForExport,
        })),
      }));
    },

    removeJob: (jobId: string) => {
      set((state) => ({
        jobs: state.jobs.filter((job) => job.id !== jobId),
      }));
    },

    updateSessionSetting: (key, value) => {
      set((state) => ({
        sessionSettings: {
          ...state.sessionSettings,
          [key]: value,
        },
      }));
    },

    setSelectedProvider: (provider) => {
      set((state) => ({
        sessionSettings: {
          ...state.sessionSettings,
          selectedProvider: provider,
        },
      }));
    },

    discoverProviders: async (options = {}) => {
      const isSilent = options.silent === true;

      if (!isSilent) {
        set({
          providerDiscoveryStatus: "loading",
          providerDiscoveryError: null,
        });
      }

      try {
        const response = await jobsApi.providerDiscovery();
        const discoveryData = response.data;

        if (!discoveryData || !Array.isArray(discoveryData.providers)) {
          throw new Error("Invalid provider discovery response");
        }

        const providerDiscoveryItems: ProviderDiscoveryItem[] = (
          discoveryData.providers ?? []
        ).map((item: any) => ({
          provider: item.provider as AIProvider,
          displayName: item.display_name,
          ready: item.ready,
          status: item.status,
          source: item.source,
          reason: item.reason,
          reason_code: item.reason_code,
          hints: item.hints ?? [],
          configured: item.configured ?? false,
          local: item.local ?? false,
          enabled: item.enabled ?? true,
          model: item.model,
          setup_links: item.setup_links ?? [],
          api_key_links: item.api_key_links ?? [],
        }));

        const availableProviders = providerDiscoveryItems
          .filter((item) => item.ready && item.enabled)
          .map((item) => item.provider);

        console.log("[Provider Discovery] Found providers:", {
          total: providerDiscoveryItems.length,
          available: availableProviders.length,
          items: availableProviders,
        });

        set((state) => {
          const selectedProvider = state.sessionSettings.selectedProvider;
          const isSelectedProviderAvailable =
            selectedProvider !== null &&
            availableProviders.includes(selectedProvider);
          const shouldAutoSelect =
            availableProviders.length === 1 &&
            selectedProvider !== availableProviders[0];
          const shouldClearSelection =
            selectedProvider !== null &&
            !isSelectedProviderAvailable &&
            availableProviders.length === 0;

          return {
            providerDiscoveryItems,
            availableProviders,
            providerDiscoveryStatus: "ready",
            sessionSettings: shouldAutoSelect
              ? {
                  ...state.sessionSettings,
                  selectedProvider: availableProviders[0],
                }
              : shouldClearSelection
                ? {
                    ...state.sessionSettings,
                    selectedProvider: null,
                  }
                : state.sessionSettings,
          };
        });
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error ? error.message : "Provider discovery failed";
        console.error("[Provider Discovery] Error:", errorMsg, error);

        if (isSilent) {
          set({ providerDiscoveryError: errorMsg });
          return;
        }

        set({
          providerDiscoveryStatus: "error",
          providerDiscoveryError: errorMsg,
          availableProviders: [],
          providerDiscoveryItems: [],
        });
      }
    },

    updateDraftBatchSetting: (key, value) => {
      set((state) => ({
        draftBatchSettings: {
          ...state.draftBatchSettings,
          [key]: value,
        },
      }));
    },

    updateExportFormat: (key, value) => {
      set((state) => ({
        draftBatchSettings: {
          ...state.draftBatchSettings,
          exportFormats: {
            ...state.draftBatchSettings.exportFormats,
            [key]: value,
          },
        },
      }));
    },

    lockBatchSettings: () => {
      const { draftBatchSettings } = get();
      set({
        lockedBatchSettings: {
          shootingContext: draftBatchSettings.shootingContext,
          stockPlatform: draftBatchSettings.stockPlatform,
          exportFormats: { ...draftBatchSettings.exportFormats },
        },
      });
    },

    unlockBatchSettings: () => {
      set({ lockedBatchSettings: null });
    },

    resetBatchState: () => {
      set({
        draftBatchSettings: defaultBatchSettings,
        lockedBatchSettings: null,
        jobs: [],
        isProcessing: false,
        previews: {},
        regeneratingFileId: null,
      });
    },

    // Отмена возвращает batch в состояние «до старта»: фото и введённый
    // контекст остаются, но частичные результаты прогона стираются.
    cancelBatchProcessing: () => {
      set((state) => ({
        lockedBatchSettings: null,
        isProcessing: false,
        regeneratingFileId: null,
        jobs: state.jobs.map((job) => ({
          id: job.id,
          filename: job.filename,
          originalFilename: job.originalFilename,
          status: "queued" as const,
        })),
      }));
    },

    setIsProcessing: (isProcessing: boolean) => {
      set({ isProcessing });
    },

    inc: () => {
      set((state) => ({
        diagnosticCount: state.diagnosticCount + 1,
      }));
    },

    previews: {},
    addPreviews: (newPreviews) =>
      set((state) => ({
        previews: { ...state.previews, ...newPreviews },
      })),
    clearPreviews: () => set({ previews: {} }),

    getOverallProgress: () => {
      const { jobs } = get();
      if (jobs.length === 0) return 0;

      const completedCount = jobs.filter(
        (job) => job.status === "done" || job.status === "error",
      ).length;

      return Math.round((completedCount / jobs.length) * 100);
    },

    getFileById: (fileId: string) => {
      const { jobs } = get();
      return jobs.find((job) => job.id === fileId);
    },

    hasErrors: () => {
      const { jobs } = get();
      return jobs.some((job) => job.status === "error");
    },

    clearAll: () => {
      set({
        jobs: [],
        isProcessing: false,
        previews: {},
      });
    },

    loadSessionSettings: () => {
      try {
        const saved = localStorage.getItem("session_settings");
        if (saved) {
          const parsed = JSON.parse(saved);
          set((state) => ({
            sessionSettings: {
              selectedProvider: parsed.selectedProvider ?? null,
            },
          }));
        }

        // Load onboarding status
        const onboardingCompleted = localStorage.getItem(
          "onboarding_completed",
        );
        if (onboardingCompleted === "true") {
          set({ hasAcceptedOnboarding: true });
        }
      } catch (err) {
        console.error("Failed to load session settings:", err);
      }
    },

    saveSessionSettings: () => {
      try {
        const { sessionSettings } = get();
        localStorage.setItem(
          "session_settings",
          JSON.stringify(sessionSettings),
        );
      } catch (err) {
        console.error("Failed to save session settings:", err);
      }
    },

    completeOnboarding: async () => {
      const { sessionSettings } = get();

      try {
        // сохраняем выбранный провайдер или mock если ничего не выбрано
        await jobsApi.updateDesktopSettings({
          selected_provider: sessionSettings.selectedProvider ?? "mock",
        });
      } catch (err) {
        console.error("[completeOnboarding] Failed to save provider:", err);
      }

      set({ hasAcceptedOnboarding: true });
      localStorage.setItem("onboarding_completed", "true");
    },

    updateProviderApiKey: (provider: string, key: string) => {
      set((state) => ({
        manualProviderApiKeys: {
          ...state.manualProviderApiKeys,
          [provider]: key,
        },
      }));
    },

    saveProviderApiKey: async (provider, key) => {
      if (provider !== "gemini" && provider !== "openrouter") {
        return {
          success: false,
          error: "Provider does not support API keys",
        };
      }

      const normalizedKey = key.trim();

      if (!normalizedKey) {
        return {
          success: false,
          error: "API key is required",
        };
      }

      try {
        const response = await jobsApi.validateAndSaveProviderApiKey(
          provider,
          normalizedKey,
        );

        if (!response.data?.valid || !response.data?.saved) {
          return {
            success: false,
            error: response.data?.message ?? "Invalid API key",
          };
        }

        set((state) => ({
          sessionSettings: {
            ...state.sessionSettings,
            selectedProvider: provider,
          },
          manualProviderApiKeys: {
            ...state.manualProviderApiKeys,
            [provider]: "",
          },
        }));

        await get().discoverProviders({ silent: true });

        return { success: true };
      } catch {
        return {
          success: false,
          error: "Failed to validate API key",
        };
      }
    },

    setProviderEnabled: async (provider, enabled) => {
      const { providerDiscoveryItems, pendingProviderToggle } = get();

      if (pendingProviderToggle !== null) {
        return;
      }

      const disabledProviders = providerDiscoveryItems
        .filter((item) =>
          item.provider === provider ? !enabled : !item.enabled,
        )
        .map((item) => item.provider);

      // Тумблер не переключаем оптимистично: положение меняется только по
      // подтверждению бэкенда, иначе он дёргается, пока запрос в пути.
      set({ pendingProviderToggle: provider });

      try {
        const response = await jobsApi.updateDesktopSettings({
          disabled_providers: disabledProviders,
        });
        const savedDisabled: string[] = response.data?.disabled_providers ?? [];
        const nextItems = providerDiscoveryItems.map((item) => ({
          ...item,
          enabled: !savedDisabled.includes(item.provider),
        }));
        const availableProviders = nextItems
          .filter((item) => item.ready && item.enabled)
          .map((item) => item.provider);
        // Бэкенд передаёт выбор дальше по кольцу fallback, если выключили
        // текущего провайдера. Но если и этот провайдер недоступен (нет ключа
        // или рантайма) — сбрасываем выбор сразу, не дожидаясь следующего
        // опроса discovery, иначе в дропдауне зависает несуществующий выбор.
        const savedProvider: AIProvider | undefined =
          response.data?.selected_provider;
        const nextSelectedProvider =
          savedProvider && availableProviders.includes(savedProvider)
            ? savedProvider
            : null;

        set((state) => ({
          providerDiscoveryItems: nextItems,
          availableProviders,
          sessionSettings: {
            ...state.sessionSettings,
            selectedProvider: nextSelectedProvider,
          },
          draftBatchSettings: nextSelectedProvider
            ? { ...state.draftBatchSettings, aiProvider: nextSelectedProvider }
            : state.draftBatchSettings,
        }));

        get().saveSessionSettings();
      } catch (error) {
        console.error("[setProviderEnabled] Failed to save:", error);
      } finally {
        set({ pendingProviderToggle: null });
      }
    },

    setStockOptions: (options) => {
      set({ stockOptions: options });
    },

    updateJobPreview: (fileId, preview) => {
      set((state) => ({
        jobs: state.jobs.map((job) =>
          job.id === fileId ? { ...job, preview } : job,
        ),
      }));
    },

    applyMetadataResult: (fileId, result) => {
      set((state) => ({
        jobs: state.jobs.map((job) => {
          if (job.id !== fileId) return job;

          const title = result.title ?? job.title;
          const description = result.description ?? job.description;
          const keywords = result.keywords ?? job.keywords;

          return {
            ...job,
            title,
            description,
            keywords,
            selected_for_export:
              result.selected_for_export ?? job.selected_for_export,
            effective_ai_provider:
              result.effective_ai_provider ?? job.effective_ai_provider,
            effective_ai_model:
              result.effective_ai_model ?? job.effective_ai_model,
            field_sources: result.field_sources ?? job.field_sources,
            edited_fields: result.edited_fields ?? job.edited_fields,
            preview: result.preview ?? job.preview,
            error: result.error_message ?? job.error,
            metadata: {
              title: title ?? job.metadata?.title ?? "",
              description: description ?? job.metadata?.description ?? "",
              keywords: keywords ?? job.metadata?.keywords ?? [],
            },
          };
        }),
      }));
    },

    // меняет stock preview без новой AI генерации —
    // GET results?stock_platform + GET stock-options
    switchStockPlatform: async (stockPlatform, jobId) => {
      const { setStockOptions, updateJobPreview, updateDraftBatchSetting } =
        get();

      // обновляем draft чтобы UI отразил новый выбор
      updateDraftBatchSetting("stockPlatform", stockPlatform);

      try {
        const [resultsResponse, optionsResponse] = await Promise.all([
          jobsApi.getResultsByStock(jobId, stockPlatform),
          jobsApi.getStockOptions(stockPlatform),
        ]);

        // обновляем preview для каждого файла
        const results = resultsResponse.data?.results ?? [];

        results.forEach((file: any) => {
          if (file.preview) {
            updateJobPreview(file.file_id, file.preview);
          }
        });

        // сохраняем stock options для валидации в MetadataPreview
        if (optionsResponse.data) {
          setStockOptions(optionsResponse.data);
        }
      } catch (error) {
        console.error("[switchStockPlatform] Error:", error);
      }
    },

    // Regenerate одного файла использует исходный shooting context,
    // но текущую выбранную stock platform для нового preview/export mapping.
    regenerateFile: async (fileId, currentJobId) => {
      const {
        lockedBatchSettings,
        draftBatchSettings,
        sessionSettings,
        applyMetadataResult,
      } = get();

      // regenerate доступен только после processing — locked settings обязательны
      if (!lockedBatchSettings) {
        return { success: false, error: "No locked batch settings found" };
      }

      // провайдер ОБЯЗАТЕЛЕН
      if (!sessionSettings.selectedProvider) {
        return { success: false, error: "AI provider not selected" };
      }

      set({ regeneratingFileId: fileId });

      try {
        const response = await jobsApi.regenerateFile(currentJobId, fileId, {
          shooting_context: lockedBatchSettings.shootingContext,
          stock_platform: draftBatchSettings.stockPlatform,
          ai_provider: sessionSettings.selectedProvider,
        });

        const newMetadata = response.data?.metadata;
        if (newMetadata) {
          applyMetadataResult(fileId, newMetadata);
        }

        return { success: true };
      } catch (err: unknown) {
        console.warn("[regenerateFile] Failed:", err);

        const responseDetail = (
          err as { response?: { data?: { detail?: string } } }
        ).response?.data?.detail;

        return {
          success: false,
          error: responseDetail ?? "Failed to regenerate metadata",
        };
      } finally {
        set({ regeneratingFileId: null });
      }
    }
  })),
);
