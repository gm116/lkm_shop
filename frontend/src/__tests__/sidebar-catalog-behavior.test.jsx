import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import Sidebar from '../components/Sidebar';

function renderSidebar(overrides = {}) {
    const props = {
        categoryTree: [],
        selectedCategoryId: null,
        onSelectCategory: jest.fn(),
        priceMin: '',
        priceMax: '',
        priceBounds: {min: null, max: null},
        onApplyPrice: jest.fn(),
        onResetPrice: jest.fn(),
        sortValue: 'default',
        sortOptions: [{value: 'default', label: 'По умолчанию'}],
        onSelectSort: jest.fn(),
        brands: [],
        selectedBrandId: null,
        onSelectBrand: jest.fn(),
        characteristics: [],
        selectedCharacteristics: {},
        onToggleCharacteristic: jest.fn(),
        onClearFilters: jest.fn(),
        hasActiveFilters: false,
        ...overrides,
    };

    const view = render(<Sidebar {...props} />);
    return {props, ...view};
}

describe('Sidebar catalog behavior', () => {
    test('auto-expands parent category when selected category is child', () => {
        const categoryTree = [
            {
                id: 10,
                name: 'Автохимия',
                children: [{id: 11, name: 'Грунты'}],
            },
            {
                id: 20,
                name: 'Инструмент',
                children: [{id: 21, name: 'Пистолеты'}],
            },
        ];

        renderSidebar({categoryTree, selectedCategoryId: 11});

        expect(screen.getByRole('button', {name: 'Грунты'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Пистолеты'})).not.toBeInTheDocument();
    });

    test('category group hitbox is clickable for full block', () => {
        const onSelectCategory = jest.fn();
        const categoryTree = [
            {
                id: 100,
                name: 'Лаки',
                children: [{id: 101, name: 'Акриловые'}],
            },
        ];

        renderSidebar({categoryTree, onSelectCategory});

        const parentLabel = screen.getByText('Лаки');
        const group = parentLabel.closest('[role="button"]');
        fireEvent.click(group);

        expect(onSelectCategory).toHaveBeenCalledWith(100);
    });

    test('price input supports thousand separators and sends sanitized numbers', () => {
        const onApplyPrice = jest.fn();
        renderSidebar({onApplyPrice});

        const [minInput, maxInput] = screen.getAllByRole('textbox');
        fireEvent.change(minInput, {target: {value: '10000'}});
        fireEvent.change(maxInput, {target: {value: '250000'}});

        expect(minInput.value).toBe('10 000');
        expect(maxInput.value).toBe('250 000');

        fireEvent.click(screen.getByRole('button', {name: 'Применить'}));
        expect(onApplyPrice).toHaveBeenCalledWith('10000', '250000');
    });

    test('large amount of brands and characteristics is paged with show more controls', () => {
        const brands = Array.from({length: 14}, (_, i) => ({id: i + 1, name: `Brand-${i + 1}`, count: i + 1}));
        const characteristics = Array.from({length: 12}, (_, i) => ({
            name: `Характеристика-${i + 1}`,
            values: [{value: 'Да', count: 1}],
        }));

        renderSidebar({brands, characteristics});

        expect(screen.getByRole('button', {name: /Показать еще бренды/i})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Показать еще характеристики/i})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: /Показать еще бренды/i}));
        expect(screen.getByRole('button', {name: /Свернуть список брендов/i})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: /Показать еще характеристики/i}));
        expect(screen.getByRole('button', {name: /Свернуть характеристики/i})).toBeInTheDocument();
    });
});
