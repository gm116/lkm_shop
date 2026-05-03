import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import ResetPasswordPage from '../pages/ResetPasswordPage';
import {NotifyProvider} from '../store/notifyContext';
import {confirmPasswordReset, validatePasswordReset} from '../api/auth';

const mockNavigate = jest.fn();
let mockParams = {uid: 'uid123', token: 'token123'};

jest.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
}), {virtual: true});

jest.mock('../api/auth', () => ({
    confirmRegisterUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    refreshAccessToken: jest.fn(),
    registerUser: jest.fn(),
    requestPasswordReset: jest.fn(),
    validatePasswordReset: jest.fn(),
    confirmPasswordReset: jest.fn(),
}));

function renderPage() {
    return render(
        <NotifyProvider>
            <ResetPasswordPage />
        </NotifyProvider>
    );
}

describe('Reset password UX', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockParams = {uid: 'uid123', token: 'token123'};
    });

    test('invalid reset link hides password form and shows invalid-link state', async () => {
        validatePasswordReset.mockRejectedValue(new Error('Ссылка для сброса пароля недействительна или устарела'));

        renderPage();

        const invalidMessages = await screen.findAllByText('Ссылка недействительна или устарела');
        expect(invalidMessages.length).toBeGreaterThan(0);
        expect(screen.queryByPlaceholderText('Минимум 8 символов')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Повторите пароль')).not.toBeInTheDocument();
    });

    test('reset submit error is shown via toast only without inline duplicate', async () => {
        validatePasswordReset.mockResolvedValue({valid: true});
        confirmPasswordReset.mockRejectedValue(new Error('new_password: Пароль слишком простой'));

        renderPage();

        const passwordInput = await screen.findByPlaceholderText('Минимум 8 символов');
        const confirmInput = screen.getByPlaceholderText('Повторите пароль');

        fireEvent.change(passwordInput, {target: {value: 'GoodLengthPass123!'}});
        fireEvent.change(confirmInput, {target: {value: 'GoodLengthPass123!'}});

        fireEvent.click(screen.getByRole('button', {name: 'Сохранить пароль'}));

        await waitFor(() => {
            expect(screen.getByText('Пароль слишком простой')).toBeInTheDocument();
        });

        const occurrences = screen.getAllByText('Пароль слишком простой');
        expect(occurrences).toHaveLength(1);
    });
});
