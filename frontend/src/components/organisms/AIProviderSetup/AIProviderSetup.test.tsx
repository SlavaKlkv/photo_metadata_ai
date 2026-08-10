import {
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useAppStore } from 'store/useAppStore';
import { AIProviderSetup } from './AIProviderSetup';

jest.mock(
  '../../molecules/ProviderStatusItem/ProviderStatusItem',
  () => ({
    ProviderStatusItem: (props: {
      provider: string;
      displayName: string;
      status: string;
      progress?: number;
      onApiKeyChange: (key: string) => void;
      apiKeySaveStatus: string;
      enabled?: boolean;
      onToggleEnabled?: (enabled: boolean) => void;
    }) => (
      <div
        data-testid={`provider-${props.provider}`}
        data-status={props.status}
        data-progress={props.progress}
        data-save-status={props.apiKeySaveStatus}
      >
        <span>{props.displayName}</span>
        <input
          aria-label={`${props.provider}-key`}
          onChange={(event) => props.onApiKeyChange(event.target.value)}
        />
        {props.onToggleEnabled && (
          <button
            aria-label={`${props.provider}-toggle`}
            onClick={() => props.onToggleEnabled?.(!props.enabled)}
          />
        )}
      </div>
    ),
  }),
);

beforeEach(() => {
  jest.useFakeTimers();
  useAppStore.setState({
    providerDiscoveryItems: [
      {
        provider: 'ollama',
        displayName: 'QWEN',
        ready: false,
        status: 'not_ready',
        hints: [],
        configured: true,
        local: true,
        enabled: true,
      },
      {
        provider: 'gemini',
        displayName: 'Gemini',
        ready: true,
        status: 'ready',
        hints: [],
        configured: true,
        local: false,
        enabled: true,
      },
    ],
    updateProviderApiKey: jest.fn(),
    saveProviderApiKey: jest.fn().mockResolvedValue({ success: true }),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

test('maps discovery state and scanning progress to provider items', () => {
  const { rerender } = render(<AIProviderSetup />);

  expect(screen.getByTestId('provider-ollama')).toHaveAttribute(
    'data-status',
    'not_found',
  );
  expect(screen.getByTestId('provider-gemini')).toHaveAttribute(
    'data-status',
    'found',
  );

  rerender(<AIProviderSetup isScanning scanProgress={42} />);
  expect(screen.getByTestId('provider-ollama')).toHaveAttribute(
    'data-status',
    'scanning',
  );
  expect(screen.getByTestId('provider-ollama')).toHaveAttribute(
    'data-progress',
    '42',
  );
});

test('debounces API key validation and saves the normalized key', async () => {
  fireEvent.change(
    render(<AIProviderSetup />).getByLabelText('gemini-key'),
    { target: { value: '  secret-key  ' } },
  );

  expect(
    useAppStore.getState().updateProviderApiKey,
  ).toHaveBeenCalledWith('gemini', '  secret-key  ');
  expect(useAppStore.getState().saveProviderApiKey).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(700);
    await Promise.resolve();
  });

  expect(useAppStore.getState().saveProviderApiKey).toHaveBeenCalledWith(
    'gemini',
    'secret-key',
  );
  expect(screen.getByTestId('provider-gemini')).toHaveAttribute(
    'data-save-status',
    'valid',
  );
});


test('provider toggles are hidden until AI Setup allows them', () => {
  render(<AIProviderSetup />);

  expect(screen.queryByLabelText('gemini-toggle')).not.toBeInTheDocument();
});

test('toggling a provider off persists it as disabled', () => {
  const setProviderEnabled = jest.fn().mockResolvedValue(undefined);
  useAppStore.setState({ setProviderEnabled });

  render(<AIProviderSetup allowToggleProviders />);
  fireEvent.click(screen.getByLabelText('gemini-toggle'));

  expect(setProviderEnabled).toHaveBeenCalledWith('gemini', false);
});

test('provider toggles stay hidden while scanning', () => {
  render(<AIProviderSetup allowToggleProviders isScanning />);

  expect(screen.queryByLabelText('gemini-toggle')).not.toBeInTheDocument();
});
