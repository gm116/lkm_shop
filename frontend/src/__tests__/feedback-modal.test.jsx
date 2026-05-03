import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

import FeedbackModal from '../components/FeedbackModal';
import styles from '../styles/FeedbackModal.module.css';

const mockNotify = {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
};

jest.mock('../store/authContext', () => ({
    useAuth: () => ({
        user: {
            first_name: 'Иван',
            last_name: 'Петров',
            email: 'ivan@example.com',
        },
    }),
}));

jest.mock('../store/notifyContext', () => ({
    useNotify: () => mockNotify,
}));

jest.mock('react-router-dom', () => ({
    Link: ({children, ...props}) => <a {...props}>{children}</a>,
}), {virtual: true});

function renderModal(props = {}) {
    const onClose = jest.fn();
    const utils = render(<FeedbackModal open onClose={onClose} {...props} />);
    return {onClose, ...utils};
}

function getFieldErrorByInput(inputEl) {
    const field = inputEl.closest(`.${styles.field}`);
    return field ? field.querySelector(`.${styles.fieldError}`) : null;
}

describe('Feedback modal flow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    test('opens as modal with overlay and locks body scroll', () => {
        const {container, onClose} = renderModal();

        expect(screen.getByRole('heading', {name: 'Обратная связь'})).toBeInTheDocument();
        expect(document.body.style.overflow).toBe('hidden');

        const overlay = container.firstChild;
        fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('shows required stars and validates required fields', async () => {
        const {container} = renderModal();

        const stars = container.querySelectorAll(`.${styles.requiredStar}`);
        expect(stars).toHaveLength(3);

        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        expect(await screen.findByText('Укажите тему обращения')).toBeInTheDocument();

        const emailInput = screen.getByLabelText(/Email/i);
        const subjectInput = screen.getByLabelText(/Тема обращения/i);
        const messageInput = screen.getByLabelText(/Опишите ваш вопрос/i);
        const messageError = getFieldErrorByInput(messageInput);

        expect(emailInput.classList.contains(styles.inputInvalid)).toBe(false);
        expect(subjectInput.classList.contains(styles.inputInvalid)).toBe(true);
        expect(messageInput.classList.contains(styles.inputInvalid)).toBe(true);
        expect(messageError).toBeInTheDocument();
        expect(messageError.textContent).toContain('Опишите ваш вопрос');
    });

    test('validates email in real time', async () => {
        renderModal();

        const emailInput = screen.getByLabelText(/Email/i);
        fireEvent.change(emailInput, {target: {value: 'invalid-email'}});

        expect(await screen.findByText('Введите корректный email')).toBeInTheDocument();
    });

    test('phone is optional and masked with +7 prefix', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({detail: 'Обращение отправлено'}),
        });

        renderModal();

        const phoneInput = screen.getByLabelText(/Телефон/i);
        fireEvent.change(phoneInput, {target: {value: '+'}});
        expect(phoneInput.value).toBe('+7');
        fireEvent.change(phoneInput, {target: {value: ''}});
        expect(phoneInput.value).toBe('');

        fireEvent.change(screen.getByLabelText(/Email/i), {target: {value: 'ok@example.com'}});
        fireEvent.change(screen.getByLabelText(/Тема обращения/i), {target: {value: 'Нужна помощь'}});
        fireEvent.change(screen.getByLabelText(/Опишите ваш вопрос/i), {target: {value: 'Сообщение длиннее десяти символов'}});
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        const [, req] = global.fetch.mock.calls[0];
        const body = JSON.parse(req.body);
        expect(body.phone).toBe('');
    });

    test('message min length error appears on submit', async () => {
        renderModal();

        fireEvent.change(screen.getByLabelText(/Email/i), {target: {value: 'ok@example.com'}});
        fireEvent.change(screen.getByLabelText(/Тема обращения/i), {target: {value: 'Нужна помощь'}});
        const messageInput = screen.getByLabelText(/Опишите ваш вопрос/i);
        fireEvent.change(messageInput, {target: {value: 'коротко'}});

        const errorBeforeSubmit = getFieldErrorByInput(messageInput);
        expect(errorBeforeSubmit).toBeInTheDocument();
        expect(errorBeforeSubmit.classList.contains(styles.fieldErrorVisible)).toBe(false);

        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        await waitFor(() => {
            const errorAfterSubmit = getFieldErrorByInput(messageInput);
            expect(errorAfterSubmit.classList.contains(styles.fieldErrorVisible)).toBe(true);
            expect(errorAfterSubmit.textContent).toContain('Сообщение слишком короткое');
        });
    });

    test('shows field errors in dedicated row without extra blocks', async () => {
        renderModal();

        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        await screen.findByText('Укажите тему обращения');

        expect(document.querySelectorAll(`.${styles.fieldErrorVisible}`).length).toBeGreaterThanOrEqual(2);
        expect(document.querySelectorAll(`.${styles.legalError}`).length).toBe(1);
    });

    test('shows success state instead of alert after successful send', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({detail: 'Обращение отправлено'}),
        });
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

        renderModal();

        fireEvent.change(screen.getByLabelText(/Email/i), {target: {value: 'ok@example.com'}});
        fireEvent.change(screen.getByLabelText(/Тема обращения/i), {target: {value: 'Тема обращения'}});
        fireEvent.change(screen.getByLabelText(/Опишите ваш вопрос/i), {target: {value: 'Сообщение длиннее десяти символов'}});
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        expect(await screen.findByText('Сообщение отправлено')).toBeInTheDocument();
        expect(alertSpy).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });

    test('shows readable toast on smtp failure response', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({detail: 'Не удалось отправить обращение. Попробуйте позже'}),
        });

        renderModal();

        fireEvent.change(screen.getByLabelText(/Email/i), {target: {value: 'ok@example.com'}});
        fireEvent.change(screen.getByLabelText(/Тема обращения/i), {target: {value: 'Тема обращения'}});
        fireEvent.change(screen.getByLabelText(/Опишите ваш вопрос/i), {target: {value: 'Сообщение длиннее десяти символов'}});
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', {name: 'Отправить'}));

        await waitFor(() => {
            expect(mockNotify.error).toHaveBeenCalledWith('Не удалось отправить обращение. Попробуйте позже');
        });
    });
});
