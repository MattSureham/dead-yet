import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LockScreen from '../../components/LockScreen';

const mockUnlock = jest.fn();
const mockResetSecurity = jest.fn();

jest.mock('../../contexts/SecurityContext', () => ({
  useSecurity: () => ({
    authState: 'unauthenticated',
    failedAttempts: 0,
    lockoutUntil: null,
    unlock: mockUnlock,
    resetSecurity: mockResetSecurity,
  }),
}));

jest.mock('../../services/StorageService', () => ({
  storageService: {
    clear: jest.fn(),
  },
}));

describe('LockScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlock.mockResolvedValue(true);
  });

  it('renders Enter PIN title', () => {
    const { getByText } = render(<LockScreen />);
    expect(getByText('Enter PIN')).toBeTruthy();
  });

  it('renders the subtitle', () => {
    const { getByText } = render(<LockScreen />);
    expect(getByText('Enter your PIN to unlock the app')).toBeTruthy();
  });

  it('renders keypad digits 1-9', () => {
    const { getByText } = render(<LockScreen />);
    for (let d = 1; d <= 9; d++) {
      expect(getByText(String(d))).toBeTruthy();
    }
  });

  it('renders 0 and delete button', () => {
    const { getByText } = render(<LockScreen />);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('⌫')).toBeTruthy();
  });

  it('renders Forgot PIN? text', () => {
    const { getByText } = render(<LockScreen />);
    expect(getByText('Forgot PIN?')).toBeTruthy();
  });

  it('auto-submits after entering 4 digits', () => {
    const { getByText } = render(<LockScreen />);

    fireEvent.press(getByText('1'));
    fireEvent.press(getByText('2'));
    fireEvent.press(getByText('3'));
    fireEvent.press(getByText('4'));

    // Auto-submit effect fires when pin.length >= 4
    expect(mockUnlock).toHaveBeenCalledWith('1234');
  });

  it('clears last digit on delete', () => {
    const { getByText } = render(<LockScreen />);

    fireEvent.press(getByText('5'));
    fireEvent.press(getByText('6'));
    fireEvent.press(getByText('7'));
    fireEvent.press(getByText('⌫'));

    // 2 digits remain, submit not yet triggered
    expect(mockUnlock).not.toHaveBeenCalled();

    // Press 2 more to reach 4-digit threshold
    fireEvent.press(getByText('8'));
    fireEvent.press(getByText('9'));
    expect(mockUnlock).toHaveBeenCalledWith('5689');
  });
});