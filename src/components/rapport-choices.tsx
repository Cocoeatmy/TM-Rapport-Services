"use client";

interface RapportChoicesProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function RapportChoices({ options, value, onChange }: RapportChoicesProps) {
  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.replace(option, "").replace(/\n{2,}/g, "\n").trim());
    } else {
      onChange((value ? value + "\n" : "") + option);
    }
  };

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const isSelected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
              isSelected
                ? "border-[#1e3a5f] bg-blue-50 text-[#1e3a5f] font-medium dark:bg-blue-900/30"
                : "border-gray-200 bg-white text-gray-700 active:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-gray-600"
              }`}>
                {isSelected && <span className="text-white text-xs">✓</span>}
              </span>
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}
