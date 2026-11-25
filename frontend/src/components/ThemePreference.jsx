import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

const options = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor }
];

const ThemePreference = () => {
  const { getPreference, setPreference, subscribe } = window.tripSplitTheme;
  const preference = useSyncExternalStore(subscribe, getPreference);

  return (
    <fieldset className="theme-preference">
      <legend>Appearance</legend>
      <div className="theme-options">
        {options.map((option) => {
          const Icon = option.Icon;

          return (
            <label key={option.value} className="theme-option">
              <Icon size={18} aria-hidden="true" />
              <span>{option.label}</span>
              <input
                type="radio"
                name="appearance"
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
              />
            </label>
          );
        })}
      </div>
      <p>Saved on this device.</p>
    </fieldset>
  );
};

export default ThemePreference;
