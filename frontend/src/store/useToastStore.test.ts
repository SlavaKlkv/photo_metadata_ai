import { useToastStore } from './useToastStore';

beforeEach(() => {
  jest.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('adds and auto-removes finite toast', () => {
  jest.spyOn(Date, 'now').mockReturnValue(123);
  jest.spyOn(Math, 'random').mockReturnValue(0.5);

  useToastStore.getState().addToast('Saved', 'success', 100);

  expect(useToastStore.getState().toasts).toEqual([
    {
      id: 'toast-123-0.5',
      message: 'Saved',
      type: 'success',
      duration: 100,
    },
  ]);

  jest.advanceTimersByTime(100);
  expect(useToastStore.getState().toasts).toEqual([]);
});

test('keeps errors until explicit removal and can clear all', () => {
  useToastStore.getState().addToast('Failed', 'error');
  const errorToast = useToastStore.getState().toasts[0];

  jest.runOnlyPendingTimers();
  expect(useToastStore.getState().toasts).toHaveLength(1);

  useToastStore.getState().removeToast(errorToast.id);
  expect(useToastStore.getState().toasts).toEqual([]);

  useToastStore.getState().addToast('One', 'info');
  useToastStore.getState().addToast('Two', 'warning');
  useToastStore.getState().clearAll();
  expect(useToastStore.getState().toasts).toEqual([]);
});
