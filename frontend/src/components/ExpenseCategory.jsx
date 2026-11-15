import { useEffect, useId, useState } from 'react';
import { BedDouble, Bus, Fuel, Mountain, Receipt, Tag, Utensils } from 'lucide-react';
import { expensesApi } from '../lib/api';
import CustomSelect from './CustomSelect';

const categories = [
  { key: 'fuel', label: 'Fuel', Icon: Fuel },
  { key: 'food_and_drink', label: 'Food & Drink', Icon: Utensils },
  { key: 'transport', label: 'Transport', Icon: Bus },
  { key: 'activities', label: 'Activities', Icon: Mountain },
  { key: 'accommodation', label: 'Accommodation', Icon: BedDouble }
];

export function ExpenseCategoryIcon({ category }) {
  const option = categories.find(({ key }) => key === category);
  const Icon = option?.Icon || Receipt;
  const label = option?.label || category || 'Uncategorized';

  return (
    <span className="expense-icon-wrap" role="img" aria-label={label} title={label}>
      <Icon size={24} color="var(--primary-color)" aria-hidden="true" />
    </span>
  );
}

function CategoryLabel({ icon, children }) {
  const Icon = icon;

  return (
    <span className="expense-category-label">
      <Icon size={16} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

const categoryOptions = [
  { value: '', label: <CategoryLabel icon={Tag}>Uncategorized</CategoryLabel> },
  ...categories.map(({ key, label, Icon }) => ({
    value: key,
    label: <CategoryLabel icon={Icon}>{label}</CategoryLabel>
  }))
];

export function ExpenseDescriptionField({
  description, onDescriptionChange, category, onCategoryChange, savedCategory, suggestForGroupId, placeholder
}) {
  const descriptionId = useId();
  const categoryLabelId = useId();
  const [suggestion, setSuggestion] = useState(null);
  const query = description.trim();
  const shouldSuggest = Boolean(suggestForGroupId && query && category === undefined);

  useEffect(() => {
    if (!shouldSuggest) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const { data } = await expensesApi.suggestCategory(suggestForGroupId, query, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestion({ groupId: suggestForGroupId, query, category: data.category });
        }
      } catch {
        // Saving also runs the suggestion rules if the preview is unavailable.
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, shouldSuggest, suggestForGroupId]);

  const suggestedCategory = shouldSuggest && suggestion?.query === query && suggestion.groupId === suggestForGroupId
    ? suggestion.category
    : null;
  const selectedCategory = category ?? savedCategory ?? suggestedCategory ?? '';
  const options = categoryOptions.some(({ value }) => value === selectedCategory)
    ? categoryOptions
    : [...categoryOptions, { value: selectedCategory, label: <CategoryLabel icon={Tag}>{selectedCategory}</CategoryLabel> }];

  return (
    <div className="expense-description-row">
      <div className="form-group">
        <label htmlFor={descriptionId}>Description</label>
        <input
          id={descriptionId}
          required
          placeholder={placeholder}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>
      <div className="form-group expense-category-field">
        <label id={categoryLabelId}>Category</label>
        <CustomSelect
          labelId={categoryLabelId}
          value={selectedCategory}
          options={options}
          onChange={onCategoryChange}
        />
      </div>
    </div>
  );
}
